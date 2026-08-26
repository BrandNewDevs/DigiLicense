-- Appointment inventory is intentionally additive. It stores individual
-- bookable seats, append-only offers, and durable queue state without changing
-- any existing application outcome.

ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'APPOINTMENT_OFFERED';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'APPOINTMENT_CONFIRMED';
ALTER TYPE "ApplicationBlockingReason" ADD VALUE IF NOT EXISTS 'APPOINTMENT_PREFERENCES_REQUIRED';
ALTER TYPE "ApplicationBlockingReason" ADD VALUE IF NOT EXISTS 'APPOINTMENT_OFFER_ACTION_REQUIRED';

CREATE TYPE "AppointmentSlotStatus" AS ENUM ('OPEN', 'OFFERED', 'CONFIRMED', 'RETIRED');
CREATE TYPE "AppointmentWaitlistStatus" AS ENUM ('ACTIVE', 'COOLDOWN', 'LEFT', 'CONFIRMED');
CREATE TYPE "AppointmentOfferStatus" AS ENUM ('ACTIVE', 'ACCEPTED', 'REJECTED', 'EXPIRED');
CREATE TYPE "AppointmentNotificationChannel" AS ENUM ('SMS', 'EMAIL');
CREATE TYPE "AppointmentNotificationDeliveryStatus" AS ENUM ('RECORDED', 'FAILED');

-- Existing permanent applications receive the same DigiLicense-only,
-- server-derived deadline as all future records. A malformed historic learner
-- relation falls back to the permanent-detail creation time rather than
-- blocking this compatible migration.
ALTER TABLE "PermanentLicenceDetail"
ADD COLUMN "learnerEligibilityDeadlineAt" TIMESTAMP(3);

UPDATE "PermanentLicenceDetail" AS permanent_detail
SET "learnerEligibilityDeadlineAt" = COALESCE(
  (
    SELECT learner."updatedAt" + INTERVAL '180 days'
    FROM "Application" AS learner
    WHERE learner."id" = permanent_detail."learnerApplicationId"
  ),
  permanent_detail."createdAt" + INTERVAL '180 days'
);

ALTER TABLE "PermanentLicenceDetail"
ALTER COLUMN "learnerEligibilityDeadlineAt" SET NOT NULL;

CREATE TABLE "AppointmentSlot" (
  "id" TEXT NOT NULL,
  "inventoryKey" TEXT NOT NULL,
  "zone" TEXT NOT NULL,
  "vehicleClass" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "AppointmentSlotStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentSlot_time_range_check" CHECK ("endsAt" > "startsAt")
);

CREATE TABLE "AppointmentWaitlistEntry" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "status" "AppointmentWaitlistStatus" NOT NULL DEFAULT 'ACTIVE',
  "originalJoinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "availableAfter" TIMESTAMP(3),
  "joinIdempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentWaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppointmentPreference" (
  "id" TEXT NOT NULL,
  "waitlistEntryId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "zone" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentPreference_rank_range_check" CHECK ("rank" BETWEEN 1 AND 3)
);

CREATE TABLE "AppointmentOffer" (
  "id" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "waitlistEntryId" TEXT NOT NULL,
  "status" "AppointmentOfferStatus" NOT NULL DEFAULT 'ACTIVE',
  "rankingPolicyVersion" TEXT NOT NULL,
  "rankingScore" INTEGER NOT NULL,
  "rankingBreakdown" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "responseAt" TIMESTAMP(3),
  "allocationKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentOffer_score_range_check" CHECK ("rankingScore" BETWEEN 0 AND 100),
  CONSTRAINT "AppointmentOffer_expiry_after_creation_check" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "AppointmentNotificationPreference" (
  "id" TEXT NOT NULL,
  "waitlistEntryId" TEXT NOT NULL,
  "channel" "AppointmentNotificationChannel" NOT NULL,
  "recipientAlias" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConfirmedAppointment" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "confirmationIdempotencyKey" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConfirmedAppointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppointmentNotificationDelivery" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "channel" "AppointmentNotificationChannel" NOT NULL,
  "recipientAlias" TEXT NOT NULL,
  "status" "AppointmentNotificationDeliveryStatus" NOT NULL DEFAULT 'RECORDED',
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentSlot_inventoryKey_key" ON "AppointmentSlot"("inventoryKey");
CREATE INDEX "AppointmentSlot_status_vehicleClass_zone_startsAt_idx"
ON "AppointmentSlot"("status", "vehicleClass", "zone", "startsAt");
CREATE INDEX "AppointmentSlot_startsAt_idx" ON "AppointmentSlot"("startsAt");

CREATE UNIQUE INDEX "AppointmentWaitlistEntry_joinIdempotencyKey_key"
ON "AppointmentWaitlistEntry"("joinIdempotencyKey");
CREATE INDEX "AppointmentWaitlistEntry_status_availableAfter_originalJoinedAt_idx"
ON "AppointmentWaitlistEntry"("status", "availableAfter", "originalJoinedAt");
CREATE INDEX "AppointmentWaitlistEntry_applicantId_status_idx"
ON "AppointmentWaitlistEntry"("applicantId", "status");
CREATE UNIQUE INDEX "appointment_waitlist_one_active_per_application_key"
ON "AppointmentWaitlistEntry"("applicationId")
WHERE "status" IN ('ACTIVE'::"AppointmentWaitlistStatus", 'COOLDOWN'::"AppointmentWaitlistStatus");

CREATE UNIQUE INDEX "AppointmentPreference_waitlistEntryId_rank_key"
ON "AppointmentPreference"("waitlistEntryId", "rank");
CREATE UNIQUE INDEX "AppointmentPreference_waitlistEntryId_zone_key"
ON "AppointmentPreference"("waitlistEntryId", "zone");
CREATE INDEX "AppointmentPreference_zone_rank_idx" ON "AppointmentPreference"("zone", "rank");

CREATE UNIQUE INDEX "AppointmentOffer_allocationKey_key" ON "AppointmentOffer"("allocationKey");
CREATE INDEX "AppointmentOffer_status_expiresAt_idx" ON "AppointmentOffer"("status", "expiresAt");
CREATE INDEX "AppointmentOffer_waitlistEntryId_createdAt_idx"
ON "AppointmentOffer"("waitlistEntryId", "createdAt");
CREATE UNIQUE INDEX "appointment_offer_one_active_per_slot_key"
ON "AppointmentOffer"("slotId")
WHERE "status" = 'ACTIVE'::"AppointmentOfferStatus";

CREATE UNIQUE INDEX "AppointmentNotificationPreference_waitlistEntryId_channel_key"
ON "AppointmentNotificationPreference"("waitlistEntryId", "channel");
CREATE UNIQUE INDEX "appointment_offer_one_active_per_entry_key"
ON "AppointmentOffer"("waitlistEntryId")
WHERE "status" = 'ACTIVE'::"AppointmentOfferStatus";

CREATE UNIQUE INDEX "ConfirmedAppointment_applicationId_key" ON "ConfirmedAppointment"("applicationId");
CREATE UNIQUE INDEX "ConfirmedAppointment_slotId_key" ON "ConfirmedAppointment"("slotId");
CREATE UNIQUE INDEX "ConfirmedAppointment_offerId_key" ON "ConfirmedAppointment"("offerId");
CREATE UNIQUE INDEX "ConfirmedAppointment_confirmationIdempotencyKey_key"
ON "ConfirmedAppointment"("confirmationIdempotencyKey");

CREATE UNIQUE INDEX "AppointmentNotificationDelivery_idempotencyKey_key"
ON "AppointmentNotificationDelivery"("idempotencyKey");
CREATE UNIQUE INDEX "AppointmentNotificationDelivery_offerId_channel_key"
ON "AppointmentNotificationDelivery"("offerId", "channel");
CREATE INDEX "AppointmentNotificationDelivery_status_createdAt_idx"
ON "AppointmentNotificationDelivery"("status", "createdAt");

ALTER TABLE "AppointmentWaitlistEntry"
ADD CONSTRAINT "AppointmentWaitlistEntry_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentWaitlistEntry"
ADD CONSTRAINT "AppointmentWaitlistEntry_applicantId_fkey"
FOREIGN KEY ("applicantId") REFERENCES "ApplicantAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentPreference"
ADD CONSTRAINT "AppointmentPreference_waitlistEntryId_fkey"
FOREIGN KEY ("waitlistEntryId") REFERENCES "AppointmentWaitlistEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentOffer"
ADD CONSTRAINT "AppointmentOffer_slotId_fkey"
FOREIGN KEY ("slotId") REFERENCES "AppointmentSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentOffer"
ADD CONSTRAINT "AppointmentOffer_waitlistEntryId_fkey"
FOREIGN KEY ("waitlistEntryId") REFERENCES "AppointmentWaitlistEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentNotificationPreference"
ADD CONSTRAINT "AppointmentNotificationPreference_waitlistEntryId_fkey"
FOREIGN KEY ("waitlistEntryId") REFERENCES "AppointmentWaitlistEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfirmedAppointment"
ADD CONSTRAINT "ConfirmedAppointment_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConfirmedAppointment"
ADD CONSTRAINT "ConfirmedAppointment_slotId_fkey"
FOREIGN KEY ("slotId") REFERENCES "AppointmentSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConfirmedAppointment"
ADD CONSTRAINT "ConfirmedAppointment_offerId_fkey"
FOREIGN KEY ("offerId") REFERENCES "AppointmentOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentNotificationDelivery"
ADD CONSTRAINT "AppointmentNotificationDelivery_offerId_fkey"
FOREIGN KEY ("offerId") REFERENCES "AppointmentOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
