-- The permanent-licence waiting period is longer than learner draft
-- retention, so retain only the non-sensitive vehicle-class workflow fact.
CREATE TABLE "LearnerLicenceDetail" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "vehicleClass" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearnerLicenceDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearnerLicenceDetail_applicationId_key"
ON "LearnerLicenceDetail"("applicationId");

CREATE INDEX "LearnerLicenceDetail_vehicleClass_idx"
ON "LearnerLicenceDetail"("vehicleClass");

ALTER TABLE "LearnerLicenceDetail"
  ADD CONSTRAINT "LearnerLicenceDetail_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
