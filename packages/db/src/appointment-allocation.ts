import { randomUUID } from "node:crypto"

import { prisma } from "./db.ts"
import type { AppointmentClock } from "./appointment-clock.ts"
import { systemAppointmentClock } from "./appointment-clock.ts"
import {
  isEligibleForAppointment,
  rankAppointmentCandidate,
} from "./appointment-ranking.ts"
import { permanentLicenceServiceName } from "./licence-workflow.ts"

const offerLifetimeMilliseconds = 30 * 60 * 1_000
const expiryCooldownMilliseconds = 24 * 60 * 60 * 1_000
const allocationBatchSize = 25
const allocationTransactionMaxWaitMs = 5_000
const allocationTransactionTimeoutMs = 15_000
const allocatorActorId = "digilicense-appointment-allocator"
const expiryWorkerActorId = "digilicense-appointment-expiry-worker"

type LockedSlot = {
  endsAt: Date
  id: string
  startsAt: Date
  vehicleClass: string
  zone: string
}

type LockedCandidate = {
  id: string
  learnerEligibilityDeadlineAt: Date
  originalJoinedAt: Date
  preferenceRank: number
}

type LockedOffer = {
  applicationId: string
  id: string
  slotId: string
  waitlistEntryId: string
}

type AppointmentAllocationResult = {
  offeredCount: number
  scannedSlotCount: number
}

type AppointmentExpiryResult = {
  expiredCount: number
}

type AppointmentLifecycleResult = AppointmentAllocationResult &
  AppointmentExpiryResult & { reactivatedCount: number }

function asPreferenceRank(value: number): 1 | 2 | 3 | null {
  if (value === 1 || value === 2 || value === 3) return value
  return null
}

function createOfferExpiry(now: Date): Date {
  return new Date(now.getTime() + offerLifetimeMilliseconds)
}

function createCooldownDeadline(now: Date): Date {
  return new Date(now.getTime() + expiryCooldownMilliseconds)
}

async function allocateAppointmentSlot(
  slotId: string,
  now: Date
): Promise<boolean> {
  return prisma.$transaction(
    async (transaction) => {
      const slots = await transaction.$queryRaw<LockedSlot[]>`
        SELECT "id", "zone", "vehicleClass", "startsAt", "endsAt"
        FROM "AppointmentSlot"
        WHERE "id" = ${slotId}
          AND "status" = 'OPEN'::"AppointmentSlotStatus"
          AND "startsAt" > ${now}
        FOR UPDATE SKIP LOCKED
      `
      const slot = slots[0]
      if (!slot) return false

      // Ranking happens inside the transaction after both the slot and the
      // selected queue row are locked. The query deliberately mirrors the
      // public appointment-v1 factors instead of using a hidden database
      // priority column.
      const candidates = await transaction.$queryRaw<LockedCandidate[]>`
        SELECT
          entry."id",
          entry."originalJoinedAt",
          permanent_detail."learnerEligibilityDeadlineAt",
          preference."rank" AS "preferenceRank"
        FROM "AppointmentWaitlistEntry" AS entry
        INNER JOIN "Application" AS application
          ON application."id" = entry."applicationId"
        INNER JOIN "PermanentLicenceDetail" AS permanent_detail
          ON permanent_detail."applicationId" = application."id"
        INNER JOIN "AppointmentPreference" AS preference
          ON preference."waitlistEntryId" = entry."id"
        WHERE entry."status" = 'ACTIVE'::"AppointmentWaitlistStatus"
          AND (entry."availableAfter" IS NULL OR entry."availableAfter" <= ${now})
          AND application."service" = ${permanentLicenceServiceName}
          AND application."status" = 'WAITLISTED'::"ApplicationStatus"
          AND NOT EXISTS (
            SELECT 1
            FROM "ConfirmedAppointment" AS confirmed_appointment
            WHERE confirmed_appointment."applicationId" = application."id"
          )
          AND permanent_detail."vehicleClass" = ${slot.vehicleClass}
          AND permanent_detail."learnerEligibilityDeadlineAt" > ${now}
          AND preference."zone" = ${slot.zone}
          AND NOT EXISTS (
            SELECT 1
            FROM "AppointmentOffer" AS active_offer
            WHERE active_offer."waitlistEntryId" = entry."id"
              AND active_offer."status" = 'ACTIVE'::"AppointmentOfferStatus"
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "AppointmentOffer" AS rejected_offer
            WHERE rejected_offer."waitlistEntryId" = entry."id"
              AND rejected_offer."slotId" = ${slot.id}
              AND rejected_offer."status" = 'REJECTED'::"AppointmentOfferStatus"
          )
        ORDER BY
          (
            CASE
              WHEN permanent_detail."learnerEligibilityDeadlineAt" >= CAST(${now} AS TIMESTAMP) + INTERVAL '30 days' THEN 0
              ELSE CEIL(
                EXTRACT(EPOCH FROM (CAST(${now} AS TIMESTAMP) + INTERVAL '30 days' - permanent_detail."learnerEligibilityDeadlineAt"))
                / EXTRACT(EPOCH FROM INTERVAL '30 days') * 60
              )::INTEGER
            END
            + LEAST(
              30,
              GREATEST(
                0,
                FLOOR(EXTRACT(EPOCH FROM (${now} - entry."originalJoinedAt")) / 86400)::INTEGER
              )
            )
            + CASE preference."rank" WHEN 1 THEN 10 WHEN 2 THEN 6 ELSE 2 END
          ) DESC,
          entry."originalJoinedAt" ASC,
          entry."id" ASC
        LIMIT 1
        FOR UPDATE OF entry SKIP LOCKED
      `
      const candidate = candidates[0]
      if (!candidate) return false

      const preferenceRank = asPreferenceRank(candidate.preferenceRank)
      if (
        !preferenceRank ||
        !isEligibleForAppointment(candidate.learnerEligibilityDeadlineAt, now)
      ) {
        throw new Error("Appointment allocator selected an invalid candidate.")
      }

      const ranking = rankAppointmentCandidate(
        {
          id: candidate.id,
          learnerEligibilityDeadlineAt: candidate.learnerEligibilityDeadlineAt,
          originalJoinedAt: candidate.originalJoinedAt,
          preferenceRank,
        },
        now
      )
      const expiresAt = createOfferExpiry(now)
      const offer = await transaction.appointmentOffer.create({
        data: {
          allocationKey: randomUUID(),
          expiresAt,
          rankingBreakdown: ranking.breakdown,
          rankingPolicyVersion: ranking.policyVersion,
          rankingScore: ranking.score,
          slotId: slot.id,
          waitlistEntryId: candidate.id,
        },
        select: { id: true },
      })
      const preferences =
        await transaction.appointmentNotificationPreference.findMany({
          where: { waitlistEntryId: candidate.id },
          select: { channel: true, recipientAlias: true },
        })

      await transaction.appointmentSlot.update({
        where: { id: slot.id },
        data: { status: "OFFERED" },
      })
      const application =
        await transaction.appointmentWaitlistEntry.findUniqueOrThrow({
          where: { id: candidate.id },
          select: { applicationId: true, applicantId: true },
        })
      await transaction.application.update({
        where: { id: application.applicationId },
        data: {
          blockingReasonCode: "APPOINTMENT_OFFER_ACTION_REQUIRED",
          nextAction: "Respond to the appointment offer before it expires.",
          status: "APPOINTMENT_OFFERED",
          statusDeadlineAt: expiresAt,
          version: { increment: 1 },
        },
      })
      await transaction.workflowEvent.create({
        data: {
          actor: "SYSTEM",
          actorId: allocatorActorId,
          applicationId: application.applicationId,
          description:
            "DigiLicense created an appointment offer using the published appointment-v1 ranking policy. No government service was contacted.",
          fromStatus: "WAITLISTED",
          title: "Appointment offer created",
          toStatus: "APPOINTMENT_OFFERED",
        },
      })
      await transaction.notificationRecord.create({
        data: {
          applicantId: application.applicantId,
          applicationId: application.applicationId,
          message:
            "An appointment offer is available. Check its expiry time before responding. DigiLicense recorded this only; no government service was contacted.",
          title: "Appointment offer available",
        },
      })
      await transaction.auditEvent.create({
        data: {
          action: "CREATE_APPOINTMENT_OFFER",
          actorId: allocatorActorId,
          applicationId: application.applicationId,
          entityId: offer.id,
          entityType: "APPOINTMENT_OFFER",
          reasonCode: "APPOINTMENT_V1_RANKING",
          requestId: randomUUID(),
        },
      })
      if (preferences.length > 0) {
        await transaction.appointmentNotificationDelivery.createMany({
          data: preferences.map((preference) => ({
            channel: preference.channel,
            idempotencyKey: `${offer.id}:${preference.channel}`,
            offerId: offer.id,
            recipientAlias: preference.recipientAlias,
          })),
        })
      }

      return true
    },
    {
      maxWait: allocationTransactionMaxWaitMs,
      timeout: allocationTransactionTimeoutMs,
    }
  )
}

async function expireAppointmentOffer(
  offerId: string,
  now: Date
): Promise<boolean> {
  return prisma.$transaction(
    async (transaction) => {
      const offers = await transaction.$queryRaw<LockedOffer[]>`
        SELECT
          offer."id",
          offer."slotId",
          offer."waitlistEntryId",
          entry."applicationId"
        FROM "AppointmentOffer" AS offer
        INNER JOIN "AppointmentWaitlistEntry" AS entry
          ON entry."id" = offer."waitlistEntryId"
        INNER JOIN "AppointmentSlot" AS slot
          ON slot."id" = offer."slotId"
        WHERE offer."id" = ${offerId}
          AND offer."status" = 'ACTIVE'::"AppointmentOfferStatus"
          AND offer."expiresAt" <= ${now}
        FOR UPDATE OF offer, entry, slot SKIP LOCKED
      `
      const offer = offers[0]
      if (!offer) return false

      const cooldownEndsAt = createCooldownDeadline(now)
      const entry =
        await transaction.appointmentWaitlistEntry.findUniqueOrThrow({
          where: { id: offer.waitlistEntryId },
          select: { applicantId: true },
        })
      await transaction.appointmentOffer.update({
        where: { id: offer.id },
        data: { responseAt: now, status: "EXPIRED" },
      })
      await transaction.appointmentSlot.update({
        where: { id: offer.slotId },
        data: { status: "OPEN" },
      })
      await transaction.appointmentWaitlistEntry.update({
        where: { id: offer.waitlistEntryId },
        data: { availableAfter: cooldownEndsAt, status: "COOLDOWN" },
      })
      await transaction.application.update({
        where: { id: offer.applicationId },
        data: {
          blockingReasonCode: "APPOINTMENT_SLOT_UNAVAILABLE",
          nextAction:
            "Your appointment offer expired. You will return to the waitlist after a short cooldown.",
          status: "WAITLISTED",
          statusDeadlineAt: null,
          version: { increment: 1 },
        },
      })
      await transaction.workflowEvent.create({
        data: {
          actor: "SYSTEM",
          actorId: expiryWorkerActorId,
          applicationId: offer.applicationId,
          description:
            "The appointment offer expired after 30 minutes. DigiLicense returned the application to its appointment waitlist cooldown; no government service was contacted.",
          fromStatus: "APPOINTMENT_OFFERED",
          title: "Appointment offer expired",
          toStatus: "WAITLISTED",
        },
      })
      await transaction.notificationRecord.create({
        data: {
          applicantId: entry.applicantId,
          applicationId: offer.applicationId,
          message:
            "The appointment offer expired. DigiLicense will make the waitlist entry eligible again after a short cooldown.",
          title: "Appointment offer expired",
        },
      })
      await transaction.auditEvent.create({
        data: {
          action: "EXPIRE_APPOINTMENT_OFFER",
          actorId: expiryWorkerActorId,
          applicationId: offer.applicationId,
          entityId: offer.id,
          entityType: "APPOINTMENT_OFFER",
          reasonCode: "APPOINTMENT_OFFER_TIMEOUT",
          requestId: randomUUID(),
        },
      })

      return true
    },
    {
      maxWait: allocationTransactionMaxWaitMs,
      timeout: allocationTransactionTimeoutMs,
    }
  )
}

async function allocateAvailableAppointmentOffers(
  clock: AppointmentClock = systemAppointmentClock
): Promise<AppointmentAllocationResult> {
  const now = clock.now()
  const slots = await prisma.appointmentSlot.findMany({
    where: { startsAt: { gt: now }, status: "OPEN" },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: allocationBatchSize,
  })
  let offeredCount = 0

  for (const slot of slots) {
    if (await allocateAppointmentSlot(slot.id, now)) offeredCount += 1
  }

  return { offeredCount, scannedSlotCount: slots.length }
}

async function expireDueAppointmentOffers(
  clock: AppointmentClock = systemAppointmentClock
): Promise<AppointmentExpiryResult> {
  const now = clock.now()
  const offers = await prisma.appointmentOffer.findMany({
    where: { expiresAt: { lte: now }, status: "ACTIVE" },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: allocationBatchSize,
  })
  let expiredCount = 0

  for (const offer of offers) {
    if (await expireAppointmentOffer(offer.id, now)) expiredCount += 1
  }

  return { expiredCount }
}

async function reactivateElapsedAppointmentCooldowns(
  clock: AppointmentClock = systemAppointmentClock
): Promise<number> {
  const now = clock.now()
  const result = await prisma.appointmentWaitlistEntry.updateMany({
    where: {
      availableAfter: { lte: now },
      status: "COOLDOWN",
    },
    data: { availableAfter: null, status: "ACTIVE" },
  })

  return result.count
}

async function processAppointmentOfferLifecycle(
  clock: AppointmentClock = systemAppointmentClock
): Promise<AppointmentLifecycleResult> {
  const expiryResult = await expireDueAppointmentOffers(clock)
  const reactivatedCount = await reactivateElapsedAppointmentCooldowns(clock)
  const allocationResult = await allocateAvailableAppointmentOffers(clock)

  return { ...expiryResult, ...allocationResult, reactivatedCount }
}

export {
  allocateAvailableAppointmentOffers,
  expireDueAppointmentOffers,
  processAppointmentOfferLifecycle,
  reactivateElapsedAppointmentCooldowns,
}
export type {
  AppointmentAllocationResult,
  AppointmentExpiryResult,
  AppointmentLifecycleResult,
}
