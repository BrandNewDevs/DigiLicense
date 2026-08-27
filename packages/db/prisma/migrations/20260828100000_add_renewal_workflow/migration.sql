CREATE TYPE "RenewalReason" AS ENUM ('EXPIRING_SOON', 'RECENTLY_EXPIRED');

ALTER TABLE "DrivingLicenceRecord"
  ADD COLUMN "vehicleClass" TEXT NOT NULL DEFAULT 'LIGHT_MOTOR_VEHICLE',
  ADD COLUMN "validUntil" TIMESTAMP(3),
  ADD COLUMN "lastRenewedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Existing records are synthetic DigiLicense fixtures. Give each one a
-- server-held expiry inside the renewal window without changing an
-- application or claiming a government-issued validity date.
UPDATE "DrivingLicenceRecord"
SET "validUntil" = CURRENT_TIMESTAMP + INTERVAL '6 months'
WHERE "validUntil" IS NULL;

ALTER TABLE "DrivingLicenceRecord"
  ALTER COLUMN "validUntil" SET NOT NULL;

CREATE TABLE "RenewalDetail" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "licenceRecordId" TEXT NOT NULL,
  "reason" "RenewalReason" NOT NULL,
  "previousValidUntil" TIMESTAMP(3) NOT NULL,
  "renewedValidUntil" TIMESTAMP(3),
  "submissionIdempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RenewalDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RenewalDetail_applicationId_key"
ON "RenewalDetail"("applicationId");

CREATE UNIQUE INDEX "RenewalDetail_submissionIdempotencyKey_key"
ON "RenewalDetail"("submissionIdempotencyKey");

CREATE INDEX "RenewalDetail_licenceRecordId_createdAt_idx"
ON "RenewalDetail"("licenceRecordId", "createdAt");

ALTER TABLE "RenewalDetail"
  ADD CONSTRAINT "RenewalDetail_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RenewalDetail"
  ADD CONSTRAINT "RenewalDetail_licenceRecordId_fkey"
  FOREIGN KEY ("licenceRecordId") REFERENCES "DrivingLicenceRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
