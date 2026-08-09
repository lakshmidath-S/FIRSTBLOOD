// Firebase Cloud Messaging sender for the Flutter app.
//
// Why this exists: the web client only ever gets alerts while a socket is
// connected — close the tab and the donor stops hearing about requests. The
// mobile app needs to buzz a phone that's in someone's pocket with the app
// swiped away, and that requires a real push service.
//
// Degrades gracefully on purpose: if FCM isn't configured (no service
// account in the env), every send is a silent no-op and the socket path
// still works exactly as before. That keeps local dev and the existing web
// deployment running with zero extra setup — you only need Firebase
// credentials when you actually want push-to-a-closed-app.
let messaging = null;
let initAttempted = false;

function initMessaging() {
  if (initAttempted) return messaging;
  initAttempted = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) {
    console.log("[push] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled (sockets still work).");
    return null;
  }

  try {
    // Required lazily so the dependency is optional: a deployment that never
    // sets FIREBASE_SERVICE_ACCOUNT doesn't need firebase-admin installed.
    const admin = require("firebase-admin");
    // The service-account JSON is stored as a single env var. Accept both raw
    // JSON and base64 (Render/Vercel dashboards mangle multi-line values, so
    // base64 is usually the practical choice).
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const credentials = JSON.parse(json);

    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(credentials) });
    }
    messaging = admin.messaging();
    console.log("[push] Firebase Cloud Messaging initialised.");
  } catch (err) {
    console.error("[push] Failed to initialise FCM — continuing without push:", err.message);
    messaging = null;
  }
  return messaging;
}

// Sends to every device token registered for a user. Tokens FCM reports as
// dead are pruned so the table doesn't accumulate stale reinstalls.
async function sendToUser(prisma, userId, { title, body, data = {} }) {
  const fcm = initMessaging();
  if (!fcm) return { sent: 0, skipped: true };

  // Only devices that actually have a push token — an install registered
  // without Firebase still counts for eligibility, it just can't be pushed to.
  const devices = await prisma.device.findMany({
    where: { userId, pushToken: { not: null } },
    select: { pushToken: true },
  });
  if (devices.length === 0) return { sent: 0, skipped: false };
  const tokens = devices.map((d) => ({ token: d.pushToken }));

  // FCM data payloads must be all-strings.
  const stringData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
  );

  try {
    const res = await fcm.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      data: stringData,
      android: {
        priority: "high",
        notification: { channelId: "firstblood_alerts", sound: "default" },
      },
      apns: {
        payload: { aps: { sound: "default" } },
        headers: { "apns-priority": "10" },
      },
    });

    const dead = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument") {
        dead.push(tokens[i].token);
      }
    });
    // Clear dead push tokens but keep the Device row: the app is still
    // installed (so the donor stays eligible), it just needs to hand us a
    // fresh token on its next launch.
    if (dead.length) {
      await prisma.device.updateMany({
        where: { pushToken: { in: dead } },
        data: { pushToken: null },
      });
    }

    return { sent: res.successCount, skipped: false };
  } catch (err) {
    // Never let a push failure break the request that triggered it — the
    // notification row is already persisted and the socket already fired.
    console.error("[push] send failed:", err.message);
    return { sent: 0, skipped: false, error: err.message };
  }
}

module.exports = { sendToUser };
