# FIRSTBLOOD — Test Plan

Manual test plan covering the four roles, the concurrency-critical paths, and the
security fixes. There is no automated test suite yet (see *Gaps* at the end), so
this is the checklist to work through before a release.

**Setup for all sections**

```bash
cd server && npm install && npx prisma migrate dev && npm run seed && npm run seed:test-data && npm run dev
cd client && npm install && npm run dev
```

Test accounts: admin `admin@fb.com` / `fbadmin@123`; 50 donors sharing `Donor@123`;
5 hospitals sharing `Hospital@123` (full list in `FIRSTBLOOD_Test_Credentials.pdf`).

---

## 1. Donor eligibility & the mobile-app requirement

| # | Steps | Expected |
|---|---|---|
| 1.1 | Register a new donor on the **web only**. Open the donor dashboard. | Amber banner: "Install the mobile app to start receiving requests". Status line reads "Not currently appearing in donor searches". |
| 1.2 | As a hospital in the same city, create a request matching that donor's blood group. | The web-only donor is **not** alerted. |
| 1.3 | Log in as that donor on the **mobile app**. Reload the web dashboard. | Banner gone; status reads "Visible to donor searches". |
| 1.4 | Repeat 1.2. | Donor is now alerted (in-app, plus push if Firebase is configured). |
| 1.5 | Deny notification permission on the phone, then create another matching request. | Donor is **still matched** — eligibility depends on the app being installed, not on push working. |
| 1.6 | Log out on mobile. Create another matching request. | Donor is no longer matched (logout unregisters the install). |
| 1.7 | Set `REQUIRE_DONOR_MOBILE_APP=false`, restart, repeat 1.2. | Web-only donor **is** matched; banner disappears from the dashboard. |
| 1.8 | Confirm hospital, admin, and public users are unaffected throughout. | All three work fully on web with no app installed. |

## 2. Auth

| # | Steps | Expected |
|---|---|---|
| 2.1 | Register donor with a password under 8 chars. | 400, validation error. |
| 2.2 | Register hospital without setting city/location. | 400: hospital city/location required. |
| 2.3 | Register with an already-used email. | 409, no duplicate user created. |
| 2.4 | Log in with a wrong password. | 401 "Invalid email or password" — same message as an unknown email (no user enumeration). |
| 2.5 | Log in 21 times in 15 min from one IP. | 429 after ~20 attempts. |
| 2.6 | Log in as a banned donor. | 403 "This account has been suspended". |
| 2.7 | Call any authenticated endpoint with an expired/garbage token. | 401; web client logs out automatically. |

## 3. Public (OTP) flow

| # | Steps | Expected |
|---|---|---|
| 3.1 | Request an OTP in dev. | Response contains `otp` (simulated delivery). |
| 3.2 | Set `NODE_ENV=production`, restart, request an OTP. | Response **omits** `otp`; server logs that no SMS provider is configured. |
| 3.3 | Enter a wrong OTP 6 times. | 429 after 5 misses; session burned, a new code is required. |
| 3.4 | Request 6 codes for the same phone within an hour. | 429 on the 6th. |
| 3.5 | Verify a correct OTP, then reuse the same code. | 400 "already been used". |
| 3.6 | Verify an expired (>5 min) OTP. | 400 "Invalid or expired code". |
| 3.7 | Broadcast a request, then log out and re-verify the same phone. | Previous requests still listed (history is keyed on phone, not session). |

## 4. Request creation & matching

| # | Steps | Expected |
|---|---|---|
| 4.1 | Hospital creates a radius request. | No location prompt; uses the hospital's saved coordinates. Nearest eligible donors alerted, closest first. |
| 4.2 | Hospital creates a "everyone in my city" request. | Every eligible donor whose city matches (case-insensitive) is alerted, regardless of distance. |
| 4.3 | Hospital with no city set picks the city option. | Blocked with a message pointing at the dashboard. |
| 4.4 | Create a request for a blood group with no compatible donors. | Request created, zero alerts, no crash. |
| 4.5 | Donor who donated 30 days ago. | Not alerted (90-day rule). |
| 4.6 | Donor with availability off. | Not alerted. |
| 4.7 | Leave a radius request unfilled past the cron interval. | Radius widens (up to 50 km) and a new wave is alerted; city-scoped requests do **not** widen. |
| 4.8 | Let a request pass `expiresAt`. | Status becomes EXPIRED. |

## 5. Concurrency (the correctness-critical part)

| # | Steps | Expected |
|---|---|---|
| 5.1 | Request needing 1 unit; two donors tap Accept simultaneously. | Exactly one succeeds; the other gets 409 "already been fulfilled". `unitsClaimed` never exceeds `unitsNeeded`. |
| 5.2 | Request needing 3 units; 5 donors accept at once. | Exactly 3 succeed, status becomes FULFILLED. |
| 5.3 | An accepted donor cancels. | Unit released, status returns to OPEN/PARTIAL, next-nearest untried donor alerted immediately. |
| 5.4 | Mark an accepted donor as a no-show. | Unit released, `noShowCount` incremented, re-alert dispatched. |
| 5.5 | One hospital runs several open requests at once. | Each tracks its own units independently. |

## 6. Donation confirmation & ownership

| # | Steps | Expected |
|---|---|---|
| 6.1 | Hospital marks a donor donated on **its own** request. | Succeeds; `totalDonations` +1, `lastDonatedAt` set, donor becomes ineligible for 90 days. |
| 6.2 | Hospital A tries to confirm on hospital B's request. | 403 "You can only manage your own requests". |
| 6.3 | Public requester confirms on their own request. | Succeeds (no `verifiedById`, since an OTP session has no User row). |
| 6.4 | Public session tries to confirm on someone else's request. | 403. |
| 6.5 | A donor tries to call the complete endpoint. | 403. |
| 6.6 | Confirm a response that isn't ACCEPTED. | 409. |

## 7. Access control (regression tests for fixed issues)

| # | Steps | Expected |
|---|---|---|
| 7.1 | Donor B requests `GET /api/requests/{id}` for a request they were never alerted for. | **403** — previously any authenticated user could read any request. |
| 7.2 | Donor A (who *was* alerted) reads that request. | 200, but `responses` contains **only their own row** — no other donors' names or distances. |
| 7.3 | Any client inspects a request response. | No `createdByPublic` / requester phone number in the payload. |
| 7.4 | Socket: donor emits `request:subscribe` for a request they don't own. | Join refused; **no** `donor:location_update` events received. Previously any socket could watch any donor's live coordinates. |
| 7.5 | Socket: hospital subscribes to its own request. | Join accepted, receives updates and donor pings. |
| 7.6 | Socket: connect with no/invalid token. | Connection rejected at the handshake. |
| 7.7 | Donor calls any `/api/admin/*` route. | 403. |
| 7.8 | Unauthenticated call to `/api/admin/analytics`. | 401. |
| 7.9 | User A calls `PATCH /api/notifications/{B's id}/read`. | No rows updated (scoped by userId). |
| 7.10 | Public OTP session posts to `/api/notifications/devices`. | 403 — device registration requires a real account. |
| 7.11 | User A tries to unregister an installId belonging to user B. | No rows deleted. |

## 8. Configuration & deployment safety

| # | Steps | Expected |
|---|---|---|
| 8.1 | Start with `NODE_ENV=production` and no `JWT_ACCESS_SECRET`. | Server **refuses to boot** with a clear message (the fallback secret is public in this repo). |
| 8.2 | Set both JWT secrets to the same value. | Refuses to boot. |
| 8.3 | Inspect response headers. | Helmet headers present (`X-Content-Type-Options`, etc.). |
| 8.4 | Request from an origin not in `CLIENT_ORIGIN`. | Blocked by CORS. |
| 8.5 | Set `CLIENT_ORIGIN` to a comma-separated list. | All listed origins accepted. |
| 8.6 | POST a >100kb JSON body. | 413. |
| 8.7 | Start with no `FIREBASE_SERVICE_ACCOUNT`. | Logs that push is disabled; sockets and everything else work normally. |

## 9. Admin dashboard

| # | Steps | Expected |
|---|---|---|
| 9.1 | Create a request while the admin dashboard is open. | Stat cards and charts update within ~20s (or instantly via socket) without a manual refresh. |
| 9.2 | Compare the "Requests" stat against the recent-requests list. | Counts agree (stats are computed live; only the LLM narrative is cached). |
| 9.3 | Click "Refresh insights". | Narrative regenerates; `generatedAt` updates. |
| 9.4 | View with an empty database. | Charts show empty states, no crash or NaN. |
| 9.5 | Ban a flagged donor, then run a matching request. | Banned donor is not alerted. |
| 9.6 | Break the LLM key deliberately. | Narrative shows an inline "unavailable" message; charts and stats still render. |

## 10. Mobile app

| # | Steps | Expected |
|---|---|---|
| 10.1 | Fresh install, log in as a donor. | Install registered; donor becomes matchable. |
| 10.2 | Background the app, trigger a matching request. | Push notification arrives (requires Firebase configured both sides). |
| 10.3 | Foreground the app, trigger a request. | Exactly **one** alert shown — the socket and FCM copies are de-duplicated. |
| 10.4 | Accept a request, then watch the hospital's map. | Donor marker appears and updates roughly once a minute. |
| 10.5 | Kill the app while an accepted response is active. | Location pings stop; no crash on relaunch. |
| 10.6 | Airplane mode, then reconnect. | Socket reconnects automatically; dashboard repopulates. |
| 10.7 | Force-quit and relaunch. | Session restored from storage, lands on the correct role dashboard. |
| 10.8 | Deny location permission. | Clear, actionable message; the rest of the app still works. |
| 10.9 | Run against a cold-started Render instance. | Slow first request succeeds rather than timing out (60s client timeout). |

---

## Gaps / not covered

- **No automated tests.** Everything above is manual. The highest-value things to
  automate first are §5 (concurrency — genuinely hard to verify by hand) and §7
  (access control — easy to regress silently).
- **§5 concurrency is hard to trigger manually.** Use parallel `curl`, or a small
  script firing simultaneous accepts, rather than clicking fast in two browsers.
- **Rate limits are per-instance and in-memory**, so they reset on deploy and
  don't hold across multiple instances. Fine for one Render dyno; revisit with
  Redis if you scale out.
- **No load testing** against the "hundreds of concurrent users" goal.
- **iOS push untested** — needs an APNs key uploaded to Firebase.
