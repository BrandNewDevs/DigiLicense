CREATE TYPE "ReplacementReason" AS ENUM ('LOST', 'DAMAGED', 'UNREADABLE');

ALTER TABLE "DrivingLicenceRecord"
  ADD COLUMN "lastReplacementAt" TIMESTAMP(3);

CREATE TABLE "ReplacementDetail" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "licenceRecordId" TEXT NOT NULL,
  "reason" "ReplacementReason" NOT NULL,
  "replacementReference" TEXT,
  "submissionIdempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReplacementDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReplacementDetail_applicationId_key"
ON "ReplacementDetail"("applicationId");

CREATE UNIQUE INDEX "ReplacementDetail_replacementReference_key"
ON "ReplacementDetail"("replacementReference");

CREATE UNIQUE INDEX "ReplacementDetail_submissionIdempotencyKey_key"
ON "ReplacementDetail"("submissionIdempotencyKey");

CREATE INDEX "ReplacementDetail_licenceRecordId_createdAt_idx"
ON "ReplacementDetail"("licenceRecordId", "createdAt");

ALTER TABLE "ReplacementDetail"
  ADD CONSTRAINT "ReplacementDetail_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReplacementDetail"
  ADD CONSTRAINT "ReplacementDetail_licenceRecordId_fkey"
  FOREIGN KEY ("licenceRecordId") REFERENCES "DrivingLicenceRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
