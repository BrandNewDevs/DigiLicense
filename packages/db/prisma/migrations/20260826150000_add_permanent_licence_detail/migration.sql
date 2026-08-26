CREATE TABLE "PermanentLicenceDetail" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "learnerApplicationId" TEXT NOT NULL,
  "vehicleClass" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PermanentLicenceDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PermanentLicenceDetail_applicationId_key" ON "PermanentLicenceDetail"("applicationId");
CREATE UNIQUE INDEX "PermanentLicenceDetail_idempotencyKey_key" ON "PermanentLicenceDetail"("idempotencyKey");
CREATE INDEX "PermanentLicenceDetail_learnerApplicationId_idx" ON "PermanentLicenceDetail"("learnerApplicationId");
ALTER TABLE "PermanentLicenceDetail" ADD CONSTRAINT "PermanentLicenceDetail_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
