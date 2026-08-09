# FIRSTBLOOD

Blood donation management network — Admin, Donor, Hospital, and unregistered Public roles. See `PROJECT_PLAN.md` (one level up) for the full design writeup.

## What's built

- **server/** — Node + Express + Socket.io + Prisma/PostgreSQL. Auth (email/password for Admin/Donor/Hospital, simulated OTP for Public — admin is seed-only, not self-registerable; hospitals set their city + location once at registration), donor availability/location/city, distance-ranked matching (compatible blood group + 90-day eligibility + earthdistance) with a second **city-scoped broadcast mode** (alert every eligible donor registered in a chosen city, e.g. "Kochi", instead of by radius), concurrency-safe accept/cancel with instant re-alert, live location pings, admin ghost-donor flagging + ban, Gemini/Groq analytics narrative plus a richer live stats payload (time series, status/urgency/response-outcome breakdowns, top cities, donor/hospital counts) for the admin charts.
- **client/** — React + Vite + Tailwind, restyled with a shared UI kit (`src/components/ui.jsx`: Button/Card/Badge/Input/SegmentedToggle/StatCard/etc.), Inter font, and lucide-react icons. Landing page with a clear hero + prominent "Register" CTA, login/register (donor/hospital only — hospitals set city + location during signup), public OTP request flow, donor dashboard (availability toggle, location + city, alerts, accept/decline/cancel), hospital dashboard (edit saved city/location, create requests choosing radius-vs-city broadcast — reusing the hospital's own saved location every time, live Leaflet/OSM map of accepted donors, mark donated/no-show), admin dashboard (recharts trend/bar/pie charts for requests over time, blood-group demand, status breakdown, donor response funnel, top cities, plus a properly-rendered LLM insights panel with a separate recommendations list).

- **mobile/** — Flutter app (Android/iOS) covering all four roles against the same backend, with real push notifications so a donor is alerted even with the app closed. See [mobile/README.md](mobile/README.md) for setup. The web client is unchanged and still works; the two share one API.

Everything below is designed to run on free tiers.

## 1. Get a free Postgres database

Use [Neon](https://neon.tech) or [Supabase](https://supabase.com) (free tier, both support the `cube`/`earthdistance` extensions Prisma will enable automatically). Copy the connection string.

## 2. Server setup

```bash
cd server
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — your Neon/Supabase connection string.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (run it twice for two different values).
- `LLM_PROVIDER` — `"groq"` or `"gemini"`, plus the matching API key (both have free tiers: [Groq console](https://console.groq.com), [Google AI Studio](https://aistudio.google.com/apikey)).

Then:

```bash
npm install
npx prisma migrate dev --name init   # creates tables + enables cube/earthdistance
npm run seed                         # creates a default admin login (see below)
npm run dev                          # starts on :4000
```

Migrations are committed under `server/prisma/migrations/`, so `npx prisma migrate dev` (or
`migrate deploy` in production) picks up every schema change — including the newer `city` columns
on donors/hospitals/requests, the `Device` table backing the mobile-app requirement, and OTP
attempt tracking.

Note: `npm install` and `prisma migrate` need real internet access to Prisma's engine binaries — this was built and syntax-checked in a network-restricted sandbox, so run these two steps on your own machine.

**Default admin login** (from `npm run seed`): `admin@fb.com` / `fbadmin@123`. This is a well-known placeholder, not a real secret — change the password after your first login (no "change password" endpoint exists yet, so for now that means updating it directly in the database or re-registering).

**Credentials PDF**: `FIRSTBLOOD_Test_Credentials.pdf` is git-ignored — a file full of
email/password pairs doesn't belong in version control even when the accounts are throwaway. It's
regenerable at any time from `server/prisma/test-data.json`.

**Demo/test data**: `npm run seed:test-data` adds 50 donors + 5 hospitals scattered around Kochi, Ernakulam, Kakkanad, Aluva, and nearby towns — enough to actually exercise the radius/city matching and see multiple donors respond to a request. All donor logins share the password `Donor@123`, all hospital logins share `Hospital@123`; the full list of emails is in the credentials PDF Claude generated alongside this. Safe to re-run (upserts by email). This is throwaway test data, not real people — don't run it against a production database.

## 3. Client setup

```bash
cd client
cp .env.example .env   # defaults already point at localhost:4000
npm install
npm run dev             # starts on :5173
```

Open http://localhost:5173. Register a Hospital and a Donor account, set the donor's location + availability, then create a request from the hospital side to see the alert flow end to end.

## 4. Who uses which client

| Role | Web | Mobile |
|---|---|---|
| Donor | Profile, availability, location, city, response history | **Required to be matched** — see below |
| Hospital | Full | Full |
| Admin | Full | Full |
| Public recipient (OTP) | Full | Full |

**Donors are only matched if the mobile app is installed.** They can register and manage
everything from the web, but they won't enter the matching pool until they've signed in on the
app at least once. The reasoning: a blood request is time-critical, and a closed browser tab
can't be notified — a web-only donor would be silently unreachable while still occupying a slot
in every search, pushing genuinely reachable donors further down the list. The web donor
dashboard shows a banner explaining this, plus a live "visible to donor searches" indicator.

Eligibility tracks *app installed*, not *push working*: a donor who denies notification
permission stays matchable and just sees alerts when they open the app. Set
`REQUIRE_DONOR_MOBILE_APP=false` to turn the rule off (web-only demo, or while migrating an
existing donor base onto the app).

## Security notes

- **Rate limiting** on login/registration (20 / 15 min per IP), OTP requests (10 / hour per IP,
  plus 5 / hour per phone number), and a general backstop. In-memory and per-instance — revisit
  with Redis if you run more than one server.
- **OTP hardening**: 5 wrong guesses burns the session; error messages don't distinguish
  "wrong code" from "no such session".
- **The OTP is only echoed in the API response outside production.** Set `NODE_ENV=production`
  on your host — otherwise anyone could mint a session for any phone number they can type. A
  real SMS provider is still the missing piece before this flow is production-usable.
- **The server refuses to boot in production without real JWT secrets** — the dev fallbacks are
  in this public repo, so silently using them would let anyone forge an admin token.
- **Request reads are scoped to participants.** Donors see only their own response row on a
  request they were alerted for; requester phone numbers are never returned.
- **Socket rooms are authorized**, not just authenticated — those rooms carry donors' live
  coordinates, so only the requester (or an admin) can join.
- **Helmet** security headers and a 100kb body cap.

See [TEST_PLAN.md](TEST_PLAN.md) for the manual test matrix, including regression cases for
each of the above.

## Schema notes

The schema distinguishes two kinds of duplicated data, and keeps only one of them:

**Kept — maintained denormalisations on hot read paths**
- `BloodRequest.unitsClaimed` — load-bearing for correctness, not just speed: the atomic
  conditional UPDATE on this column is what makes concurrent accepts safe.
- `DonorProfile.totalDonations` / `noShowCount` — incrementally maintained counters, read on
  matching and flagging.
- `DonationTransaction.hospitalId` — denormalised from `request.createdByUserId` so a hospital's
  donation history is one indexed lookup instead of a join through requests.
- `RequestResponse.etaMinutes` — a snapshot derived from `distanceKm` at accept time, read on
  every dashboard render.

**Removed — stored twice, or stored and never read** (migration
`20260809160000_drop_redundant_columns`)
- `RequestTarget` table — backed the removed "target specific donors" feature; dead.
- `BloodRequest.requestType` — identical on every row now that all requests are broadcasts.
- `DonationTransaction.units` (always 1), `.status` (always COMPLETED — a cancellation creates
  no row at all), `.loggedAt` (always equal to `donatedAt`).
- `Notification.channel` — always the same value, and a notification now fans out over socket
  *and* push, so one channel column never described reality.
- `DonorProfile.firstOptedAt` — always equal to `User.createdAt`.
- `DonorProfile.lastResponseAt` — duplicated `RequestResponse.respondedAt`, and was read by the
  flagged-donor query but **never written**, so that query treated every donor as permanently
  inactive. Now derived from the responses themselves, which also fixes the bug.

## Known MVP limitations / good next steps

- **No automated test suite** — `TEST_PLAN.md` is a manual checklist. Concurrency (§5) and
  access control (§7) are the two areas most worth automating first.
- **No SMS provider** — the public OTP flow can't actually deliver a code in production yet.
- **ETA is straight-line, not routed** — real turn-by-turn ETA (OSRM/Google Directions) was deliberately left out to keep the stack free and simple; see plan §5.
- **No refresh-token rotation endpoint yet** — the client only uses the access token (2h expiry); add `/api/auth/refresh` before this goes further than a demo.
- **Redis / horizontal scaling** — deferred per plan; fine for hundreds of concurrent users on one instance, revisit if you deploy multiple server instances.
- **Radius-widening and expiry cron** run every 5 minutes (`server/src/jobs/cron.js`) — tune as needed. City-scoped broadcasts skip radius widening since they already alert everyone in the city in one wave.
- **City name matching is exact (case-insensitive)** — a donor set to "Kochi" won't match a request broadcast to "Ernakulam" even if they overlap geographically, and reverse geocoding (via OSM Nominatim's free API) occasionally returns a district/county name instead of a city. Donors can always correct their city manually.
