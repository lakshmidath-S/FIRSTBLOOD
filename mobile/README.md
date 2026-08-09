# FIRSTBLOOD — Flutter mobile app

A native Android/iOS client for the same FIRSTBLOOD backend the web app uses. Every role is
covered: Donor, Hospital, Admin, and the no-account (phone/OTP) recipient flow.

**Why this exists:** the web client can only alert a donor while a browser tab is open and
connected. A phone can be alerted with the app closed, which is the difference between a donor
seeing an urgent request in 20 seconds and seeing it tomorrow.

> **Donors must install this app to be matched.** They can register and manage their profile
> entirely on the web, but they don't enter the matching pool until they've signed in here at
> least once. The app registers a locally-generated **install id** on login — deliberately
> separate from the FCM push token, so a donor who denies notification permission (or a build
> with no Firebase config) still counts as reachable and just sees alerts on opening the app.
> Hospitals, admins, and public recipients are free to use either client.

## What's here

```
lib/
  config/       env.dart (API URLs), theme.dart (mirrors the web Tailwind palette)
  models/       Dart mirrors of the API's JSON
  services/     api_client (Dio + JWT), socket_service, notification_service,
                location_service (GPS + OSM reverse geocode), services.dart (one fn per endpoint)
  state/        auth_store.dart (session persistence + login/logout side effects)
  widgets/      ui.dart (AppButton/AppCard/AppBadge/StatCard/SegmentedToggle/…)
  screens/      landing, auth/, public/, donor/, hospital/, admin/
```

Feature parity with the web client, including: donor availability + city, ~1/min en-route
location pings, hospital radius-vs-city broadcasts reusing the saved profile location, live
request tracking over sockets, donation/no-show confirmation with the same ownership rules, and
the admin analytics dashboard with charts (fl_chart) and the parsed LLM insights panel.

## 1. Prerequisites

- Flutter **3.27+** (Dart 3.6+) — `flutter --version`
- Android Studio / Xcode for the platform toolchains

## 2. Generate the platform folders

`android/` and `ios/` are **not** committed (they're mostly generated boilerplate). Create them
once, from inside `mobile/`:

```bash
flutter create .
flutter pub get
```

## 3. Android permissions

`flutter create` writes a minimal manifest. Add these to
`android/app/src/main/AndroidManifest.xml`, inside `<manifest>` and above `<application>`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
```

For iOS, add to `ios/Runner/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Used to match you with blood requests near you.</string>
```

## 4. Point it at a backend

Defaults target the deployed Render backend, so `flutter run` works out of the box on a real
device. To run against a local server:

```bash
flutter run \
  --dart-define=API_URL=http://10.0.2.2:4000/api \
  --dart-define=SOCKET_URL=http://10.0.2.2:4000
```

`10.0.2.2` is how the **Android emulator** reaches your host machine — `localhost` there means
the emulator itself. On a physical phone, use your computer's LAN IP instead.

Note the `/api` suffix on `API_URL` and its absence on `SOCKET_URL`: REST routes are mounted
under `/api/*`, but Socket.IO attaches to the bare HTTP server.

## 5. Push notifications (optional but recommended)

Without Firebase the app still works fully — alerts arrive over the socket and render as real
system notifications **while the app is running**. Firebase adds the part that matters most:
alerts that reach a phone with the app closed.

1. Create a Firebase project, add an Android app (and iOS app if needed) with your bundle ID.
2. Download `google-services.json` → `android/app/google-services.json`
   (and `GoogleService-Info.plist` → `ios/Runner/` for iOS). Both are gitignored — they should
   not be committed.
3. Register the app with FlutterFire so `firebase_options.dart` is generated:
   ```bash
   dart pub global activate flutterfire_cli
   flutterfire configure
   ```
4. On the **backend**, set `FIREBASE_SERVICE_ACCOUNT` (Render → Environment) to your Firebase
   service-account JSON, base64-encoded:
   ```bash
   base64 -w0 serviceAccountKey.json
   ```
   Then `npm install` on the server so `firebase-admin` is present, and redeploy.

If `FIREBASE_SERVICE_ACCOUNT` is unset the backend logs that push is disabled and silently skips
it — sockets keep working, so nothing breaks for the web client or local dev.

### How an alert reaches a donor

| Path | When it fires | Rendered by |
|---|---|---|
| FCM push | app closed or backgrounded | Android/iOS directly |
| FCM foreground | app open (OS suppresses its own banner) | `flutter_local_notifications` |
| Socket `notification:new` | app open and connected | `flutter_local_notifications` |

The last two can both fire for one server event, so alerts are de-duplicated on the
server-generated notification id.

## 6. Run

```bash
flutter run                 # debug
flutter build apk --release # Android release build
```

Seeded test logins (from `server/prisma/seed-test-data.js`) work here too — all donors share
`Donor@123`, hospitals `Hospital@123`, admin is `admin@fb.com` / `fbadmin@123`.

## Known gaps

- **No in-app notification centre.** Alerts are transient; the dashboards show current state
  instead. `GET /api/notifications` exists server-side if you want to build one.
- **Android/iOS folders are generated, not committed**, so app icons, splash screens, and the
  bundle ID are whatever `flutter create` produces until you customise them.
- **iOS push needs an APNs key** uploaded to Firebase on top of step 5; Android works with just
  `google-services.json`.
- **Not compiled.** This was written in an environment without the Flutter toolchain — syntax
  and the API contract were verified statically, but expect a few analyzer fixes on first
  `flutter run`, most likely package-version drift in `fl_chart` or `flutter_map`.

See [../TEST_PLAN.md](../TEST_PLAN.md) §10 for the mobile test checklist.
