-- AlterTable: track failed OTP verifications so a session can be burned
-- after a few misses instead of allowing unlimited guesses.
ALTER TABLE "PublicOtpSession" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: supports the per-phone OTP request rate limit.
CREATE INDEX "PublicOtpSession_phone_createdAt_idx" ON "PublicOtpSession"("phone", "createdAt");
