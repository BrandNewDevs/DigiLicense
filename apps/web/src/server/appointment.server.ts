import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import {
  addUtcDays,
  learnerLicenceServiceName,
  permanentLicenceServiceName,
  permanentLicenceWaitingPeriodDays,
  Prisma,
  prisma,
  allocateAppointmentOfferForWaitlistEntry,
} from "@digilicense/db/server"

import type {
  LeaveAppointmentWaitlistInput,
  RespondToAppointmentOfferInput,
  SaveAppointmentPreferencesInput,
} from "../validation/appointment"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"
import { hashIdentity } from "./rate-limit.shared"

const unavailableMessage = "Appointment service is temporarily unavailable."
const notFoundMessage = "No appointment journey was found for this account."

type AuthenticatedApplicant = { applicantId: string; kind: "authenticated" }
type AppointmentFailure =
  | { kind: "authentication-required"; message: string }
  | { kind: "ineligible"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "offer-unavailable"; message: string }
  | { kind: "offer-pending"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }

type AppointmentJourney = {
  applicationNumber: string
  confirmedAppointment: {
    confirmedAt: string
    endsAt: string
    startsAt: string
    zone: string
  } | null
  kind: "found"
  offer: {
    expiresAt: string
    id: string
    ranking: {
      // The allocator always writes this score snapshot. Treat it as optional
      // when projecting historic rows, however, so a malformed non-sensitive
      // audit payload cannot hide an active offer or prevent a response.
      breakdown: {
        preferencePoints: number
        urgencyPoints: number
        waitTimePoints: number
      } | null
      policyVersion: string
      score: number
    }
    slot: { endsAt: string; startsAt: string; zone: string }
  } | null
  preferences: { notificationChannels: Array<"SMS" | "EMAIL">; zones: string[] }
  state:
    | "CONFIRMED"
    | "COOLDOWN"
    | "OFFERED"
    | "PREFERENCES_REQUIRED"
    | "WAITLISTED"
    | "LEFT"
}

type AppointmentResult = AppointmentJourney | AppointmentFailure
type SavedPreferencesResult =
  | AppointmentFailure
  | { entryId: string; kind: "saved" }
type LeaveWaitlistResult = AppointmentFailure | { kind: "left" }
type AcceptOfferResult =
  | AppointmentFailure
  | {
      appointment: NonNullable<AppointmentJourney["confirmedAppointment"]>
      kind: "confirmed"
    }
type RejectOfferResult = AppointmentFailure | { kind: "rejected" }

type LockedOffer = {
  applicationId: string
  entryId: string
  expiresAt: Date
  offerId: string
  slotId: string
}

function getLearnerVehicleClass(formPayload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(formPayload)
    if (!parsed || typeof parsed !== "object") return null
    const value = (parsed as Record<string, unknown>).vehicleClass
    return typeof value === "string" ? value : null
  } catch {
    return null
  }
}

function recipientAlias(channel: "SMS" | "EMAIL", applicantId: string): string {
  return `synthetic-${channel.toLowerCase()}:${hashIdentity("appointment-delivery", applicantId)}`
}

async function authenticateApplicant(): Promise<
  AuthenticatedApplicant | AppointmentFailure
> {
  try {
    const applicant = await requireApplicant()
    return applicant
      ? { applicantId: applicant.applicantId, kind: "authenticated" }
      : {
          kind: "authentication-required",
          message: "Sign in as an applicant to manage appointments.",
        }
  } catch {
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function limit(
  rule:
    | "appointment-journey-read"
    | "appointment-offer-response"
    | "appointment-preferences"
    | "appointment-waitlist-leave",
  applicantId: string
): Promise<{ kind: "allowed" } | AppointmentFailure> {
  try {
    const result = await consumeRateLimit(rule, applicantId)
    return result.allowed
      ? { kind: "allowed" }
      : {
          kind: "rate-limited",
          message: "Please wait before trying again.",
          retryAfterSeconds: result.retryAfterSeconds,
        }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "appointment_rate_limit",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function assertOwnedEligiblePermanentApplication(
  client: Prisma.TransactionClient | typeof prisma,
  applicantId: string,
  applicationNumber: string,
  now: Date
): Promise<{ applicationId: string } | AppointmentFailure> {
  const application = await client.application.findFirst({
    where: {
      applicantId,
      applicationNumber,
      service: permanentLicenceServiceName,
    },
    select: {
      id: true,
      permanentLicenceDetail: {
        select: {
          learnerApplicationId: true,
          learnerEligibilityDeadlineAt: true,
          vehicleClass: true,
        },
      },
    },
  })
  if (!application?.permanentLicenceDetail)
    return { kind: "not-found", message: notFoundMessage }
  const learner = await client.application.findFirst({
    where: {
      applicantId,
      id: application.permanentLicenceDetail.learnerApplicationId,
      service: learnerLicenceServiceName,
      status: "TEST_PASSED",
    },
    select: {
      draft: { select: { formPayload: true } },
      learnerLicenceDetail: { select: { vehicleClass: true } },
      updatedAt: true,
    },
  })
  if (
    !learner ||
    addUtcDays(learner.updatedAt, permanentLicenceWaitingPeriodDays) > now
  ) {
    return {
      kind: "ineligible",
      message:
        "The learner waiting period is not complete for this appointment journey.",
    }
  }
  if (
    learner.updatedAt.getTime() + 180 * 24 * 60 * 60_000 !==
      application.permanentLicenceDetail.learnerEligibilityDeadlineAt.getTime() ||
    (learner.learnerLicenceDetail?.vehicleClass ??
      getLearnerVehicleClass(learner.draft?.formPayload ?? "")) !==
      application.permanentLicenceDetail.vehicleClass ||
    application.permanentLicenceDetail.learnerEligibilityDeadlineAt <= now
  ) {
    return {
      kind: "ineligible",
      message:
        "This permanent-licence application is not eligible for an appointment.",
    }
  }
  return { applicationId: application.id }
}

async function readAppointmentJourney(
  applicationNumber: string | undefined
): Promise<AppointmentResult> {
  const authorization = await authenticateApplicant()
  if (authorization.kind !== "authenticated") return authorization
  const rate = await limit(
    "appointment-journey-read",
    authorization.applicantId
  )
  if (rate.kind !== "allowed") return rate
  try {
    let selectedApplicationNumber = applicationNumber

    if (!selectedApplicationNumber) {
      const candidates = await prisma.application.findMany({
        where: {
          applicantId: authorization.applicantId,
          service: permanentLicenceServiceName,
        },
        orderBy: { updatedAt: "desc" },
        select: { applicationNumber: true },
        take: 20,
      })
      if (!candidates.length)
        return { kind: "not-found", message: notFoundMessage }

      let ineligible: AppointmentFailure | null = null
      for (const candidate of candidates) {
        const eligibility = await assertOwnedEligiblePermanentApplication(
          prisma,
          authorization.applicantId,
          candidate.applicationNumber,
          new Date()
        )
        if ("applicationId" in eligibility) {
          selectedApplicationNumber = candidate.applicationNumber
          break
        }
        ineligible = eligibility
      }
      if (!selectedApplicationNumber) {
        return (
          ineligible ?? {
            kind: "ineligible",
            message:
              "No permanent-licence application is eligible for an appointment.",
          }
        )
      }
    }

    if (!selectedApplicationNumber) {
      return { kind: "not-found", message: notFoundMessage }
    }

    const eligibility = await assertOwnedEligiblePermanentApplication(
      prisma,
      authorization.applicantId,
      selectedApplicationNumber,
      new Date()
    )
    if ("kind" in eligibility) return eligibility

    const application = await prisma.application.findFirst({
      where: {
        applicantId: authorization.applicantId,
        applicationNumber: selectedApplicationNumber,
        service: permanentLicenceServiceName,
      },
      orderBy: { updatedAt: "desc" },
      select: {
        applicationNumber: true,
        confirmedAppointment: {
          select: {
            confirmedAt: true,
            slot: { select: { endsAt: true, startsAt: true, zone: true } },
          },
        },
        appointmentWaitlistEntries: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            status: true,
            preferences: { orderBy: { rank: "asc" }, select: { zone: true } },
            notificationPreferences: { select: { channel: true } },
            offers: {
              where: { status: "ACTIVE" },
              select: {
                expiresAt: true,
                id: true,
                rankingBreakdown: true,
                rankingPolicyVersion: true,
                rankingScore: true,
                slot: { select: { endsAt: true, startsAt: true, zone: true } },
              },
              take: 1,
            },
          },
        },
      },
    })
    if (!application) return { kind: "not-found", message: notFoundMessage }
    const entry = application.appointmentWaitlistEntries.at(0)
    const offer = entry?.offers.at(0)
    const breakdown = offer?.rankingBreakdown
    const parsedBreakdown =
      breakdown &&
      typeof breakdown === "object" &&
      !Array.isArray(breakdown) &&
      typeof breakdown.preferencePoints === "number" &&
      typeof breakdown.urgencyPoints === "number" &&
      typeof breakdown.waitTimePoints === "number"
        ? {
            preferencePoints: breakdown.preferencePoints,
            urgencyPoints: breakdown.urgencyPoints,
            waitTimePoints: breakdown.waitTimePoints,
          }
        : null
    const confirmed = application.confirmedAppointment
    return {
      applicationNumber: application.applicationNumber,
      confirmedAppointment: confirmed
        ? {
            confirmedAt: confirmed.confirmedAt.toISOString(),
            endsAt: confirmed.slot.endsAt.toISOString(),
            startsAt: confirmed.slot.startsAt.toISOString(),
            zone: confirmed.slot.zone,
          }
        : null,
      kind: "found",
      offer: offer
        ? {
            expiresAt: offer.expiresAt.toISOString(),
            id: offer.id,
            ranking: {
              breakdown: parsedBreakdown,
              policyVersion: offer.rankingPolicyVersion,
              score: offer.rankingScore,
            },
            slot: {
              endsAt: offer.slot.endsAt.toISOString(),
              startsAt: offer.slot.startsAt.toISOString(),
              zone: offer.slot.zone,
            },
          }
        : null,
      preferences: {
        notificationChannels: (entry?.notificationPreferences ?? []).map(
          (preference) => preference.channel
        ),
        zones: (entry?.preferences ?? []).map((preference) => preference.zone),
      },
      state: confirmed
        ? "CONFIRMED"
        : offer
          ? "OFFERED"
          : entry?.status === "COOLDOWN"
            ? "COOLDOWN"
            : entry?.status === "LEFT"
              ? "LEFT"
              : entry
                ? "WAITLISTED"
                : "PREFERENCES_REQUIRED",
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "appointment_journey_read",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function saveAppointmentPreferences(
  input: SaveAppointmentPreferencesInput
): Promise<SavedPreferencesResult> {
  const authorization = await authenticateApplicant()
  if (authorization.kind !== "authenticated") return authorization
  const rate = await limit("appointment-preferences", authorization.applicantId)
  if (rate.kind !== "allowed") return rate
  const now = new Date()
  let saved: SavedPreferencesResult
  try {
    saved = await prisma.$transaction(async (transaction) => {
      const context = await assertOwnedEligiblePermanentApplication(
        transaction,
        authorization.applicantId,
        input.applicationNumber,
        now
      )
      if ("kind" in context) return context
      const existing = await transaction.appointmentWaitlistEntry.findFirst({
        where: {
          applicationId: context.applicationId,
          status: { in: ["ACTIVE", "COOLDOWN"] },
        },
        include: {
          offers: { where: { status: "ACTIVE" }, select: { id: true } },
        },
      })
      if (existing?.preferenceIdempotencyKey === input.idempotencyKey)
        return { entryId: existing.id, kind: "saved" }
      if (existing?.offers.length)
        return {
          kind: "offer-pending",
          message:
            "Respond to the active appointment offer before changing preferences.",
        }
      const isPreferenceUpdate = Boolean(existing)
      const entry = existing
        ? await transaction.appointmentWaitlistEntry.update({
            where: { id: existing.id },
            data: { preferenceIdempotencyKey: input.idempotencyKey },
            select: { id: true },
          })
        : await transaction.appointmentWaitlistEntry.create({
            data: {
              applicantId: authorization.applicantId,
              applicationId: context.applicationId,
              joinIdempotencyKey: input.idempotencyKey,
              preferenceIdempotencyKey: input.idempotencyKey,
            },
            select: { id: true },
          })
      await transaction.appointmentPreference.deleteMany({
        where: { waitlistEntryId: entry.id },
      })
      await transaction.appointmentNotificationPreference.deleteMany({
        where: { waitlistEntryId: entry.id },
      })
      await transaction.appointmentPreference.createMany({
        data: input.zones.map((zone, index) => ({
          rank: index + 1,
          waitlistEntryId: entry.id,
          zone,
        })),
      })
      await transaction.appointmentNotificationPreference.createMany({
        data: input.notificationChannels.map((channel) => ({
          channel,
          recipientAlias: recipientAlias(channel, authorization.applicantId),
          waitlistEntryId: entry.id,
        })),
      })
      await transaction.application.update({
        where: { id: context.applicationId },
        data: {
          blockingReasonCode: "APPOINTMENT_SLOT_UNAVAILABLE",
          nextAction: "Wait for a matching appointment offer.",
          status: "WAITLISTED",
          statusDeadlineAt: null,
          version: { increment: 1 },
        },
      })
      await transaction.workflowEvent.create({
        data: {
          actor: "APPLICANT",
          actorId: authorization.applicantId,
          applicationId: context.applicationId,
          description: isPreferenceUpdate
            ? "Appointment preferences and selected delivery channels were updated by DigiLicense only; no SMS or email was sent. The original waitlist join time was retained."
            : "Appointment preferences and selected delivery channels were recorded by DigiLicense only; no SMS or email was sent.",
          fromStatus: "WAITLISTED",
          title: isPreferenceUpdate
            ? "Appointment preferences updated"
            : "Appointment preferences recorded",
          toStatus: "WAITLISTED",
        },
      })
      await transaction.auditEvent.create({
        data: {
          action: isPreferenceUpdate
            ? "UPDATE_APPOINTMENT_PREFERENCES"
            : "SAVE_APPOINTMENT_PREFERENCES",
          actorId: authorization.applicantId,
          applicationId: context.applicationId,
          entityId: entry.id,
          entityType: "APPOINTMENT_WAITLIST_ENTRY",
          reasonCode: isPreferenceUpdate
            ? "APPOINTMENT_PREFERENCES_UPDATED"
            : "APPOINTMENT_PREFERENCES",
          requestId: randomUUID(),
        },
      })
      return { entryId: entry.id, kind: "saved" } as const
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replay = await prisma.appointmentWaitlistEntry.findFirst({
        where: {
          preferenceIdempotencyKey: input.idempotencyKey,
          application: {
            applicantId: authorization.applicantId,
            applicationNumber: input.applicationNumber,
            service: permanentLicenceServiceName,
          },
        },
        select: { id: true },
      })
      if (replay) return { entryId: replay.id, kind: "saved" }
    }
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "appointment_preferences_save",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }

  if (
    saved.kind === "saved" &&
    authorization.applicantId === "demo-applicant-004"
  ) {
    try {
      await allocateAppointmentOfferForWaitlistEntry(saved.entryId)
    } catch (error) {
      recordDependencyFailure(error, {
        dependency: "postgres",
        operation: "appointment_offer_allocate_after_preferences_save",
      })
    }
  }

  return saved
}

async function leaveAppointmentWaitlist(
  input: LeaveAppointmentWaitlistInput
): Promise<LeaveWaitlistResult> {
  const authorization = await authenticateApplicant()
  if (authorization.kind !== "authenticated") return authorization
  const rate = await limit(
    "appointment-waitlist-leave",
    authorization.applicantId
  )
  if (rate.kind !== "allowed") return rate
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const context = await assertOwnedEligiblePermanentApplication(
        transaction,
        authorization.applicantId,
        input.applicationNumber,
        new Date()
      )
      if ("kind" in context) return context
      const entry = await transaction.appointmentWaitlistEntry.findFirst({
        where: { applicationId: context.applicationId },
        orderBy: { createdAt: "desc" },
        include: {
          offers: {
            where: { status: "ACTIVE" },
            include: { slot: { select: { id: true } } },
          },
        },
      })
      if (!entry)
        return { kind: "not-found", message: notFoundMessage } as const
      if (
        entry.leaveIdempotencyKey === input.idempotencyKey ||
        entry.status === "LEFT"
      )
        return { kind: "left" } as const
      if (entry.status === "CONFIRMED")
        return {
          kind: "offer-pending",
          message:
            "A confirmed appointment cannot be removed from this waitlist.",
        } as const
      await transaction.appointmentWaitlistEntry.update({
        where: { id: entry.id },
        data: { leaveIdempotencyKey: input.idempotencyKey, status: "LEFT" },
      })
      for (const offer of entry.offers) {
        await transaction.appointmentOffer.update({
          where: { id: offer.id },
          data: {
            responseAt: new Date(),
            responseIdempotencyKey: input.idempotencyKey,
            status: "REJECTED",
          },
        })
        await transaction.appointmentSlot.update({
          where: { id: offer.slot.id },
          data: { status: "OPEN" },
        })
      }
      await transaction.application.update({
        where: { id: entry.applicationId },
        data: {
          blockingReasonCode: "APPOINTMENT_PREFERENCES_REQUIRED",
          nextAction:
            "Choose new appointment preferences to rejoin the waitlist.",
          status: "WAITLISTED",
          statusDeadlineAt: null,
          version: { increment: 1 },
        },
      })
      await transaction.workflowEvent.create({
        data: {
          actor: "APPLICANT",
          actorId: authorization.applicantId,
          applicationId: entry.applicationId,
          description:
            "The applicant left the DigiLicense appointment waitlist. No government service was contacted.",
          fromStatus: "WAITLISTED",
          title: "Left appointment waitlist",
          toStatus: "WAITLISTED",
        },
      })
      await transaction.auditEvent.create({
        data: {
          action: "LEAVE_APPOINTMENT_WAITLIST",
          actorId: authorization.applicantId,
          applicationId: entry.applicationId,
          entityId: entry.id,
          entityType: "APPOINTMENT_WAITLIST_ENTRY",
          reasonCode: "APPOINTMENT_WAITLIST_LEFT",
          requestId: randomUUID(),
        },
      })
      return { kind: "left" } as const
    })
    return result
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replay = await prisma.appointmentWaitlistEntry.findFirst({
        where: {
          leaveIdempotencyKey: input.idempotencyKey,
          application: {
            applicantId: authorization.applicantId,
            applicationNumber: input.applicationNumber,
            service: permanentLicenceServiceName,
          },
        },
        select: { id: true },
      })
      if (replay) return { kind: "left" }
    }
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "appointment_waitlist_leave",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function lockActiveOwnedOffer(
  transaction: Prisma.TransactionClient,
  applicantId: string,
  input: RespondToAppointmentOfferInput
): Promise<LockedOffer | null> {
  const rows = await transaction.$queryRaw<LockedOffer[]>`
    SELECT offer."id" AS "offerId", offer."expiresAt", offer."slotId", entry."id" AS "entryId", application."id" AS "applicationId"
    FROM "AppointmentOffer" AS offer
    INNER JOIN "AppointmentWaitlistEntry" AS entry ON entry."id" = offer."waitlistEntryId"
    INNER JOIN "Application" AS application ON application."id" = entry."applicationId"
    INNER JOIN "AppointmentSlot" AS slot ON slot."id" = offer."slotId"
    WHERE offer."id" = ${input.offerId}
      AND offer."status" = 'ACTIVE'::"AppointmentOfferStatus"
      AND application."applicantId" = ${applicantId}
      AND application."applicationNumber" = ${input.applicationNumber}
      AND application."service" = ${permanentLicenceServiceName}
    FOR UPDATE OF offer, entry, application, slot
  `
  return rows[0] ?? null
}

async function acceptedReplay(
  applicantId: string,
  input: RespondToAppointmentOfferInput
): Promise<AcceptOfferResult | null> {
  const confirmation = await prisma.confirmedAppointment.findFirst({
    where: {
      confirmationIdempotencyKey: input.idempotencyKey,
      application: { applicantId, applicationNumber: input.applicationNumber },
    },
    select: {
      confirmedAt: true,
      slot: { select: { endsAt: true, startsAt: true, zone: true } },
    },
  })
  return confirmation
    ? {
        appointment: {
          confirmedAt: confirmation.confirmedAt.toISOString(),
          endsAt: confirmation.slot.endsAt.toISOString(),
          startsAt: confirmation.slot.startsAt.toISOString(),
          zone: confirmation.slot.zone,
        },
        kind: "confirmed",
      }
    : null
}

async function acceptAppointmentOffer(
  input: RespondToAppointmentOfferInput
): Promise<AcceptOfferResult> {
  const authorization = await authenticateApplicant()
  if (authorization.kind !== "authenticated") return authorization
  const replay = await acceptedReplay(authorization.applicantId, input)
  if (replay) return replay
  const rate = await limit(
    "appointment-offer-response",
    authorization.applicantId
  )
  if (rate.kind !== "allowed") return rate
  const now = new Date()
  try {
    return await prisma.$transaction(async (transaction) => {
      const context = await assertOwnedEligiblePermanentApplication(
        transaction,
        authorization.applicantId,
        input.applicationNumber,
        now
      )
      if ("kind" in context) return context
      const offer = await lockActiveOwnedOffer(
        transaction,
        authorization.applicantId,
        input
      )
      if (
        !offer ||
        offer.applicationId !== context.applicationId ||
        offer.expiresAt <= now
      )
        return {
          kind: "offer-unavailable",
          message: "This appointment offer is no longer available.",
        }
      const confirmation = await transaction.confirmedAppointment.create({
        data: {
          applicationId: offer.applicationId,
          confirmationIdempotencyKey: input.idempotencyKey,
          offerId: offer.offerId,
          slotId: offer.slotId,
        },
        select: {
          confirmedAt: true,
          id: true,
          slot: { select: { endsAt: true, startsAt: true, zone: true } },
        },
      })
      await transaction.appointmentOffer.update({
        where: { id: offer.offerId },
        data: {
          responseAt: now,
          responseIdempotencyKey: input.idempotencyKey,
          status: "ACCEPTED",
        },
      })
      await transaction.appointmentSlot.update({
        where: { id: offer.slotId },
        data: { status: "CONFIRMED" },
      })
      await transaction.appointmentWaitlistEntry.update({
        where: { id: offer.entryId },
        data: { status: "CONFIRMED" },
      })
      await transaction.application.update({
        where: { id: offer.applicationId },
        data: {
          blockingReasonCode: null,
          nextAction:
            "Your driving-test appointment is confirmed. DigiLicense recorded this only; no government service was contacted.",
          status: "APPOINTMENT_CONFIRMED",
          statusDeadlineAt: null,
          version: { increment: 1 },
        },
      })
      await transaction.workflowEvent.create({
        data: {
          actor: "APPLICANT",
          actorId: authorization.applicantId,
          applicationId: offer.applicationId,
          description:
            "The applicant accepted a DigiLicense appointment offer. No government service was contacted.",
          fromStatus: "APPOINTMENT_OFFERED",
          title: "Appointment confirmed",
          toStatus: "APPOINTMENT_CONFIRMED",
        },
      })
      await transaction.notificationRecord.create({
        data: {
          applicantId: authorization.applicantId,
          applicationId: offer.applicationId,
          message:
            "Your driving-test appointment is confirmed by DigiLicense only. No government service was contacted.",
          title: "Appointment confirmed",
        },
      })
      await transaction.auditEvent.create({
        data: {
          action: "ACCEPT_APPOINTMENT_OFFER",
          actorId: authorization.applicantId,
          applicationId: offer.applicationId,
          entityId: confirmation.id,
          entityType: "CONFIRMED_APPOINTMENT",
          reasonCode: "APPOINTMENT_OFFER_ACCEPTED",
          requestId: randomUUID(),
        },
      })
      return {
        appointment: {
          confirmedAt: confirmation.confirmedAt.toISOString(),
          endsAt: confirmation.slot.endsAt.toISOString(),
          startsAt: confirmation.slot.startsAt.toISOString(),
          zone: confirmation.slot.zone,
        },
        kind: "confirmed",
      }
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const retry = await acceptedReplay(authorization.applicantId, input)
      if (retry) return retry
    }
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "appointment_offer_accept",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function rejectAppointmentOffer(
  input: RespondToAppointmentOfferInput
): Promise<RejectOfferResult> {
  const authorization = await authenticateApplicant()
  if (authorization.kind !== "authenticated") return authorization
  const replay = await prisma.appointmentOffer.findFirst({
    where: {
      responseIdempotencyKey: input.idempotencyKey,
      status: "REJECTED",
      waitlistEntry: {
        application: {
          applicantId: authorization.applicantId,
          applicationNumber: input.applicationNumber,
        },
      },
    },
    select: { id: true },
  })
  if (replay) return { kind: "rejected" }
  const rate = await limit(
    "appointment-offer-response",
    authorization.applicantId
  )
  if (rate.kind !== "allowed") return rate
  const now = new Date()
  try {
    return await prisma.$transaction(async (transaction) => {
      const context = await assertOwnedEligiblePermanentApplication(
        transaction,
        authorization.applicantId,
        input.applicationNumber,
        now
      )
      if ("kind" in context) return context
      const offer = await lockActiveOwnedOffer(
        transaction,
        authorization.applicantId,
        input
      )
      if (
        !offer ||
        offer.applicationId !== context.applicationId ||
        offer.expiresAt <= now
      )
        return {
          kind: "offer-unavailable",
          message: "This appointment offer is no longer available.",
        }
      await transaction.appointmentOffer.update({
        where: { id: offer.offerId },
        data: {
          responseAt: now,
          responseIdempotencyKey: input.idempotencyKey,
          status: "REJECTED",
        },
      })
      await transaction.appointmentSlot.update({
        where: { id: offer.slotId },
        data: { status: "OPEN" },
      })
      await transaction.application.update({
        where: { id: offer.applicationId },
        data: {
          blockingReasonCode: "APPOINTMENT_SLOT_UNAVAILABLE",
          nextAction: "Wait for a different appointment offer.",
          status: "WAITLISTED",
          statusDeadlineAt: null,
          version: { increment: 1 },
        },
      })
      await transaction.workflowEvent.create({
        data: {
          actor: "APPLICANT",
          actorId: authorization.applicantId,
          applicationId: offer.applicationId,
          description:
            "The applicant declined this DigiLicense appointment offer. The same slot will not be offered to this waitlist entry again.",
          fromStatus: "APPOINTMENT_OFFERED",
          title: "Appointment offer declined",
          toStatus: "WAITLISTED",
        },
      })
      await transaction.notificationRecord.create({
        data: {
          applicantId: authorization.applicantId,
          applicationId: offer.applicationId,
          message:
            "The appointment offer was declined. DigiLicense will look for a different matching slot.",
          title: "Appointment offer declined",
        },
      })
      await transaction.auditEvent.create({
        data: {
          action: "REJECT_APPOINTMENT_OFFER",
          actorId: authorization.applicantId,
          applicationId: offer.applicationId,
          entityId: offer.offerId,
          entityType: "APPOINTMENT_OFFER",
          reasonCode: "APPOINTMENT_OFFER_REJECTED",
          requestId: randomUUID(),
        },
      })
      return { kind: "rejected" }
    })
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "appointment_offer_reject",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

export {
  acceptAppointmentOffer,
  leaveAppointmentWaitlist,
  readAppointmentJourney,
  rejectAppointmentOffer,
  saveAppointmentPreferences,
}
export type { AppointmentJourney, AppointmentResult }
