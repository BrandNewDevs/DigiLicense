-- Preference changes, leaving the queue, and offer responses are browser
-- mutations that may be retried after a lost response. Persist their keys so
-- retries return the stored outcome instead of duplicating state changes.
ALTER TABLE "AppointmentWaitlistEntry"
ADD COLUMN "preferenceIdempotencyKey" TEXT,
ADD COLUMN "leaveIdempotencyKey" TEXT;

ALTER TABLE "AppointmentOffer"
ADD COLUMN "responseIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "AppointmentWaitlistEntry_preferenceIdempotencyKey_key"
ON "AppointmentWaitlistEntry"("preferenceIdempotencyKey");
CREATE UNIQUE INDEX "AppointmentWaitlistEntry_leaveIdempotencyKey_key"
ON "AppointmentWaitlistEntry"("leaveIdempotencyKey");
CREATE UNIQUE INDEX "AppointmentOffer_responseIdempotencyKey_key"
ON "AppointmentOffer"("responseIdempotencyKey");
