-- AlterTable
ALTER TABLE "BloodRequest" ADD COLUMN     "city" TEXT;

-- AlterTable
ALTER TABLE "DonorProfile" ADD COLUMN     "city" TEXT;

-- CreateIndex
CREATE INDEX "DonorProfile_city_idx" ON "DonorProfile"("city");
