-- Replaces DeviceToken with Device.
--
-- DeviceToken keyed a row on the FCM push token, which conflates two
-- different things: "the app is installed" and "push is currently working".
-- Donor eligibility now depends on the former, so the app needs to be able to
-- register itself even with no Firebase config and no push token.
--
-- A straight drop/recreate is safe here: DeviceToken was introduced in the
-- immediately preceding migration and holds nothing but ephemeral FCM tokens,
-- which every client re-registers on its next launch anyway.

-- DropTable
DROP TABLE IF EXISTS "DeviceToken";

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "pushToken" TEXT,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_installId_key" ON "Device"("installId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_pushToken_key" ON "Device"("pushToken");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
