import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { Prisma, WorkflowActor, prisma } from "@digilicense/db/server"
import type { ApplicationStatus } from "@digilicense/db/server"

import { replacementServiceName } from "../lib/replacement"
import type { ReplacementSubmission } from "../validation/replacement"
import { requireApplicant } from "./demo-session.server"
import { hasConflictingLicenceWorkflow } from "./licence-workflow.shared"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"

const terminalApplicationStatuses: ApplicationStatus[] = [
  "APPROVED",
  "REJECTED",
]
const unavailableMessage = "Licence replacement is temporarily unavailable."

type ReplacementReadResult =
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
      licences: Array<{
        id: string
        licenceNumber: string
        validUntil: string
        vehicleClass: string
      }>
    }

type ReplacementSubmitResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "duplicate-active"; message: string }
  | { kind: "licence-busy"; message: string }
  | { kind: "licence-not-found"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "submitted"; applicationNumber: string; submittedAt: string }
  | { kind: "unavailable"; message: string }

async function consumeReplacementRateLimit(
  rule: "replacement-read" | "replacement-submit",
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
          message: "Too many replacement requests. Try again shortly.",
          retryAfterSeconds: result.retryAfterSeconds,
        }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_replacement",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function readReplacementState(): Promise<ReplacementReadResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to replace a licence.",
    }
  }
  const rateLimit = await consumeReplacementRateLimit(
    "replacement-read",
    applicant.applicantId
  )
  if (rateLimit.kind !== "allowed") return rateLimit

  try {
    const [activeApplication, licences] = await Promise.all([
      prisma.application.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: replacementServiceName,
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
      licences: licences.map((licence) => ({
        ...licence,
        validUntil: licence.validUntil.toISOString(),
      })),
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "replacement_state_read",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

function generateApplicationNumber(now: Date): string {
  return `DLDEMO${now.getUTCFullYear()}${Math.floor(
    Math.random() * 900_000 + 100_000
  )}`
}

async function findOwnedReplacementReplay(
  applicantId: string,
  idempotencyKey: string
): Promise<{ applicationNumber: string; submittedAt: Date } | null> {
  const detail = await prisma.replacementDetail.findFirst({
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

async function submitReplacementApplication(
  input: ReplacementSubmission
): Promise<ReplacementSubmitResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to submit a replacement request.",
    }
  }

  try {
    const replay = await findOwnedReplacementReplay(
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
      operation: "replacement_submit_replay",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }

  const rateLimit = await consumeReplacementRateLimit(
    "replacement-submit",
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
        const replay = await transaction.replacementDetail.findFirst({
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
          select: { id: true },
        })
        if (!licence) return { kind: "licence-not-found" as const }
        const active = await transaction.application.findFirst({
          where: {
            applicantId: applicant.applicantId,
            service: replacementServiceName,
            status: { notIn: terminalApplicationStatuses },
          },
          select: { id: true },
        })
        if (active) return { kind: "duplicate-active" as const }
        if (
          await hasConflictingLicenceWorkflow(transaction, {
            applicantId: applicant.applicantId,
            excludedService: replacementServiceName,
            licenceRecordId: licence.id,
          })
        ) {
          return { kind: "licence-busy" as const }
        }

        const application = await transaction.application.create({
          data: {
            applicantId: applicant.applicantId,
            applicationNumber,
            blockingReasonCode: "PAYMENT_CONFIRMATION_PENDING",
            nextAction: "Record the DigiLicense-only fee outcome to continue.",
            service: replacementServiceName,
            status: "PAYMENT_REVIEW",
          },
          select: { id: true, submittedAt: true },
        })
        await transaction.replacementDetail.create({
          data: {
            applicationId: application.id,
            licenceRecordId: licence.id,
            reason: input.reason,
            submissionIdempotencyKey: input.idempotencyKey,
          },
        })
        await transaction.documentRecord.create({
          data: {
            applicationId: application.id,
            fileName: "digilicense-replacement-declaration.json",
            reference: `DOC-SYNTH-${randomUUID()
              .replaceAll("-", "")
              .slice(0, 12)
              .toUpperCase()}`,
            type: "OTHER",
          },
        })
        await transaction.workflowEvent.create({
          data: {
            actor: WorkflowActor.APPLICANT,
            actorId: applicant.applicantId,
            applicationId: application.id,
            description:
              "A replacement declaration was recorded for an owned DigiLicense licence record. No government service was contacted.",
            title: "Replacement request submitted",
            toStatus: "PAYMENT_REVIEW",
          },
        })
        await transaction.notificationRecord.create({
          data: {
            applicantId: applicant.applicantId,
            applicationId: application.id,
            message:
              "Your replacement request is ready for the DigiLicense-only fee step. No government service was contacted.",
            title: "Replacement request received",
          },
        })
        await transaction.auditEvent.create({
          data: {
            action: "SUBMIT_REPLACEMENT",
            actorId: applicant.applicantId,
            applicationId: application.id,
            entityId: application.id,
            entityType: "APPLICATION",
            reasonCode: "REPLACEMENT_SUBMISSION",
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
      if (result.kind === "licence-busy") {
        return {
          kind: "licence-busy",
          message:
            "Complete the active licence-change workflow before starting a replacement.",
        }
      }
      if (result.kind === "duplicate-active") {
        return {
          kind: "duplicate-active",
          message:
            "An active replacement request already exists for this account.",
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
        const replay = await findOwnedReplacementReplay(
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
        operation: "replacement_submit",
      })
      return { kind: "unavailable", message: unavailableMessage }
    }
  }
  return { kind: "unavailable", message: unavailableMessage }
}

export { readReplacementState, submitReplacementApplication }
export type { ReplacementReadResult, ReplacementSubmitResult }
