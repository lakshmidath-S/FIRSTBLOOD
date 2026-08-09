-- AlterTable
ALTER TABLE "HospitalProfile" ADD COLUMN     "city" TEXT;

-- CreateIndex
CREATE INDEX "HospitalProfile_city_idx" ON "HospitalProfile"("city");
