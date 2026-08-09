# FIRSTBLOOD — Blood Donation Management Network
Project Plan v1

## 1. Roles

| Role | Auth | Core capability |
|---|---|---|
| Admin | email + password | oversee requests/transactions, fake-donor cleanup, analytics |
| Donor | email + password | set availability/location, respond to requests, donation history |
| Hospital | email + password | create/manage multiple simultaneous requests, track live donor location |
| Public (unregistered recipient) | phone + OTP (simulated) | create a broadcast request without registering |

## 2. Tech stack

- **Frontend:** React 18 + Vite, TailwindCSS, React Query (server cache), Zustand (client state), Socket.io-client, React Hook Form + Zod, Leaflet + OpenStreetMap tiles (free, no API key) for maps/live location, React Router.
- **Backend:** Node.js + Express, Socket.io (real-time), PostgreSQL via **Prisma** (schema-first models, generated type-safe client, built-in migrations) — chosen over Knex/raw `pg` because it's the easiest to reason about and maintain without prior ORM experience, and over hand-written SQL because it removes a whole class of query bugs. bcrypt, jsonwebtoken, Zod/Joi validation, node-cron (expiry sweeps, radius expansion, OTP cleanup, analytics refresh, no-show sweeps).
- **Geo:** PostgreSQL `cube` + `earthdistance` extensions for Haversine distance in SQL (lightweight, no extra infra, works on any free Postgres host).
- **Redis:** deferred. Not needed for a single-instance deployment; revisit only if/when you run multiple server instances (for the Socket.io adapter) or want OTP storage off Postgres.
- **LLM for admin analytics:** Gemini (`gemini-1.5-flash`, free tier) or Groq (Llama free tier), behind a single provider-agnostic interface so you can swap without touching callers.

### Keeping this fully free
- **Postgres:** Supabase or Neon free tier (both support the `cube`/`earthdistance` extensions).
- **Backend hosting:** Render or Railway free web service tier.
- **Frontend hosting:** Vercel or Netlify free tier.
- **Maps:** Leaflet + OpenStreetMap — no API key, no billing.
- **LLM:** Gemini or Groq free tier, called on a schedule (not per page-load) to stay inside free quotas.
- No paid SMS/push provider — OTP and alerts are simulated/in-app, as already planned.

## 3. Database schema (PostgreSQL)

```sql
-- shared identity + role
users (
  id UUID PK, role ENUM('admin','donor','hospital'),
  email TEXT UNIQUE, password_hash TEXT,
  phone TEXT, is_active BOOL DEFAULT true, is_banned BOOL DEFAULT false,
  created_at TIMESTAMPTZ
)

donor_profiles (
  user_id UUID PK FK -> users,
  full_name TEXT, blood_group TEXT, dob DATE, gender TEXT,
  last_donated_at TIMESTAMPTZ NULL,
  is_available BOOL DEFAULT true,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, location_updated_at TIMESTAMPTZ,
  total_donations INT DEFAULT 0, no_show_count INT DEFAULT 0,
  reliability_score NUMERIC GENERATED (donations / (donations+no_shows)),
  first_opted_at TIMESTAMPTZ, last_response_at TIMESTAMPTZ
)

hospital_profiles (
  user_id UUID PK FK -> users,
  hospital_name TEXT, registration_no TEXT, address TEXT,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, verified BOOL DEFAULT false
)

blood_requests (
  id UUID PK,
  created_by_user_id UUID FK -> users NULL,       -- hospital
  created_by_public_session_id UUID FK NULL,       -- public/OTP path
  blood_group TEXT, units_needed INT, units_claimed INT DEFAULT 0,
  urgency ENUM('critical','high','normal'),
  request_type ENUM('broadcast','specific'),
  status ENUM('open','partial','fulfilled','cancelled','expired'),
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, notes TEXT,
  search_radius_km INT DEFAULT 10,
  created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ
)

request_targets (             -- populated only for request_type = 'specific'
  request_id UUID FK, donor_id UUID FK, PRIMARY KEY(request_id, donor_id)
)

request_responses (           -- one row per donor alerted for a request
  id UUID PK, request_id UUID FK, donor_id UUID FK,
  status ENUM('alerted','accepted','declined','cancelled','completed','no_show'),
  distance_km NUMERIC, alerted_at TIMESTAMPTZ, responded_at TIMESTAMPTZ,
  eta_minutes INT
)

donation_transactions (       -- immutable log, source of truth for history/audit
  id UUID PK, request_id UUID FK, donor_id UUID FK, hospital_id UUID FK,
  units INT DEFAULT 1, status ENUM('completed','cancelled'),
  verified_by UUID FK -> users NULL, donated_at TIMESTAMPTZ, logged_at TIMESTAMPTZ
)

donor_location_pings (        -- only written while a response is 'accepted' + en route
  id UUID PK, request_id UUID FK, donor_id UUID FK,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, recorded_at TIMESTAMPTZ
)

notifications (
  id UUID PK, user_id UUID FK, request_id UUID FK NULL,
  type TEXT, title TEXT, body TEXT, channel ENUM('socket','in_app','sms_sim'),
  read_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ
)

public_otp_sessions (
  id UUID PK, phone TEXT, otp_hash TEXT, expires_at TIMESTAMPTZ,
  verified BOOL DEFAULT false, created_at TIMESTAMPTZ
)

audit_logs (
  id UUID PK, actor_id UUID FK NULL, action TEXT, entity_type TEXT,
  entity_id UUID, meta JSONB, created_at TIMESTAMPTZ
)
```

Key indexes: `donor_profiles(is_available)` partial index where `is_available`; geo index via `earthdistance` GiST on `ll_to_earth(lat,lng)` for donors and requests; `blood_requests(status, blood_group)`; `request_responses(request_id, status)`.

## 4. Matching & alert flow (distance-first priority)

1. Request created (hospital or public) with blood group, units needed, urgency, type, and location.
2. Eligibility query — compatible blood group AND `is_available = true` AND `is_banned = false` AND (`last_donated_at IS NULL OR last_donated_at <= now() - interval '90 days'`) — ranked by `earth_distance(ll_to_earth(donor.lat,donor.lng), ll_to_earth(request.lat,request.lng))`.
3. **Specific requests:** alert only the chosen donors, still ranked/shown by distance to the hospital.
4. **Broadcast requests:** alert the nearest donors within `search_radius_km`; if too few respond within a timeout window, a cron job widens the radius and re-queries.
5. Delivery: Socket.io event to room `donor:{id}` for online donors; a `notifications` row is written regardless so it's visible on next login (covers offline donors — this is your "crisp and attentive" alert: high-urgency color, blood group/units/distance/hospital name, one-tap Accept/Decline, visible countdown before the alert expires/reassigns).
6. **Accept:** atomic conditional update — `UPDATE blood_requests SET units_claimed = units_claimed + 1 WHERE id = $1 AND units_claimed < units_needed RETURNING *`. If it returns zero rows, the request already filled up (race lost gracefully) and the donor is told the slot is gone. This pattern is what keeps concurrent accepts on the same request — or across a hospital's multiple simultaneous requests — from ever double-booking, without needing explicit locks, since each request is an independent row and Postgres serializes conflicting updates on it automatically.
7. **Cancel after accepting:** response status → `cancelled`, `units_claimed` decremented in the same transaction, and the next-nearest untried eligible donor is alerted immediately (same query as step 2, excluding donors already in `request_responses` for this request).
8. Request reaches `fulfilled` once `units_claimed = units_needed`; remaining `alerted` responses for that request are closed out and their donors notified it's filled.

## 5. Live location for accepted donors

While a `request_responses` row is `accepted`, the donor's client pushes `lat/lng` over the socket roughly **once a minute** (deliberately coarse, not high-frequency GPS tracking) → server writes to `donor_location_pings` and re-broadcasts to `request:{id}` room → hospital/requester sees the donor's last-known marker on a Leaflet/OSM map plus a straight-line (Haversine) distance and rough ETA. This is an approximate "getting closer" indicator, not turn-by-turn accuracy — real routing ETA (OSRM/Google) stays a stretch goal since it isn't needed for the MVP and keeps the stack free.

## 6. Admin: fake/ghost donor cleanup

`donor_profiles.no_show_count` increments whenever a response sits at `accepted` past the expected window without a matching `donation_transactions` row. Admin dashboard surfaces donors where `no_show_count` exceeds a threshold, or who opted in but have zero completed donations after N months. Admin can deactivate/ban; action is written to `audit_logs`.

## 7. Admin analytics (Gemini/Groq)

A scheduled job (node-cron, e.g. daily) aggregates `donation_transactions` + `request_responses` into a compact JSON summary (fulfillment rate, avg response/ETA time, no-show rate, blood-group demand by region, trend vs. prior period), sends it to Gemini or Groq behind one `LLMProvider` interface, and caches the narrative summary for the admin dashboard. Aggregating first and calling the LLM on a schedule (not per page-load) keeps you well inside free-tier limits.

## 8. Auth

- Admin/Donor/Hospital: email + bcrypt password hash, JWT access + refresh tokens, role-checked middleware per route.
- Public: phone number → OTP generated and hashed into `public_otp_sessions` (simulated — the "sent" OTP is just returned/logged, no real SMS provider) → verify issues a short-lived, scope-limited JWT that can only create/view broadcast requests, nothing else.

## 9. Real-time infrastructure

Socket.io mounted on the same HTTP server as Express. Rooms: `donor:{donorId}`, `hospital:{hospitalId}`, `request:{requestId}`. Core events: `request:new`, `request:reassigned`, `request:fulfilled`, `donor:location_update`. A single Node instance comfortably handles hundreds of concurrent socket connections; add the `socket.io-redis` adapter only when you horizontally scale to multiple instances.

## 10. Suggested folder structure

```
FIRSTBLOOD/
  client/                  # React + Vite
    src/pages/ src/components/
    src/features/{auth,donor,hospital,admin,public}/
    src/hooks/ src/services/ (api + socket clients) src/store/
  server/
    src/config/ src/db/ (pool + migrations)
    src/modules/{auth,donors,hospitals,requests,notifications,admin,analytics}/
    src/sockets/ src/middleware/ src/utils/
    migrations/
  docs/
```

## 11. Build phases

1. **Foundation** — repo scaffold, Postgres schema/migrations, auth for all 4 roles.
2. **Donor core** — profile, availability + location updates, eligibility calc.
3. **Request lifecycle** — hospital/public request creation (broadcast/specific), eligibility+distance query, alert dispatch.
4. **Response flow** — accept/decline/cancel with the atomic-claim pattern, instant re-alert on cancellation.
5. **Live tracking** — donor location streaming, hospital-side live map/ETA.
6. **Admin tools** — dashboard, fake-donor detection/removal, audit log viewer.
7. **Analytics** — transaction aggregation + Gemini/Groq narrative summaries.
8. **Polish & load check** — notification UX pass, mobile responsiveness, a basic load test simulating ~100–200 concurrent donors/hospitals against the alert + accept flow before calling it done.

## Decisions locked in

- ORM: **Prisma**.
- Maps: **Leaflet + OpenStreetMap**.
- Live location refresh: **~1 minute**, approximate not precise.
- Redis: **deferred** until you need multi-instance scaling.
- Entire stack chosen to run on free tiers end to end.
