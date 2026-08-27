import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { Prisma, WorkflowActor, prisma } from "@digilicense/db/server"
import type { ApplicationStatus, RenewalReason } from "@digilicense/db/server"

import { getRenewalEligibility, renewalServiceName } from "../lib/renewal"
import type { RenewalSubmission } from "../validation/renewal"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"

const terminalApplicationStatuses: ApplicationStatus[] = [
  "APPROVED",
  "REJECTED",
]
const unavailableMessage = "Licence renewal is temporarily unavailable."

type RenewalLicenceProjection = {
  eligibility:
    | { closesAt: string; kind: "eligible"; opensAt: string }
    | { closesAt: string; kind: "not-open"; opensAt: string }
    | { closesAt: string; kind: "window-closed"; opensAt: string }
  id: string
  licenceNumber: string
  validUntil: string
  vehicleClass: string
}

type RenewalReadResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
  | {
      activeApplication: {
        applicationNumber: string
        nextAction: string
        status: ApplicationStatus
      } | null
      kind: "ready"
      licences: RenewalLicenceProjection[]
    }

type RenewalSubmitResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "duplicate-active"; message: string }
  | { kind: "ineligible"; message: string }
  | { kind: "licence-not-found"; message: string }
  | { kind: "reason-mismatch"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "submitted"; applicationNumber: string; submittedAt: string }
  | { kind: "unavailable"; message: string }

function generateApplicationNumber(now: Date): string {
  return `DLDEMO${now.getUTCFullYear()}${Math.floor(
    Math.random() * 900_000 + 100_000
  )}`
}

function projectLicence(input: {
  id: string
  licenceNumber: string
  validUntil: Date
  vehicleClass: string
}): RenewalLicenceProjection {
  const eligibility = getRenewalEligibility(input.validUntil, new Date())
  return {
    eligibility: {
      closesAt: eligibility.closesAt.toISOString(),
      kind: eligibility.kind,
      opensAt: eligibility.opensAt.toISOString(),
    },
    id: input.id,
    licenceNumber: input.licenceNumber,
    validUntil: input.validUntil.toISOString(),
    vehicleClass: input.vehicleClass,
  }
}

async function consumeRenewalRateLimit(
  rule: "renewal-read" | "renewal-submit",
  applicantId: string
): Promise<
  | { kind: "allowed" }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
> {
  try {
    const result = await consumeRateLimit(rule, applicantId)
    return result.allowed
      ? { kind: "allowed" }
      : {
          kind: "rate-limited",
          message: "Too many renewal requests. Try again shortly.",
          retryAfterSeconds: result.retryAfterSeconds,
        }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_renewal",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function readRenewalState(): Promise<RenewalReadResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to renew a licence.",
    }
  }
  const rateLimit = await consumeRenewalRateLimit(
    "renewal-read",
    applicant.applicantId
  )
  if (rateLimit.kind !== "allowed") return rateLimit

  try {
    const [activeApplication, licences] = await Promise.all([
      prisma.application.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: renewalServiceName,
          status: { notIn: terminalApplicationStatuses },
        },
        orderBy: { submittedAt: "desc" },
        select: { applicationNumber: true, nextAction: true, status: true },
      }),
      prisma.drivingLicenceRecord.findMany({
        where: { applicantId: applicant.applicantId },
        orderBy: { licenceNumber: "asc" },
        select: {
          id: true,
          licenceNumber: true,
          validUntil: true,
          vehicleClass: true,
        },
        take: 10,
      }),
    ])
    return {
      activeApplication,
      kind: "ready",
      licences: licences.map(projectLicence),
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "renewal_state_read",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

function reasonMatchesExpiry(
  reason: RenewalReason,
  validUntil: Date,
  now: Date
) {
  return reason === "EXPIRING_SOON" ? validUntil >= now : validUntil < now
}

async function findOwnedRenewalReplay(
  applicantId: string,
  idempotencyKey: string
): Promise<{ applicationNumber: string; submittedAt: Date } | null> {
  const detail = await prisma.renewalDetail.findFirst({
    where: {
      application: { applicantId },
      submissionIdempotencyKey: idempotencyKey,
    },
    select: {
      application: {
        select: { applicationNumber: true, submittedAt: true },
      },
    },
  })
  return detail?.application ?? null
}

async function submitRenewalApplication(
  input: RenewalSubmission
): Promise<RenewalSubmitResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to submit a renewal.",
    }
  }

  try {
    const replay = await findOwnedRenewalReplay(
      applicant.applicantId,
      input.idempotencyKey
    )
    if (replay) {
      return {
        applicationNumber: replay.applicationNumber,
        kind: "submitted",
        submittedAt: replay.submittedAt.toISOString(),
      }
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "renewal_submit_replay",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }

  const rateLimit = await consumeRenewalRateLimit(
    "renewal-submit",
    applicant.applicantId
  )
  if (rateLimit.kind !== "allowed") return rateLimit

  const submittedAt = new Date()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const applicationNumber = generateApplicationNumber(submittedAt)
    try {
      const result = await prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${applicant.applicantId}, 0))
        `
        const replay = await transaction.renewalDetail.findFirst({
          where: {
            application: { applicantId: applicant.applicantId },
            submissionIdempotencyKey: input.idempotencyKey,
          },
          select: {
            application: {
              select: { applicationNumber: true, submittedAt: true },
            },
          },
        })
        if (replay) return { kind: "replay" as const, ...replay.application }

        const licence = await transaction.drivingLicenceRecord.findFirst({
          where: {
            applicantId: applicant.applicantId,
            id: input.licenceRecordId,
          },
          select: { id: true, validUntil: true },
        })
        if (!licence) return { kind: "licence-not-found" as const }
        if (
          getRenewalEligibility(licence.validUntil, submittedAt).kind !==
          "eligible"
        ) {
          return { kind: "ineligible" as const }
        }
        if (
          !reasonMatchesExpiry(input.reason, licence.validUntil, submittedAt)
        ) {
          return { kind: "reason-mismatch" as const }
        }
        const active = await transaction.application.findFirst({
          where: {
            applicantId: applicant.applicantId,
            service: renewalServiceName,
            status: { notIn: terminalApplicationStatuses },
          },
          select: { id: true },
        })
        if (active) return { kind: "duplicate-active" as const }

        const application = await transaction.application.create({
          data: {
            applicantId: applicant.applicantId,
            applicationNumber,
            blockingReasonCode: "PAYMENT_CONFIRMATION_PENDING",
            nextAction: "Record the DigiLicense-only fee outcome to continue.",
            service: renewalServiceName,
            status: "PAYMENT_REVIEW",
          },
          select: { id: true, submittedAt: true },
        })
        await transaction.renewalDetail.create({
          data: {
            applicationId: application.id,
            licenceRecordId: licence.id,
            previousValidUntil: licence.validUntil,
            reason: input.reason,
            submissionIdempotencyKey: input.idempotencyKey,
          },
        })
        await transaction.workflowEvent.create({
          data: {
            actor: WorkflowActor.APPLICANT,
            actorId: applicant.applicantId,
            applicationId: application.id,
            description:
              "Renewal details were recorded from an owned DigiLicense licence record. No government service was contacted.",
            title: "Renewal application submitted",
            toStatus: "PAYMENT_REVIEW",
          },
        })
        await transaction.notificationRecord.create({
          data: {
            applicantId: applicant.applicantId,
            applicationId: application.id,
            message:
              "Your renewal application is ready for the DigiLicense-only fee step. No government service was contacted.",
            title: "Renewal application received",
          },
        })
        await transaction.auditEvent.create({
          data: {
            action: "SUBMIT_RENEWAL",
            actorId: applicant.applicantId,
            applicationId: application.id,
            entityId: application.id,
            entityType: "APPLICATION",
            reasonCode: "RENEWAL_SUBMISSION",
            requestId: randomUUID(),
          },
        })
        return {
          kind: "submitted" as const,
          submittedAt: application.submittedAt,
        }
      })

      if (result.kind === "licence-not-found") {
        return {
          kind: "licence-not-found",
          message: "No licence was found for this account and reference.",
        }
      }
      if (result.kind === "ineligible") {
        return {
          kind: "ineligible",
          message:
            "This licence is outside the DigiLicense renewal window of 12 months before through 12 months after expiry.",
        }
      }
      if (result.kind === "reason-mismatch") {
        return {
          kind: "reason-mismatch",
          message: "Choose the reason that matches the recorded expiry date.",
        }
      }
      if (result.kind === "duplicate-active") {
        return {
          kind: "duplicate-active",
          message:
            "An active renewal application already exists for this account.",
        }
      }
      return {
        applicationNumber:
          result.kind === "replay"
            ? result.applicationNumber
            : applicationNumber,
        kind: "submitted",
        submittedAt: result.submittedAt.toISOString(),
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const replay = await findOwnedRenewalReplay(
          applicant.applicantId,
          input.idempotencyKey
        )
        if (replay) {
          return {
            applicationNumber: replay.applicationNumber,
            kind: "submitted",
            submittedAt: replay.submittedAt.toISOString(),
          }
        }
      }
      if (attempt < 2) continue
      recordDependencyFailure(error, {
        dependency: "postgres",
        operation: "renewal_submit",
      })
      return { kind: "unavailable", message: unavailableMessage }
    }
  }
  return { kind: "unavailable", message: unavailableMessage }
}

export { readRenewalState, submitRenewalApplication }
export type { RenewalReadResult, RenewalSubmitResult }
