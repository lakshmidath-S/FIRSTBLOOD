-- Removes data that was stored but never used, or stored twice.
--
-- Each drop below, and why it was redundant:
--
--   RequestTarget               Backed "target these specific donors", which was
--                               removed from the product. Nothing has written to
--                               it since; it was a dead table.
--
--   BloodRequest.requestType    Every request is a broadcast now, so the column
--                               held the identical value on every row. Scope is
--                               already expressed by city-vs-searchRadiusKm.
--
--   DonationTransaction.units   Always 1 (one donor, one donation) and never
--                               read. Units are counted on BloodRequest.unitsClaimed.
--
--   DonationTransaction.status  Only ever COMPLETED — a cancelled donation
--                               produces no row at all, it's recorded on
--                               RequestResponse.status instead.
--
--   DonationTransaction.loggedAt Always identical to donatedAt (both defaulted to
--                               now() and were written in the same statement),
--                               and never read.
--
--   Notification.channel        Always the same value, never read. A notification
--                               now fans out over socket *and* push, so a single
--                               channel column doesn't describe reality anyway.
--
--   DonorProfile.firstOptedAt   Always identical to the owning User.createdAt,
--                               since both rows are created in one transaction.
--
--   DonorProfile.lastResponseAt Duplicated RequestResponse.respondedAt — and was
--                               read by the flagged-donor query but never written
--                               by anything, so it silently reported every donor
--                               as never having responded. Now derived from the
--                               responses themselves.
--
-- Deliberately kept: totalDonations, noShowCount, unitsClaimed and
-- DonationTransaction.hospitalId. Those are maintained denormalisations on hot
-- read paths (and unitsClaimed is load-bearing for concurrency), not accidents.

-- DropTable
DROP TABLE IF EXISTS "RequestTarget";

-- AlterTable
ALTER TABLE "BloodRequest" DROP COLUMN IF EXISTS "requestType";

-- AlterTable
ALTER TABLE "DonationTransaction"
  DROP COLUMN IF EXISTS "units",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "loggedAt";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN IF EXISTS "channel";

-- AlterTable
ALTER TABLE "DonorProfile"
  DROP COLUMN IF EXISTS "firstOptedAt",
  DROP COLUMN IF EXISTS "lastResponseAt";

-- DropEnum (now unreferenced)
DROP TYPE IF EXISTS "RequestType";
DROP TYPE IF EXISTS "TransactionStatus";
DROP TYPE IF EXISTS "NotificationChannel";

-- CreateIndex: replaces DonorProfile.lastResponseAt for the "recently active
-- donor" check in the flagged-donor query.
CREATE INDEX IF NOT EXISTS "RequestResponse_donorId_respondedAt_idx"
  ON "RequestResponse"("donorId", "respondedAt");
