import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { Prisma, prisma, WorkflowActor } from "@digilicense/db/server"

import type { PermanentLicenceSubmission } from "../validation/permanent-licence"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"

const learnerLicenceService = "Learner's licence"
const permanentLicenceService = "Permanent driving licence"
const waitingPeriodDays = 30
const learnerEligibilityValidityDays = 180

type PermanentLicenceReadResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "no-learner-licence"; message: string }
  | { kind: "waiting-period"; eligibleOn: string; message: string }
  | { kind: "unavailable"; message: string }
  | {
      kind: "eligible"
      eligibleOn: string
      learnerApplicationNumber: string
      vehicleClass: PermanentLicenceSubmission["vehicleClass"]
    }
  | {
      kind: "active-application"
      applicationNumber: string
      nextAction: string
      status: string
    }

type PermanentLicenceSubmitResult =
  | Exclude<PermanentLicenceReadResult, { kind: "eligible" }>
  | { kind: "submitted"; applicationNumber: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | {
      kind: "vehicle-class-mismatch"
      message: string
      vehicleClass: PermanentLicenceSubmission["vehicleClass"]
    }

function eligibilityDate(passedAt: Date) {
  const date = new Date(passedAt)
  date.setUTCDate(date.getUTCDate() + waitingPeriodDays)
  return date
}

// This DigiLicense-only deadline is derived from the recorded learner-test
// result. Applicants never provide it and it is not a government record.
function learnerEligibilityDeadline(passedAt: Date) {
  const date = new Date(passedAt)
  date.setUTCDate(date.getUTCDate() + learnerEligibilityValidityDays)
  return date
}

function getLearnerVehicleClass(formPayload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(formPayload)
    if (!parsed || typeof parsed !== "object") return null
    const vehicleClass = (parsed as Record<string, unknown>).vehicleClass
    return typeof vehicleClass === "string" ? vehicleClass : null
  } catch {
    return null
  }
}

function applicationNumber(now: Date) {
  return `DLDEMO${now.getUTCFullYear()}${Math.floor(Math.random() * 900_000 + 100_000)}`
}

async function readPermanentLicenceState(): Promise<PermanentLicenceReadResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in to continue with a permanent licence.",
    }
  }

  try {
    const [active, learner] = await Promise.all([
      prisma.application.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: permanentLicenceService,
          status: { notIn: ["APPROVED", "REJECTED"] },
        },
        orderBy: { submittedAt: "desc" },
        select: { applicationNumber: true, nextAction: true, status: true },
      }),
      prisma.application.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: learnerLicenceService,
          status: "TEST_PASSED",
        },
        orderBy: { updatedAt: "desc" },
        select: {
          applicationNumber: true,
          updatedAt: true,
          draft: { select: { formPayload: true } },
          learnerLicenceDetail: { select: { vehicleClass: true } },
        },
      }),
    ])

    if (active)
      return {
        kind: "active-application",
        applicationNumber: active.applicationNumber,
        nextAction: active.nextAction,
        status: active.status,
      }
    if (!learner)
      return {
        kind: "no-learner-licence",
        message:
          "Pass the learner's test before starting a permanent-licence application.",
      }

    const vehicleClass =
      learner.learnerLicenceDetail?.vehicleClass ??
      (learner.draft ? getLearnerVehicleClass(learner.draft.formPayload) : null)
    if (
      vehicleClass !== "MOTORCYCLE_WITHOUT_GEAR" &&
      vehicleClass !== "MOTORCYCLE_WITH_GEAR" &&
      vehicleClass !== "LIGHT_MOTOR_VEHICLE"
    ) {
      return {
        kind: "unavailable",
        message:
          "Your learner vehicle class could not be confirmed. Try again shortly.",
      }
    }

    const eligibleOn = eligibilityDate(learner.updatedAt)
    if (eligibleOn > new Date()) {
      return {
        kind: "waiting-period",
        eligibleOn: eligibleOn.toISOString(),
        message:
          "The permanent-licence application opens after the waiting period.",
      }
    }

    return {
      kind: "eligible",
      eligibleOn: eligibleOn.toISOString(),
      learnerApplicationNumber: learner.applicationNumber,
      vehicleClass,
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "permanent_licence_state_read",
    })
    return {
      kind: "unavailable",
      message:
        "The permanent-licence service is temporarily unavailable. Try again shortly.",
    }
  }
}

async function submitPermanentLicenceApplication(
  input: PermanentLicenceSubmission
): Promise<PermanentLicenceSubmitResult> {
  const applicant = await requireApplicant()
  if (!applicant)
    return {
      kind: "authentication-required",
      message: "Sign in to submit a permanent-licence application.",
    }

  const replayBeforeRateLimit = await prisma.permanentLicenceDetail.findUnique({
    where: {
      applicantId_idempotencyKey: {
        applicantId: applicant.applicantId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    select: { application: { select: { applicationNumber: true } } },
  })
  if (replayBeforeRateLimit?.application) {
    return {
      kind: "submitted",
      applicationNumber: replayBeforeRateLimit.application.applicationNumber,
    }
  }

  const limit = await consumeRateLimit(
    "application-submit",
    applicant.applicantId
  )
  if (!limit.allowed)
    return {
      kind: "rate-limited",
      message: "Please wait before trying again.",
      retryAfterSeconds: limit.retryAfterSeconds,
    }

  const state = await readPermanentLicenceState()
  if (state.kind !== "eligible") return state
  if (input.vehicleClass !== state.vehicleClass) {
    return {
      kind: "vehicle-class-mismatch",
      message: "Choose the same vehicle class as your learner's licence.",
      vehicleClass: state.vehicleClass,
    }
  }

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const replay = await transaction.permanentLicenceDetail.findUnique({
        where: {
          applicantId_idempotencyKey: {
            applicantId: applicant.applicantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { application: { select: { applicationNumber: true } } },
      })
      if (replay?.application) {
        return {
          kind: "submitted" as const,
          applicationNumber: replay.application.applicationNumber,
        }
      }

      const learner = await transaction.application.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: learnerLicenceService,
          status: "TEST_PASSED",
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          updatedAt: true,
          draft: { select: { formPayload: true } },
          learnerLicenceDetail: { select: { vehicleClass: true } },
        },
      })
      const learnerVehicleClass =
        learner?.learnerLicenceDetail?.vehicleClass ??
        (learner?.draft
          ? getLearnerVehicleClass(learner.draft.formPayload)
          : null)
      if (!learner || learnerVehicleClass !== input.vehicleClass) {
        return {
          kind: "vehicle-class-mismatch" as const,
          message: "Choose the same vehicle class as your learner's licence.",
          vehicleClass: state.vehicleClass,
        }
      }

      const detail = await transaction.permanentLicenceDetail.create({
        data: {
          applicantId: applicant.applicantId,
          learnerApplicationId: learner.id,
          learnerEligibilityDeadlineAt: learnerEligibilityDeadline(
            learner.updatedAt
          ),
          vehicleClass: learnerVehicleClass,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true },
      })

      const now = new Date()
      const number = applicationNumber(now)
      const application = await transaction.application.create({
        data: {
          applicantId: applicant.applicantId,
          applicationNumber: number,
          blockingReasonCode: "PAYMENT_CONFIRMATION_PENDING",
          service: permanentLicenceService,
          status: "PAYMENT_REVIEW",
          nextAction: "Record the DigiLicense-only fee outcome to continue.",
        },
        select: { id: true, applicationNumber: true },
      })
      await transaction.permanentLicenceDetail.update({
        where: { id: detail.id },
        data: { applicationId: application.id },
      })
      await transaction.workflowEvent.create({
        data: {
          applicationId: application.id,
          actor: WorkflowActor.APPLICANT,
          actorId: applicant.applicantId,
          title: "Permanent-licence application submitted",
          description: `Vehicle class selected: ${input.vehicleClass}. Continue with the DigiLicense-only fee step; no government service was contacted.`,
          toStatus: "PAYMENT_REVIEW",
        },
      })
      await transaction.notificationRecord.create({
        data: {
          applicantId: applicant.applicantId,
          applicationId: application.id,
          title: "Permanent-licence application received",
          message:
            "Your application is ready for the DigiLicense-only fee step. No government service was contacted.",
        },
      })
      await transaction.auditEvent.create({
        data: {
          applicationId: application.id,
          actorId: applicant.applicantId,
          action: "SUBMIT_PERMANENT_LICENCE",
          entityType: "APPLICATION",
          entityId: application.id,
          reasonCode: "PERMANENT_LICENCE_SUBMISSION",
          requestId: randomUUID(),
        },
      })
      return {
        kind: "submitted" as const,
        applicationNumber: application.applicationNumber,
      }
    })
    return created
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replay = await prisma.permanentLicenceDetail.findUnique({
        where: {
          applicantId_idempotencyKey: {
            applicantId: applicant.applicantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { application: { select: { applicationNumber: true } } },
      })
      if (replay?.application) {
        return {
          kind: "submitted",
          applicationNumber: replay.application.applicationNumber,
        }
      }

      const competingApplication = await prisma.application.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: permanentLicenceService,
          status: { notIn: ["APPROVED", "REJECTED"] },
        },
        orderBy: { submittedAt: "desc" },
        select: { applicationNumber: true },
      })
      if (competingApplication) {
        return {
          kind: "submitted",
          applicationNumber: competingApplication.applicationNumber,
        }
      }
    }

    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "permanent_licence_submit",
    })
    return {
      kind: "unavailable",
      message: "The application could not be recorded. Try again shortly.",
    }
  }
}

export { readPermanentLicenceState, submitPermanentLicenceApplication }
export type { PermanentLicenceReadResult, PermanentLicenceSubmitResult }
