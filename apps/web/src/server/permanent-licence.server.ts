import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { prisma, WorkflowActor } from "@digilicense/db/server"

import type { PermanentLicenceSubmission } from "../validation/permanent-licence"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"

const learnerLicenceService = "Learner's licence"
const permanentLicenceService = "Permanent driving licence"
const waitingPeriodDays = 30

type PermanentLicenceReadResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "no-learner-licence"; message: string }
  | { kind: "waiting-period"; eligibleOn: string; message: string }
  | { kind: "unavailable"; message: string }
  | {
      kind: "eligible"
      eligibleOn: string
      learnerApplicationNumber: string
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

function eligibilityDate(passedAt: Date) {
  const date = new Date(passedAt)
  date.setUTCDate(date.getUTCDate() + waitingPeriodDays)
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
        select: { applicationNumber: true, updatedAt: true },
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

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const learner = await transaction.application.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: learnerLicenceService,
          status: "TEST_PASSED",
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, draft: { select: { formPayload: true } } },
      })
      const learnerVehicleClass = learner?.draft
        ? getLearnerVehicleClass(learner.draft.formPayload)
        : null
      if (!learner || learnerVehicleClass !== input.vehicleClass) {
        throw new Error(
          "Permanent licence vehicle class must match the learner application."
        )
      }

      const now = new Date()
      const number = applicationNumber(now)
      const application = await transaction.application.create({
        data: {
          applicantId: applicant.applicantId,
          applicationNumber: number,
          service: permanentLicenceService,
          status: "WAITLISTED",
          nextAction:
            "Join the driving-test appointment waitlist when it becomes available.",
        },
        select: { id: true, applicationNumber: true },
      })
      await transaction.permanentLicenceDetail.create({
        data: {
          applicationId: application.id,
          learnerApplicationId: learner.id,
          vehicleClass: learnerVehicleClass,
          idempotencyKey: input.idempotencyKey,
        },
      })
      await transaction.workflowEvent.create({
        data: {
          applicationId: application.id,
          actor: WorkflowActor.APPLICANT,
          actorId: applicant.applicantId,
          title: "Permanent-licence application submitted",
          description: `Vehicle class selected: ${input.vehicleClass}. Recorded by DigiLicense only; no government service was contacted.`,
          toStatus: "WAITLISTED",
        },
      })
      await transaction.notificationRecord.create({
        data: {
          applicantId: applicant.applicantId,
          applicationId: application.id,
          title: "Permanent-licence application received",
          message:
            "Your application is ready for driving-test appointment preferences. No government service was contacted.",
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
      return application
    })
    return { kind: "submitted", applicationNumber: created.applicationNumber }
  } catch (error) {
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
