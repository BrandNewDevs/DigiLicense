import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { Prisma, prisma, WorkflowActor } from "@digilicense/db/server"
import type {
  AddressChangeVerificationStatus,
  ApplicationStatus,
} from "@digilicense/db/server"

import { addressChangeServiceName } from "../lib/address-change"
import { getAddressChangeVerificationTerminalResult } from "./address-change-verification.shared"
import type {
  AddressChangeDraftPayload,
  AddressChangeSubmission,
} from "../validation/address-change"
import { addressChangeDraftPayloadSchema } from "../validation/address-change"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"
import { normalizeUniqueConstraintTargets } from "./unique-constraint.shared"
import {
  generateWorkflowOtp,
  hashWorkflowOtp,
  workflowOtpMatches,
} from "./verification-otp.shared"

const verificationExpiryMs = 10 * 60_000
const submitAttemptLimit = 3

const terminalApplicationStatuses: ApplicationStatus[] = [
  "APPROVED",
  "REJECTED",
]

const activeVerificationStatuses: AddressChangeVerificationStatus[] = [
  "OTP_PENDING",
  "OTP_VERIFIED",
]

function isActiveVerificationStatus(
  status: AddressChangeVerificationStatus
): status is "OTP_PENDING" | "OTP_VERIFIED" {
  return status === "OTP_PENDING" || status === "OTP_VERIFIED"
}

type AddressChangeReadResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "unavailable"; message: string }
  | {
      kind: "ready"
      activeApplication: {
        applicationNumber: string
        nextAction: string
        status: ApplicationStatus
        submittedAt: string
      } | null
      activeVerification: {
        expiresAt: string
        id: string
        licenceRecordId: string
        status: "OTP_PENDING" | "OTP_VERIFIED"
      } | null
      currentMobileLastFour: string
      draft: { payload: AddressChangeDraftPayload; updatedAt: string } | null
      licences: Array<{ id: string; licenceNumber: string }>
    }

type AddressChangeStartOtpResult =
  | { kind: "active-verification-exists"; message: string }
  | { kind: "authentication-required"; message: string }
  | { kind: "licence-not-found"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
  | {
      kind: "started"
      currentMobileLastFour: string
      expiresAt: string
      verificationId: string
      syntheticOtp?: string
    }

type AddressChangeVerifyOtpResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "otp-invalid"; message: string }
  | { kind: "otp-locked"; message: string }
  | { kind: "otp-replayed"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
  | { kind: "verification-expired"; message: string }
  | { kind: "verification-cancelled"; message: string }
  | { kind: "verification-consumed"; message: string }
  | { kind: "verification-not-found"; message: string }
  | { kind: "verified"; expiresAt: string; licenceRecordId: string }

type AddressChangeSaveDraftResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
  | { kind: "verification-required"; message: string }
  | { kind: "saved"; savedAt: string }

type AddressChangeSubmitResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "duplicate-active"; message: string }
  | { kind: "invalid-submission"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
  | { kind: "verification-required"; message: string }
  | {
      kind: "submitted"
      applicationNumber: string
      submittedAt: string
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

function parseStoredDraftPayload(
  formPayload: string
): AddressChangeDraftPayload {
  let parsed: unknown

  try {
    parsed = JSON.parse(formPayload)
  } catch {
    return {}
  }

  // Validation is repeated when a draft is read so malformed or stale rows
  // cannot reach the applicant route as trusted state.
  const result = addressChangeDraftPayloadSchema.safeParse(parsed)
  return result.success ? result.data : {}
}

async function readAddressChangeState(): Promise<AddressChangeReadResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to change a synthetic licence address.",
    }
  }

  try {
    const [account, licences, verification, application, draft] =
      await Promise.all([
        prisma.applicantAccount.findUnique({
          where: { id: applicant.applicantId },
          select: { mobileLastFour: true },
        }),
        prisma.drivingLicenceRecord.findMany({
          where: { applicantId: applicant.applicantId },
          orderBy: { licenceNumber: "asc" },
          select: { id: true, licenceNumber: true },
          take: 10,
        }),
        prisma.addressChangeVerification.findFirst({
          where: {
            applicantId: applicant.applicantId,
            expiresAt: { gt: new Date() },
            status: { in: activeVerificationStatuses },
          },
          orderBy: { createdAt: "desc" },
          select: {
            expiresAt: true,
            id: true,
            licenceRecordId: true,
            status: true,
          },
        }),
        prisma.application.findFirst({
          where: {
            applicantId: applicant.applicantId,
            service: addressChangeServiceName,
            status: { notIn: terminalApplicationStatuses },
          },
          orderBy: { submittedAt: "desc" },
          select: {
            applicationNumber: true,
            nextAction: true,
            status: true,
            submittedAt: true,
          },
        }),
        prisma.applicationDraft.findFirst({
          where: {
            applicantId: applicant.applicantId,
            applicationId: null,
            service: addressChangeServiceName,
          },
          orderBy: { updatedAt: "desc" },
          select: { formPayload: true, updatedAt: true },
        }),
      ])

    if (!account) {
      return {
        kind: "authentication-required",
        message:
          "Sign in as an applicant to change a synthetic licence address.",
      }
    }

    return {
      kind: "ready",
      activeApplication: application
        ? {
            applicationNumber: application.applicationNumber,
            nextAction: application.nextAction,
            status: application.status,
            submittedAt: application.submittedAt.toISOString(),
          }
        : null,
      activeVerification:
        verification && isActiveVerificationStatus(verification.status)
          ? {
              expiresAt: verification.expiresAt.toISOString(),
              id: verification.id,
              licenceRecordId: verification.licenceRecordId,
              status: verification.status,
            }
          : null,
      currentMobileLastFour: account.mobileLastFour,
      draft: draft
        ? {
            payload: parseStoredDraftPayload(draft.formPayload),
            updatedAt: draft.updatedAt.toISOString(),
          }
        : null,
      licences,
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "address_change_state_read",
    })
    return {
      kind: "unavailable",
      message: "Address change is temporarily unavailable. Try again shortly.",
    }
  }
}

async function startAddressChangeOtp(input: {
  idempotencyKey: string
  licenceRecordId: string
}): Promise<AddressChangeStartOtpResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to verify an address change.",
    }
  }

  let rateLimit
  try {
    rateLimit = await consumeRateLimit(
      "address-change-otp-start",
      applicant.applicantId
    )
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_address_change_otp_start",
    })
    return {
      kind: "unavailable",
      message:
        "Address verification is temporarily unavailable. Try again shortly.",
    }
  }

  if (!rateLimit.allowed) {
    return {
      kind: "rate-limited",
      message: "Too many verification requests. Try again later.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    }
  }

  const expiresAt = new Date(Date.now() + verificationExpiryMs)

  try {
    const outcome = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${applicant.applicantId}, 0))
      `

      const account = await transaction.applicantAccount.findUnique({
        where: { id: applicant.applicantId },
        select: { mobileLastFour: true },
      })
      if (!account) return { kind: "unavailable" as const }

      const previous = await transaction.addressChangeVerification.findUnique({
        where: { startIdempotencyKey: input.idempotencyKey },
        select: {
          applicantId: true,
          expiresAt: true,
          id: true,
          status: true,
        },
      })
      if (previous) {
        if (previous.applicantId !== applicant.applicantId)
          return { kind: "unavailable" as const }
        if (
          !isActiveVerificationStatus(previous.status) ||
          previous.expiresAt <= new Date()
        ) {
          return { kind: "expired" as const }
        }
        return {
          currentMobileLastFour: account.mobileLastFour,
          expiresAt: previous.expiresAt,
          kind: "started" as const,
          verificationId: previous.id,
        }
      }

      const licence = await transaction.drivingLicenceRecord.findFirst({
        where: {
          applicantId: applicant.applicantId,
          id: input.licenceRecordId,
        },
        select: { id: true },
      })
      if (!licence) return { kind: "licence-not-found" as const }

      await transaction.addressChangeVerification.updateMany({
        where: {
          applicantId: applicant.applicantId,
          expiresAt: { lte: new Date() },
          status: { in: activeVerificationStatuses },
        },
        data: { status: "EXPIRED" },
      })

      const verification = await transaction.addressChangeVerification.create({
        data: {
          applicantId: applicant.applicantId,
          expiresAt,
          licenceRecordId: licence.id,
          startIdempotencyKey: input.idempotencyKey,
          status: "OTP_PENDING",
        },
        select: { id: true },
      })

      const syntheticOtp = generateWorkflowOtp()
      await transaction.addressChangeOtpChallenge.create({
        data: {
          codeHash: hashWorkflowOtp("address-change", syntheticOtp),
          expiresAt,
          verificationId: verification.id,
        },
      })

      await transaction.auditEvent.create({
        data: {
          action: "START_ADDRESS_CHANGE_OTP",
          actorId: applicant.applicantId,
          entityId: verification.id,
          entityType: "ADDRESS_CHANGE_VERIFICATION",
          reasonCode: "SYNTHETIC_OTP_STEP_UP",
          requestId: randomUUID(),
        },
      })

      return {
        currentMobileLastFour: account.mobileLastFour,
        expiresAt,
        kind: "started" as const,
        syntheticOtp,
        verificationId: verification.id,
      }
    })

    if (outcome.kind === "licence-not-found") {
      return {
        kind: "licence-not-found",
        message: "No synthetic licence record was found for this account.",
      }
    }
    if (outcome.kind === "expired") {
      return {
        kind: "active-verification-exists",
        message: "The previous verification expired. Start a new request.",
      }
    }
    if (outcome.kind === "unavailable") {
      return {
        kind: "unavailable",
        message:
          "Address verification is temporarily unavailable. Try again shortly.",
      }
    }

    return {
      kind: "started",
      currentMobileLastFour: outcome.currentMobileLastFour,
      expiresAt: outcome.expiresAt.toISOString(),
      syntheticOtp: outcome.syntheticOtp,
      verificationId: outcome.verificationId,
    }
  } catch (error) {
    const targets = getUniqueConstraintTargets(error)
    if (
      targets.includes("addresschangeverification_one_active_per_applicant_key")
    ) {
      return {
        kind: "active-verification-exists",
        message:
          "Complete or wait for the active address verification to expire.",
      }
    }
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "address_change_otp_start",
    })
    return {
      kind: "unavailable",
      message:
        "Address verification is temporarily unavailable. Try again shortly.",
    }
  }
}

async function verifyAddressChangeOtp(input: {
  idempotencyKey: string
  otp: string
  verificationId: string
}): Promise<AddressChangeVerifyOtpResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to verify an address change.",
    }
  }

  let rateLimit
  try {
    rateLimit = await consumeRateLimit(
      "address-change-otp-verify",
      `${applicant.applicantId}:${input.verificationId}`
    )
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_address_change_otp_verify",
    })
    return {
      kind: "unavailable",
      message:
        "Address verification is temporarily unavailable. Try again shortly.",
    }
  }

  if (!rateLimit.allowed) {
    return {
      kind: "rate-limited",
      message: "Too many OTP attempts. Try again later.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    }
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${input.verificationId}, 0))
      `

      const verification =
        await transaction.addressChangeVerification.findFirst({
          where: {
            applicantId: applicant.applicantId,
            id: input.verificationId,
          },
          include: { otpChallenge: true },
        })
      if (!verification) {
        return {
          kind: "verification-not-found",
          message: "The address verification request was not found.",
        }
      }
      if (
        verification.status === "LOCKED" ||
        verification.status === "EXPIRED" ||
        verification.status === "CONSUMED" ||
        verification.status === "CANCELLED"
      ) {
        return getAddressChangeVerificationTerminalResult(verification.status)
      }
      if (verification.expiresAt <= new Date()) {
        if (verification.status === "OTP_PENDING") {
          await transaction.addressChangeVerification.update({
            where: { id: verification.id },
            data: { status: "EXPIRED" },
          })
        }
        return {
          kind: "verification-expired",
          message: "This verification request expired. Start a new request.",
        }
      }
      if (verification.status === "OTP_VERIFIED") {
        if (verification.verificationIdempotencyKey === input.idempotencyKey) {
          return {
            expiresAt: verification.expiresAt.toISOString(),
            kind: "verified",
            licenceRecordId: verification.licenceRecordId,
          }
        }
        return {
          kind: "otp-replayed",
          message: "This OTP has already been verified.",
        }
      }
      if (
        !verification.otpChallenge ||
        verification.otpChallenge.expiresAt <= new Date()
      ) {
        await transaction.addressChangeVerification.update({
          where: { id: verification.id },
          data: { status: "EXPIRED" },
        })
        return {
          kind: "verification-expired",
          message: "This verification request expired. Start a new request.",
        }
      }

      if (
        !workflowOtpMatches(
          "address-change",
          verification.otpChallenge.codeHash,
          input.otp
        )
      ) {
        const challenge = await transaction.addressChangeOtpChallenge.update({
          where: { id: verification.otpChallenge.id },
          data: { attemptCount: { increment: 1 } },
          select: { attemptCount: true, maxAttempts: true },
        })
        const locked = challenge.attemptCount >= challenge.maxAttempts
        if (locked) {
          await transaction.addressChangeVerification.update({
            where: { id: verification.id },
            data: { status: "LOCKED" },
          })
        }
        await transaction.auditEvent.create({
          data: {
            action: locked
              ? "LOCK_ADDRESS_CHANGE_OTP"
              : "FAIL_ADDRESS_CHANGE_OTP",
            actorId: applicant.applicantId,
            entityId: verification.id,
            entityType: "ADDRESS_CHANGE_VERIFICATION",
            reasonCode: locked ? "OTP_ATTEMPT_LIMIT" : "OTP_NOT_ACCEPTED",
            requestId: randomUUID(),
          },
        })
        return locked
          ? {
              kind: "otp-locked",
              message: "Too many OTP attempts. Start a new request later.",
            }
          : {
              kind: "otp-invalid",
              message: "The synthetic OTP was not accepted.",
            }
      }

      await transaction.addressChangeVerification.update({
        where: { id: verification.id },
        data: {
          status: "OTP_VERIFIED",
          verificationIdempotencyKey: input.idempotencyKey,
          verifiedAt: new Date(),
        },
      })
      await transaction.addressChangeOtpChallenge.update({
        where: { id: verification.otpChallenge.id },
        data: { consumedAt: new Date() },
      })
      await transaction.auditEvent.create({
        data: {
          action: "VERIFY_ADDRESS_CHANGE_OTP",
          actorId: applicant.applicantId,
          entityId: verification.id,
          entityType: "ADDRESS_CHANGE_VERIFICATION",
          reasonCode: "SYNTHETIC_OTP_VERIFIED",
          requestId: randomUUID(),
        },
      })
      return {
        expiresAt: verification.expiresAt.toISOString(),
        kind: "verified",
        licenceRecordId: verification.licenceRecordId,
      }
    })
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "address_change_otp_verify",
    })
    return {
      kind: "unavailable",
      message:
        "Address verification is temporarily unavailable. Try again shortly.",
    }
  }
}

async function saveAddressChangeDraft(input: {
  payload: AddressChangeDraftPayload
  verificationId: string
}): Promise<AddressChangeSaveDraftResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to save an address-change draft.",
    }
  }

  let rateLimit
  try {
    rateLimit = await consumeRateLimit(
      "application-draft",
      applicant.applicantId
    )
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_address_change_draft",
    })
    return {
      kind: "unavailable",
      message: "Draft saving is temporarily unavailable. Try again shortly.",
    }
  }

  if (!rateLimit.allowed) {
    return {
      kind: "rate-limited",
      message: "Too many draft saves in a short time. Wait a moment.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    }
  }

  try {
    const eligible = await prisma.addressChangeVerification.findFirst({
      where: {
        applicantId: applicant.applicantId,
        expiresAt: { gt: new Date() },
        id: input.verificationId,
        status: "OTP_VERIFIED",
      },
      select: { id: true },
    })
    if (!eligible) {
      return {
        kind: "verification-required",
        message:
          "Verify the current synthetic mobile number before saving this draft.",
      }
    }

    const formPayload = JSON.stringify(input.payload)
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.applicationDraft.findFirst({
        where: {
          applicantId: applicant.applicantId,
          service: addressChangeServiceName,
        },
        orderBy: { updatedAt: "desc" },
        select: { applicationId: true, id: true },
      })

      if (!existing || existing.applicationId !== null) {
        await transaction.applicationDraft.create({
          data: {
            applicantId: applicant.applicantId,
            formPayload,
            service: addressChangeServiceName,
          },
        })
        return
      }

      await transaction.applicationDraft.update({
        where: { id: existing.id },
        data: { formPayload },
      })
    })
    return { kind: "saved", savedAt: new Date().toISOString() }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "address_change_draft_save",
    })
    return {
      kind: "unavailable",
      message: "Draft saving is temporarily unavailable. Try again shortly.",
    }
  }
}

async function submitAddressChangeApplication(
  submission: AddressChangeSubmission
): Promise<AddressChangeSubmitResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to submit an address change.",
    }
  }

  const { addressLine1, addressLine2, locality, pincode, proofType } =
    submission
  if (!addressLine1 || !locality || !pincode || !proofType) {
    return {
      kind: "invalid-submission",
      message: "The submitted address-change details were incomplete.",
    }
  }

  let rateLimit
  try {
    rateLimit = await consumeRateLimit(
      "application-submit",
      applicant.applicantId
    )
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_address_change_submit",
    })
    return {
      kind: "unavailable",
      message:
        "Address-change submission is temporarily unavailable. Try again shortly.",
    }
  }

  if (!rateLimit.allowed) {
    return {
      kind: "rate-limited",
      message:
        "Too many submissions in a short time. Wait a few minutes and try again.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    }
  }

  const submittedAt = new Date()
  const reviewDeadline = new Date(submittedAt.getTime() + 60_000)

  for (let attempt = 0; attempt < submitAttemptLimit; attempt += 1) {
    const applicationNumber = generateApplicationNumber(submittedAt)

    try {
      const outcome = await prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${applicant.applicantId}, 0))
        `

        const replay = await transaction.addressChangeDetail.findUnique({
          where: { submissionIdempotencyKey: submission.idempotencyKey },
          select: {
            application: {
              select: {
                applicantId: true,
                applicationNumber: true,
                submittedAt: true,
              },
            },
          },
        })
        if (replay) {
          if (replay.application.applicantId !== applicant.applicantId)
            return { kind: "unavailable" as const }
          return {
            applicationNumber: replay.application.applicationNumber,
            kind: "replay" as const,
            submittedAt: replay.application.submittedAt,
          }
        }

        const verification =
          await transaction.addressChangeVerification.findFirst({
            where: {
              applicantId: applicant.applicantId,
              expiresAt: { gt: new Date() },
              id: submission.verificationId,
              status: "OTP_VERIFIED",
            },
            select: { id: true, licenceRecordId: true },
          })
        if (!verification) return { kind: "verification-required" as const }

        const activeConflict = await transaction.application.findFirst({
          where: {
            applicantId: applicant.applicantId,
            service: addressChangeServiceName,
            status: { notIn: terminalApplicationStatuses },
          },
          select: { applicationNumber: true },
        })
        if (activeConflict) return { kind: "duplicate-active" as const }

        const application = await transaction.application.create({
          data: {
            applicantId: applicant.applicantId,
            applicationNumber,
            blockingReasonCode: "DOCUMENT_REVIEW_PENDING",
            nextAction:
              "DigiLicense is reviewing the submitted proof. No government service was contacted.",
            service: addressChangeServiceName,
            statusDeadlineAt: reviewDeadline,
            status: "DOCUMENT_REVIEW",
            workflowEvents: {
              create: {
                actor: WorkflowActor.APPLICANT,
                actorId: applicant.applicantId,
                description:
                  "Submitted through DigiLicense using a synthetic address and mock proof. No government system or real document was contacted.",
                title: "Address-change application submitted",
                toStatus: "DOCUMENT_REVIEW",
              },
            },
          },
          select: { id: true },
        })

        await transaction.addressChangeDetail.create({
          data: {
            addressLine1,
            addressLine2,
            applicationId: application.id,
            licenceRecordId: verification.licenceRecordId,
            locality,
            pincode,
            proofType,
            submissionIdempotencyKey: submission.idempotencyKey,
          },
        })
        await transaction.documentRecord.create({
          data: {
            applicationId: application.id,
            fileName: `mock-${proofType.toLowerCase()}.pdf`,
            reference: `DOC-SYNTH-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
            status: "UNDER_REVIEW",
            type: "ADDRESS_PROOF",
          },
        })
        await transaction.notificationRecord.create({
          data: {
            applicantId: applicant.applicantId,
            applicationId: application.id,
            message:
              "Your synthetic address-change application was received for mock document review. No government service was contacted.",
            title: "Address-change application received",
          },
        })
        await transaction.auditEvent.create({
          data: {
            action: "SUBMIT_ADDRESS_CHANGE",
            actorId: applicant.applicantId,
            applicationId: application.id,
            entityId: applicationNumber,
            entityType: "APPLICATION",
            reasonCode: "SYNTHETIC_APPLICANT_SUBMISSION",
            requestId: randomUUID(),
          },
        })
        await transaction.addressChangeVerification.update({
          where: { id: verification.id },
          data: { status: "CONSUMED" },
        })
        await transaction.addressChangeOtpChallenge.updateMany({
          where: { verificationId: verification.id },
          data: { consumedAt: new Date() },
        })
        await transaction.applicationDraft.updateMany({
          where: {
            applicantId: applicant.applicantId,
            applicationId: null,
            service: addressChangeServiceName,
          },
          data: { applicationId: application.id },
        })
        return { kind: "created" as const }
      })

      if (outcome.kind === "replay") {
        return {
          applicationNumber: outcome.applicationNumber,
          kind: "submitted",
          submittedAt: outcome.submittedAt.toISOString(),
        }
      }
      if (outcome.kind === "duplicate-active") {
        return {
          kind: "duplicate-active",
          message:
            "An active address-change application already exists for this account.",
        }
      }
      if (outcome.kind === "verification-required") {
        return {
          kind: "verification-required",
          message:
            "Verify the current synthetic mobile number before submitting.",
        }
      }
      if (outcome.kind === "unavailable") {
        return {
          kind: "unavailable",
          message:
            "Address-change submission is temporarily unavailable. Try again shortly.",
        }
      }
      return {
        applicationNumber,
        kind: "submitted",
        submittedAt: submittedAt.toISOString(),
      }
    } catch (error) {
      const targets = getUniqueConstraintTargets(error)
      const applicationNumberConflict =
        targets.includes("applicationnumber") ||
        targets.includes("application_applicationnumber_key")
      const activeApplicationConflict =
        targets.includes("application_active_applicant_service_key") ||
        (targets.includes("applicantid") && targets.includes("service"))

      if (applicationNumberConflict && attempt < submitAttemptLimit - 1) {
        continue
      }
      if (activeApplicationConflict) {
        return {
          kind: "duplicate-active",
          message:
            "An active address-change application already exists for this account.",
        }
      }
      recordDependencyFailure(error, {
        dependency: "postgres",
        operation: "address_change_submit_transaction",
      })
      return {
        kind: "unavailable",
        message:
          "Address-change submission is temporarily unavailable. Try again shortly.",
      }
    }
  }

  return {
    kind: "unavailable",
    message:
      "Address-change submission could not be recorded. Try again shortly.",
  }
}

export {
  readAddressChangeState,
  saveAddressChangeDraft,
  startAddressChangeOtp,
  submitAddressChangeApplication,
  verifyAddressChangeOtp,
}
export type {
  AddressChangeReadResult,
  AddressChangeSaveDraftResult,
  AddressChangeStartOtpResult,
  AddressChangeSubmitResult,
  AddressChangeVerifyOtpResult,
}
