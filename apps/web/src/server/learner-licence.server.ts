import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { Prisma, prisma, WorkflowActor } from "@digilicense/db/server"
import type { ApplicationStatus } from "@digilicense/db/server"

import {
  calculateCompletedYears,
  getVehicleClass,
  learnerServiceName,
} from "../lib/learner-licence"
import type { LearnerLicenceSubmission } from "../validation/learner-licence"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"
import { normalizeUniqueConstraintTargets } from "./unique-constraint.shared"

const TERMINAL_APPLICATION_STATUSES: ApplicationStatus[] = [
  "APPROVED",
  "REJECTED",
]

const SUBMIT_ATTEMPT_LIMIT = 3

type ProofType =
  | NonNullable<LearnerLicenceSubmission["identityProofType"]>
  | NonNullable<LearnerLicenceSubmission["addressProofType"]>

// Every proof choice maps to a fixed synthetic file name. No upload is
// received or stored anywhere in this prototype.
const mockProofFileNames: Record<ProofType, string> = {
  MOCK_AADHAAR_CARD: "mock-aadhaar-card.pdf",
  MOCK_PASSPORT: "mock-passport.pdf",
  MOCK_UTILITY_BILL: "mock-utility-bill.pdf",
  MOCK_VOTER_ID: "mock-voter-id.pdf",
}

type LearnerLicenceActiveApplication = {
  applicationNumber: string
  status: ApplicationStatus
  nextAction: string
  submittedAt: string
}

type LearnerLicenceSavedDraft = {
  payload: Record<string, string>
  updatedAt: string
}

type LearnerLicenceReadResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "unavailable"; message: string }
  | {
      kind: "ready"
      activeApplication: LearnerLicenceActiveApplication | null
      draft: LearnerLicenceSavedDraft | null
    }

type LearnerLicenceSaveDraftResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
  | { kind: "saved"; savedAt: string }

type LearnerLicenceSubmitResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "duplicate-active"; message: string }
  | { kind: "eligibility-not-met"; message: string }
  | { kind: "invalid-submission"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
  | {
      kind: "submitted"
      applicationNumber: string
      submittedAt: string
    }

function serializeActiveApplication(application: {
  applicationNumber: string
  status: ApplicationStatus
  nextAction: string
  submittedAt: Date
}): LearnerLicenceActiveApplication {
  return {
    applicationNumber: application.applicationNumber,
    status: application.status,
    nextAction: application.nextAction,
    submittedAt: application.submittedAt.toISOString(),
  }
}

function parseStoredDraftPayload(formPayload: string): Record<string, string> {
  // Draft payloads are always written from validated submissions of the same
  // schema. A malformed row degrades to an empty resume rather than an error,
  // and unknown keys are dropped before anything reaches the UI.
  let parsed: unknown

  try {
    parsed = JSON.parse(formPayload)
  } catch {
    return {}
  }

  if (!parsed || typeof parsed !== "object") return {}

  const entries = Object.entries(parsed).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  )

  return Object.fromEntries(entries)
}

function generateApplicationNumber(now: Date): string {
  const year = now.getUTCFullYear()
  const serial = Math.floor(Math.random() * 900_000) + 100_000

  return `DLDEMO${year}${serial}`
}

function getUniqueConstraintTargets(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return []
  if (error.code !== "P2002") return []

  const meta: unknown = error.meta

  if (!meta || typeof meta !== "object") return []

  return normalizeUniqueConstraintTargets((meta as { target?: unknown }).target)
}

async function readLearnerLicenceState(): Promise<LearnerLicenceReadResult> {
  const applicant = await requireApplicant()

  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to start a learner's licence.",
    }
  }

  let application, draft

  try {
    ;[application, draft] = await Promise.all([
      prisma.application.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: learnerServiceName,
          status: { notIn: TERMINAL_APPLICATION_STATUSES },
        },
        orderBy: { submittedAt: "desc" },
        select: {
          applicationNumber: true,
          status: true,
          nextAction: true,
          submittedAt: true,
        },
      }),
      prisma.applicationDraft.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: learnerServiceName,
          applicationId: null,
        },
        orderBy: { updatedAt: "desc" },
        select: { formPayload: true, updatedAt: true },
      }),
    ])
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "learner_licence_state_read",
    })

    return {
      kind: "unavailable",
      message:
        "The learner's licence service is temporarily unavailable. Try again shortly.",
    }
  }

  return {
    kind: "ready",
    activeApplication: application
      ? serializeActiveApplication(application)
      : null,
    draft: draft
      ? {
          payload: parseStoredDraftPayload(draft.formPayload),
          updatedAt: draft.updatedAt.toISOString(),
        }
      : null,
  }
}

async function saveLearnerLicenceDraft(input: {
  payload: Record<string, unknown>
}): Promise<LearnerLicenceSaveDraftResult> {
  const applicant = await requireApplicant()

  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to save a draft.",
    }
  }

  let draftLimit

  try {
    draftLimit = await consumeRateLimit(
      "application-draft",
      applicant.applicantId
    )
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_application_draft",
    })

    return {
      kind: "unavailable",
      message: "Draft saving is temporarily unavailable. Try again shortly.",
    }
  }

  if (!draftLimit.allowed) {
    return {
      kind: "rate-limited",
      message: "Too many draft saves in a short time. Wait a moment.",
      retryAfterSeconds: draftLimit.retryAfterSeconds,
    }
  }

  const formPayload = JSON.stringify(input.payload)

  try {
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.applicationDraft.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: learnerServiceName,
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, applicationId: true },
      })

      // A draft linked to an application was already consumed by a submission
      // and must never be reopened, so progress continues in a new draft.
      if (!existing || existing.applicationId !== null) {
        await transaction.applicationDraft.create({
          data: {
            applicantId: applicant.applicantId,
            service: learnerServiceName,
            formPayload,
          },
        })

        return
      }

      // The BEFORE UPDATE trigger renews expiresAt on every payload save.
      await transaction.applicationDraft.update({
        where: { id: existing.id },
        data: { formPayload },
      })
    })

    return { kind: "saved", savedAt: new Date().toISOString() }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "learner_licence_draft_save",
    })

    return {
      kind: "unavailable",
      message: "Draft saving is temporarily unavailable. Try again shortly.",
    }
  }
}

async function submitLearnerLicenceApplication(
  submission: LearnerLicenceSubmission
): Promise<LearnerLicenceSubmitResult> {
  const applicant = await requireApplicant()

  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to submit a learner's licence.",
    }
  }

  let submitLimit

  try {
    submitLimit = await consumeRateLimit(
      "application-submit",
      applicant.applicantId
    )
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_application_submit",
    })

    return {
      kind: "unavailable",
      message:
        "Submissions are temporarily unavailable. Try again in a few minutes.",
    }
  }

  if (!submitLimit.allowed) {
    return {
      kind: "rate-limited",
      message:
        "Too many submissions in a short time. Wait a few minutes and try again.",
      retryAfterSeconds: submitLimit.retryAfterSeconds,
    }
  }

  // The schema refinement already enforced eligibility at the boundary using
  // the server clock; these repeat checks keep the workflow rules next to the
  // records they protect even if validation ever moves.
  const {
    addressProofType,
    dateOfBirth,
    identityProofType,
    vehicleClass,
  } = submission

  if (
    !addressProofType ||
    !dateOfBirth ||
    !identityProofType ||
    !vehicleClass
  ) {
    return {
      kind: "invalid-submission",
      message: "The submitted details were incomplete.",
    }
  }

  const completedYears = calculateCompletedYears(dateOfBirth, new Date())
  const minimumAge = getVehicleClass(vehicleClass)?.minimumAgeYears

  if (
    completedYears === undefined ||
    minimumAge === undefined ||
    completedYears < minimumAge
  ) {
    return {
      kind: "eligibility-not-met",
      message:
        "The date of birth does not meet the minimum age for the selected vehicle class.",
    }
  }

  const submittedAt = new Date()

  for (let attempt = 0; attempt < SUBMIT_ATTEMPT_LIMIT; attempt += 1) {
    const applicationNumber = generateApplicationNumber(submittedAt)

    try {
      const outcome = await prisma.$transaction(async (transaction) => {
        // Serializing submits per applicant removes the read-check-insert race
        // without locking unrelated applicants. The partial unique index on
        // (applicantId, service) remains as a database-level backstop against
        // any code path that skips this lock.
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${applicant.applicantId}, 0))
        `

        const activeConflict = await transaction.application.findFirst({
          where: {
            applicantId: applicant.applicantId,
            service: learnerServiceName,
            status: { notIn: TERMINAL_APPLICATION_STATUSES },
          },
          select: { applicationNumber: true },
        })

        if (activeConflict) {
          return "duplicate-active" as const
        }

        const application = await transaction.application.create({
          data: {
            applicantId: applicant.applicantId,
            applicationNumber,
            service: learnerServiceName,
            status: "DOCUMENTS_VERIFIED",
            nextAction:
              "Your application is ready for the learner's test.",
            workflowEvents: {
              create: [
                {
                  actor: WorkflowActor.APPLICANT,
                  actorId: applicant.applicantId,
                  title: "Learner's-licence application submitted",
                  description:
                    "Submitted through the guided DigiLicense form. This created records only; no government service was contacted.",
                  toStatus: "DOCUMENT_REVIEW",
                },
                {
                  actor: WorkflowActor.SYSTEM,
                  actorId: "synthetic-automation",
                  title: "Automatic checks completed",
                  description:
                    "DigiLicense automatically completed the document checks. No government service or real document was used.",
                  fromStatus: "DOCUMENT_REVIEW",
                  toStatus: "DOCUMENTS_VERIFIED",
                },
              ],
            },
          },
          select: { id: true },
        })

        await transaction.documentRecord.createMany({
          data: (
            [
              { fileName: mockProofFileNames[identityProofType], type: "IDENTITY_PROOF" },
              { fileName: mockProofFileNames[addressProofType], type: "ADDRESS_PROOF" },
              { fileName: "mock-passport-photo.jpg", type: "PHOTO" },
            ] as const
          ).map((document) => ({
            applicationId: application.id,
            fileName: document.fileName,
            reference: `DOC-SYNTH-${randomUUID()
              .replaceAll("-", "")
              .slice(0, 12)
              .toUpperCase()}`,
            type: document.type,
          })),
        })

        await transaction.notificationRecord.create({
          data: {
            applicantId: applicant.applicantId,
            applicationId: application.id,
            title: "Learner's-licence application received",
            message:
              "Your application was received and automatic checks are complete. No government service was contacted.",
          },
        })

        await transaction.auditEvent.create({
          data: {
            applicationId: application.id,
            actorId: applicant.applicantId,
            action: "SUBMIT_LEARNER_LICENCE",
            entityType: "APPLICATION",
            entityId: applicationNumber,
            reasonCode: "SYNTHETIC_APPLICANT_SUBMISSION",
            requestId: randomUUID(),
          },
        })

        // Consuming any open draft links it to the submitted application so
        // it can never be resumed into a second submission.
        await transaction.applicationDraft.updateMany({
          where: {
            applicantId: applicant.applicantId,
            service: learnerServiceName,
            applicationId: null,
          },
          data: { applicationId: application.id },
        })

        return "created" as const
      })

      if (outcome === "duplicate-active") {
        return {
          kind: "duplicate-active",
          message:
            "An active learner's-licence application already exists for this account.",
        }
      }

      return {
        kind: "submitted",
        applicationNumber,
        submittedAt: submittedAt.toISOString(),
      }
    } catch (error) {
      const constraintTargets = getUniqueConstraintTargets(error)

      // A generated number collided with an existing row. Nothing was written
      // durably except the advisory-lock session, so a fresh number retries.
      const applicationNumberConflict =
        constraintTargets.includes("applicationnumber") ||
        constraintTargets.includes("application_applicationnumber_key")

      const activeApplicationConflict =
        constraintTargets.includes("application_active_applicant_service_key") ||
        (constraintTargets.includes("applicantid") &&
          constraintTargets.includes("service"))

      if (applicationNumberConflict && attempt < SUBMIT_ATTEMPT_LIMIT - 1) {
        continue
      }

      if (activeApplicationConflict) {
        return {
          kind: "duplicate-active",
          message:
            "An active learner's-licence application already exists for this account.",
        }
      }

      recordDependencyFailure(error, {
        dependency: "postgres",
        operation: "learner_licence_submit_transaction",
      })

      return {
        kind: "unavailable",
        message:
          "The submission could not be recorded. No fee was collected and no government service was contacted. Try again shortly.",
      }
    }
  }

  return {
    kind: "unavailable",
    message:
      "The submission could not be recorded after repeated attempts. Try again shortly.",
  }
}

export {
  readLearnerLicenceState,
  saveLearnerLicenceDraft,
  submitLearnerLicenceApplication,
}
export type {
  LearnerLicenceReadResult,
  LearnerLicenceSaveDraftResult,
  LearnerLicenceSubmitResult,
}
