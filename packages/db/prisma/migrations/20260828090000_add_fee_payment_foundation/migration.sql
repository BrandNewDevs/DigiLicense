CREATE TYPE "PaymentFailureReason" AS ENUM ('RECORDED_FAILURE');

CREATE TYPE "FeeService" AS ENUM (
  'LEARNER_LICENCE',
  'PERMANENT_LICENCE',
  'ADDRESS_CHANGE',
  'RENEWAL',
  'REPLACEMENT'
);

CREATE TABLE "FeeSchedule" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "service" "FeeService" NOT NULL,
  "version" TEXT NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeeSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeeSchedule_positive_amount_check" CHECK ("amountPaise" > 0)
);

ALTER TABLE "PaymentRecord"
  ADD COLUMN "feeScheduleId" TEXT,
  ADD COLUMN "feeScheduleVersion" TEXT,
  ADD COLUMN "failureReason" "PaymentFailureReason",
  ADD COLUMN "resolutionIdempotencyKey" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "PaymentRecord"
  ADD CONSTRAINT "PaymentRecord_feeScheduleId_fkey"
  FOREIGN KEY ("feeScheduleId") REFERENCES "FeeSchedule"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "FeeSchedule_code_version_key"
ON "FeeSchedule"("code", "version");

CREATE INDEX "FeeSchedule_service_effectiveFrom_idx"
ON "FeeSchedule"("service", "effectiveFrom");

CREATE UNIQUE INDEX "fee_schedule_one_active_per_service_key"
ON "FeeSchedule"("service") WHERE "active" = true;

CREATE UNIQUE INDEX "PaymentRecord_resolutionIdempotencyKey_key"
ON "PaymentRecord"("resolutionIdempotencyKey");

CREATE INDEX "PaymentRecord_feeScheduleId_idx"
ON "PaymentRecord"("feeScheduleId");

CREATE UNIQUE INDEX "payment_one_active_per_application_key"
ON "PaymentRecord"("applicationId")
WHERE "status" IN ('PENDING'::"PaymentStatus", 'PROCESSING'::"PaymentStatus");

CREATE UNIQUE INDEX "payment_one_paid_per_application_key"
ON "PaymentRecord"("applicationId")
WHERE "status" = 'PAID'::"PaymentStatus";

ALTER TABLE "PaymentRecord"
  ADD CONSTRAINT "PaymentRecord_positive_amount_check"
  CHECK ("amountPaise" > 0);
