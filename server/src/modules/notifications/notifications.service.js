const prisma = require("../../config/db");
const { emitToDonor, emitToHospital } = require("../../sockets/emit");
const push = require("./push.service");

// Always persists the notification (so it's visible on next login even if
// the user is offline), then pushes it live over the socket if connected,
// then fires an FCM push so the mobile app can alert a phone with the app
// closed. Socket delivery is instant-but-only-while-connected; push is the
// fallback that actually reaches someone with the app in their pocket.
// This is the "crisp and attentive" alert path referenced in the plan.
async function notifyUser({ userId, requestId = null, type, title, body, deliverTo }) {
  const notification = await prisma.notification.create({
    data: { userId, requestId, type, title, body },
  });

  if (deliverTo === "donor") emitToDonor(userId, "notification:new", notification);
  else if (deliverTo === "hospital") emitToHospital(userId, "notification:new", notification);

  // Fire-and-forget: a slow or failing push must never delay/break the
  // request that triggered it (a donor accepting, a request being created).
  push
    .sendToUser(prisma, userId, {
      title,
      body,
      data: { type, requestId: requestId || "", notificationId: notification.id },
    })
    .catch((err) => console.error("[push] unexpected error:", err.message));

  return notification;
}

async function listForUser(userId) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

async function markRead(userId, notificationId) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
}

// Called by the mobile app on every launch/login. `installId` is generated
// locally by the app and is stable for the lifetime of the install, so this
// works with or without Firebase — which matters because donor eligibility
// depends on a Device row existing, not on push being configured.
//
// Upsert on installId so re-registering re-points that handset at whoever is
// currently logged in (shared phone, or logout and back in). A rotated FCM
// token is picked up here too.
//
// pushToken is unique across devices, so a token that FCM has reassigned to
// another install is detached from its old row first rather than blowing up
// on the constraint.
async function registerDevice(userId, { installId, pushToken, platform }) {
  if (pushToken) {
    await prisma.device.updateMany({
      where: { pushToken, installId: { not: installId } },
      data: { pushToken: null },
    });
  }

  return prisma.device.upsert({
    where: { installId },
    update: { userId, pushToken: pushToken || null, platform, lastSeenAt: new Date() },
    create: { userId, installId, pushToken: pushToken || null, platform },
  });
}

// Called on logout so a signed-out phone stops receiving that user's alerts.
// Scoped to userId so one user can't unregister another's device by guessing
// an installId.
async function unregisterDevice(userId, installId) {
  await prisma.device.deleteMany({ where: { installId, userId } });
  return { ok: true };
}

module.exports = { notifyUser, listForUser, markRead, registerDevice, unregisterDevice };
