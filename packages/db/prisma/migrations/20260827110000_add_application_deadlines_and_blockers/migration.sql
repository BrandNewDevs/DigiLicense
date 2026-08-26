-- Application blocker/deadline snapshots make an applicant's next unavailable
-- action explicit without mutating workflow history. Existing records retain
-- their status; only the explanatory snapshot fields are backfilled.
CREATE TYPE "ApplicationBlockingReason" AS ENUM (
  'DOCUMENT_REVIEW_PENDING',
  'CORRECTION_REQUIRED',
  'PAYMENT_CONFIRMATION_PENDING',
  'TEST_RESULT_PENDING',
  'APPROVAL_REVIEW_PENDING',
  'APPOINTMENT_SLOT_UNAVAILABLE',
  'WAITING_PERIOD_NOT_MET'
);

ALTER TABLE "Application"
ADD COLUMN "blockingReasonCode" "ApplicationBlockingReason",
ADD COLUMN "statusDeadlineAt" TIMESTAMP(3);

UPDATE "Application"
SET "blockingReasonCode" = CASE "status"
  WHEN 'DOCUMENT_REVIEW' THEN 'DOCUMENT_REVIEW_PENDING'::"ApplicationBlockingReason"
  WHEN 'CORRECTION_REQUIRED' THEN 'CORRECTION_REQUIRED'::"ApplicationBlockingReason"
  WHEN 'PAYMENT_REVIEW' THEN 'PAYMENT_CONFIRMATION_PENDING'::"ApplicationBlockingReason"
  WHEN 'TEST_PENDING' THEN 'TEST_RESULT_PENDING'::"ApplicationBlockingReason"
  WHEN 'APPROVAL_PENDING' THEN 'APPROVAL_REVIEW_PENDING'::"ApplicationBlockingReason"
  WHEN 'WAITLISTED' THEN 'APPOINTMENT_SLOT_UNAVAILABLE'::"ApplicationBlockingReason"
  ELSE NULL
END;

-- Existing address-change reviews become eligible shortly after deployment so
-- they progress through the same worker as subsequently submitted records.
UPDATE "Application"
SET "statusDeadlineAt" = CURRENT_TIMESTAMP + INTERVAL '1 minute',
    "blockingReasonCode" = 'DOCUMENT_REVIEW_PENDING'::"ApplicationBlockingReason"
WHERE "service" = 'Driving-licence address change'
  AND "status" = 'DOCUMENT_REVIEW';

CREATE INDEX "Application_service_status_statusDeadlineAt_idx"
ON "Application"("service", "status", "statusDeadlineAt");
