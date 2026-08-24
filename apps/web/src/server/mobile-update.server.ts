import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import {
  Prisma,
  hashMobileNumber,
  prisma,
} from "@digilicense/db/server"

import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import {
  getMockMobileUpdateOtp,
  hashMobileUpdateOtp,
  otpMatches,
} from "./mobile-update.shared"
import { consumeRateLimit } from "./rate-limit.server"
import { normalizeUniqueConstraintTargets } from "./unique-constraint.shared"

const mobileChangeExpiryMs = 10 * 60_000

type MobileUpdateReadResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "unavailable"; message: string }
  | {
      kind: "ready"
      currentMobileLastFour: string
      activeRequest: {
        expiresAt: string
        id: string
        method: "OTP" | "MOCK_AADHAAR"
        targetMobileLastFour: string
      } | null
    }

type MobileUpdateStartResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "active-request-exists"; message: string }
  | { kind: "invalid-mobile-number"; message: string }
  | { kind: "mobile-already-in-use"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "request-expired"; message: string }
  | { kind: "same-as-current-mobile"; message: string }
  | { kind: "unavailable"; message: string }
  | {
      kind: "started"
      expiresAt: string
      nextStep: "OTP_REQUIRED" | "AADHAAR_REQUIRED"
      requestId: string
      targetMobileLastFour: string
    }

type MobileUpdateVerificationResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "aadhaar-failed"; message: string }
  | { kind: "method-mismatch"; message: string }
  | { kind: "mobile-already-in-use"; message: string }
  | { kind: "otp-invalid"; message: string }
  | { kind: "otp-locked"; message: string }
  | { kind: "otp-replayed"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "request-expired"; message: string }
  | { kind: "request-not-found"; message: string }
  | { kind: "unavailable"; message: string }
  | {
      kind: "completed"
      authVersion: number
      mobileLastFour: string
    }

type PendingRequest = {
  applicantId: string
  confirmationIdempotencyKey: string | null
  expiresAt: Date
  id: string
  method: "OTP" | "MOCK_AADHAAR"
  status:
    | "OTP_PENDING"
    | "AADHAAR_PENDING"
    | "COMPLETED"
    | "FAILED"
    | "LOCKED"
    | "EXPIRED"
    | "CANCELLED"
  targetMobileHmac: string
  targetMobileLastFour: string
}

function getUniqueConstraintTargets(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return []
  if (error.code !== "P2002") return []

  const meta: unknown = error.meta
  if (!meta || typeof meta !== "object") return []

  return normalizeUniqueConstraintTargets((meta as { target?: unknown }).target)
}

function isActiveStatus(status: PendingRequest["status"]): boolean {
  return status === "OTP_PENDING" || status === "AADHAAR_PENDING"
}

async function readMobileUpdateState(): Promise<MobileUpdateReadResult> {
  const applicant = await requireApplicant()

  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to update a synthetic mobile number.",
    }
  }

  try {
    const [account, request] = await Promise.all([
      prisma.applicantAccount.findUnique({
        where: { id: applicant.applicantId },
        select: { mobileLastFour: true },
      }),
      prisma.mobileChangeRequest.findFirst({
        where: {
          applicantId: applicant.applicantId,
          status: { in: ["OTP_PENDING", "AADHAAR_PENDING"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          expiresAt: true,
          id: true,
          method: true,
          targetMobileLastFour: true,
        },
      }),
    ])

    if (!account) {
      return {
        kind: "authentication-required",
        message: "Sign in as an applicant to update a synthetic mobile number.",
      }
    }

    return {
      kind: "ready",
      currentMobileLastFour: account.mobileLastFour,
      activeRequest: request
        ? {
            expiresAt: request.expiresAt.toISOString(),
            id: request.id,
            method: request.method,
            targetMobileLastFour: request.targetMobileLastFour,
          }
        : null,
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "mobile_update_state_read",
    })
    return {
      kind: "unavailable",
      message: "Mobile update is temporarily unavailable. Try again shortly.",
    }
  }
}

async function startMobileUpdate(input: {
  idempotencyKey: string
  method: "OTP" | "MOCK_AADHAAR"
  targetMobileNumber: string
}): Promise<MobileUpdateStartResult> {
  const applicant = await requireApplicant()

  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to update a synthetic mobile number.",
    }
  }

  let rateLimit
  try {
    rateLimit = await consumeRateLimit("mobile-update-start", applicant.applicantId)
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_mobile_update_start",
    })
    return {
      kind: "unavailable",
      message: "Mobile update is temporarily unavailable. Try again shortly.",
    }
  }

  if (!rateLimit.allowed) {
    return {
      kind: "rate-limited",
      message: "Too many mobile-update requests. Try again later.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    }
  }

  const targetMobileHmac = hashMobileNumber(input.targetMobileNumber)
  const expiresAt = new Date(Date.now() + mobileChangeExpiryMs)

  try {
    const outcome = await prisma.$transaction(async (transaction) => {
      const previous = await transaction.mobileChangeRequest.findUnique({
        where: { startIdempotencyKey: input.idempotencyKey },
        select: {
          applicantId: true,
          expiresAt: true,
          id: true,
          method: true,
          targetMobileLastFour: true,
        },
      })

      if (previous) {
        if (previous.applicantId !== applicant.applicantId) return { kind: "unavailable" as const }
        if (previous.expiresAt <= new Date()) return { kind: "active-expired" as const }

        return {
          kind: "started" as const,
          expiresAt: previous.expiresAt,
          method: previous.method,
          requestId: previous.id,
          targetMobileLastFour: previous.targetMobileLastFour,
        }
      }

      const [account, targetAccount] = await Promise.all([
        transaction.applicantAccount.findUnique({
          where: { id: applicant.applicantId },
          select: { mobileHmac: true },
        }),
        transaction.applicantAccount.findUnique({
          where: { mobileHmac: targetMobileHmac },
          select: { id: true },
        }),
      ])

      if (!account) return { kind: "unavailable" as const }
      if (account.mobileHmac === targetMobileHmac) return { kind: "same" as const }
      if (targetAccount) return { kind: "in-use" as const }

      await transaction.mobileChangeRequest.updateMany({
        where: {
          applicantId: applicant.applicantId,
          expiresAt: { lte: new Date() },
          status: { in: ["OTP_PENDING", "AADHAAR_PENDING"] },
        },
        data: { status: "EXPIRED" },
      })

      const request = await transaction.mobileChangeRequest.create({
        data: {
          applicantId: applicant.applicantId,
          expiresAt,
          method: input.method,
          startIdempotencyKey: input.idempotencyKey,
          status: input.method === "OTP" ? "OTP_PENDING" : "AADHAAR_PENDING",
          targetMobileHmac,
          targetMobileLastFour: input.targetMobileNumber.slice(-4),
        },
        select: { id: true },
      })

      if (input.method === "OTP") {
        await transaction.mobileChangeOtpChallenge.create({
          data: {
            codeHash: hashMobileUpdateOtp(getMockMobileUpdateOtp()),
            expiresAt,
            requestId: request.id,
          },
        })
      } else {
        await transaction.mockAadhaarVerification.create({
          data: { requestId: request.id },
        })
      }

      await transaction.notificationRecord.create({
        data: {
          applicantId: applicant.applicantId,
          message:
            "A synthetic mobile-update verification request was started. No message was sent to a real number.",
          title: "Mobile update verification started",
        },
      })

      await transaction.auditEvent.create({
        data: {
          action: "START_MOBILE_UPDATE",
          actorId: applicant.applicantId,
          entityId: request.id,
          entityType: "MOBILE_CHANGE_REQUEST",
          reasonCode: `SYNTHETIC_${input.method}_VERIFICATION`,
          requestId: randomUUID(),
        },
      })

      return {
        kind: "started" as const,
        expiresAt,
        method: input.method,
        requestId: request.id,
        targetMobileLastFour: input.targetMobileNumber.slice(-4),
      }
    })

    if (outcome.kind === "same") {
      return { kind: "same-as-current-mobile", message: "Enter a different synthetic mobile number." }
    }
    if (outcome.kind === "in-use") {
      return { kind: "mobile-already-in-use", message: "This synthetic mobile number is already in use." }
    }
    if (outcome.kind === "unavailable") {
      return { kind: "unavailable", message: "Mobile update is temporarily unavailable. Try again shortly." }
    }
    if (outcome.kind === "active-expired") {
      return { kind: "request-expired", message: "The previous request expired. Start a new request with a new idempotency key." }
    }

    return {
      kind: "started",
      expiresAt: outcome.expiresAt.toISOString(),
      nextStep: outcome.method === "OTP" ? "OTP_REQUIRED" : "AADHAAR_REQUIRED",
      requestId: outcome.requestId,
      targetMobileLastFour: outcome.targetMobileLastFour,
    }
  } catch (error) {
    const targets = getUniqueConstraintTargets(error)
    if (targets.includes("mobilechangerequest_one_active_per_applicant_key")) {
      return {
        kind: "active-request-exists",
        message: "Complete or wait for the existing mobile-update request to expire.",
      }
    }

    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "mobile_update_start",
    })
    return {
      kind: "unavailable",
      message: "Mobile update is temporarily unavailable. Try again shortly.",
    }
  }
}

async function completeMobileUpdate(
  transaction: Prisma.TransactionClient,
  request: PendingRequest,
  idempotencyKey: string,
  applicantId: string
): Promise<MobileUpdateVerificationResult> {
  const account = await transaction.applicantAccount.update({
    where: { id: applicantId },
    data: {
      authVersion: { increment: 1 },
      mobileHmac: request.targetMobileHmac,
      mobileLastFour: request.targetMobileLastFour,
    },
    select: { authVersion: true, mobileLastFour: true },
  })

  await transaction.mobileChangeRequest.update({
    where: { id: request.id },
    data: {
      completedAt: new Date(),
      confirmationIdempotencyKey: idempotencyKey,
      status: "COMPLETED",
    },
  })

  await transaction.mobileChangeOtpChallenge.deleteMany({
    where: { requestId: request.id },
  })

  await transaction.notificationRecord.create({
    data: {
      applicantId,
      message:
        "Your synthetic mobile number was updated. Existing sign-ins were refreshed for this prototype.",
      title: "Synthetic mobile number updated",
    },
  })

  await transaction.auditEvent.create({
    data: {
      action: "COMPLETE_MOBILE_UPDATE",
      actorId: applicantId,
      entityId: request.id,
      entityType: "MOBILE_CHANGE_REQUEST",
      reasonCode: "SYNTHETIC_MOBILE_UPDATE_CONFIRMED",
      requestId: randomUUID(),
    },
  })

  return {
    kind: "completed",
    authVersion: account.authVersion,
    mobileLastFour: account.mobileLastFour,
  }
}

async function verifyMobileUpdateOtp(input: {
  idempotencyKey: string
  otp: string
  requestId: string
}): Promise<MobileUpdateVerificationResult> {
  const applicant = await requireApplicant()
  if (!applicant) {
    return { kind: "authentication-required", message: "Sign in as an applicant to verify the OTP." }
  }

  let rateLimit
  try {
    rateLimit = await consumeRateLimit(
      "mobile-update-otp-verify",
      `${applicant.applicantId}:${input.requestId}`
    )
  } catch (error) {
    recordDependencyFailure(error, { dependency: "postgres", operation: "rate_limit_mobile_update_otp" })
    return { kind: "unavailable", message: "OTP verification is temporarily unavailable. Try again shortly." }
  }

  if (!rateLimit.allowed) {
    return { kind: "rate-limited", message: "Too many OTP attempts. Try again later.", retryAfterSeconds: rateLimit.retryAfterSeconds }
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const request = await transaction.mobileChangeRequest.findFirst({
        where: { applicantId: applicant.applicantId, id: input.requestId },
        include: { otpChallenge: true },
      })

      if (!request) return { kind: "request-not-found", message: "The mobile-update request was not found." }
      if (request.method !== "OTP") return { kind: "method-mismatch", message: "This request uses mock Aadhaar verification." }
      if (request.status === "COMPLETED") {
        if (request.confirmationIdempotencyKey === input.idempotencyKey) {
          const account = await transaction.applicantAccount.findUnique({
            where: { id: applicant.applicantId },
            select: { authVersion: true, mobileLastFour: true },
          })
          if (account) return { kind: "completed", authVersion: account.authVersion, mobileLastFour: account.mobileLastFour }
        }
        return { kind: "otp-replayed", message: "This OTP challenge has already been used." }
      }
      if (!isActiveStatus(request.status) || request.expiresAt <= new Date() || !request.otpChallenge || request.otpChallenge.expiresAt <= new Date()) {
        await transaction.mobileChangeRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } })
        return { kind: "request-expired", message: "This OTP request has expired. Start a new one." }
      }

      if (!otpMatches(request.otpChallenge.codeHash, input.otp)) {
        const attemptCount = request.otpChallenge.attemptCount + 1
        const locked = attemptCount >= request.otpChallenge.maxAttempts
        await transaction.mobileChangeOtpChallenge.update({ where: { id: request.otpChallenge.id }, data: { attemptCount } })
        if (locked) await transaction.mobileChangeRequest.update({ where: { id: request.id }, data: { status: "LOCKED" } })
        return locked
          ? { kind: "otp-locked", message: "Too many OTP attempts. Start a new request later." }
          : { kind: "otp-invalid", message: "The synthetic OTP was not accepted." }
      }

      return completeMobileUpdate(transaction, request, input.idempotencyKey, applicant.applicantId)
    })
  } catch (error) {
    const targets = getUniqueConstraintTargets(error)
    if (targets.includes("applicantaccount_mobilehmac_key")) {
      return { kind: "mobile-already-in-use", message: "This synthetic mobile number is already in use." }
    }
    recordDependencyFailure(error, { dependency: "postgres", operation: "mobile_update_otp_verify" })
    return { kind: "unavailable", message: "OTP verification is temporarily unavailable. Try again shortly." }
  }
}

async function completeMockAadhaarVerification(input: {
  idempotencyKey: string
  mockAssertion: "MOCK_AADHAAR_PASS" | "MOCK_AADHAAR_FAIL"
  requestId: string
}): Promise<MobileUpdateVerificationResult> {
  const applicant = await requireApplicant()
  if (!applicant) return { kind: "authentication-required", message: "Sign in as an applicant to complete mock Aadhaar verification." }

  let rateLimit
  try {
    rateLimit = await consumeRateLimit("mobile-update-aadhaar-verify", `${applicant.applicantId}:${input.requestId}`)
  } catch (error) {
    recordDependencyFailure(error, { dependency: "postgres", operation: "rate_limit_mobile_update_aadhaar" })
    return { kind: "unavailable", message: "Mock Aadhaar verification is temporarily unavailable. Try again shortly." }
  }
  if (!rateLimit.allowed) return { kind: "rate-limited", message: "Too many verification attempts. Try again later.", retryAfterSeconds: rateLimit.retryAfterSeconds }

  try {
    return await prisma.$transaction(async (transaction) => {
      const request = await transaction.mobileChangeRequest.findFirst({
        where: { applicantId: applicant.applicantId, id: input.requestId },
        include: { aadhaarVerification: true },
      })
      if (!request) return { kind: "request-not-found", message: "The mobile-update request was not found." }
      if (request.method !== "MOCK_AADHAAR") return { kind: "method-mismatch", message: "This request uses OTP verification." }
      if (request.status === "COMPLETED") {
        if (request.confirmationIdempotencyKey === input.idempotencyKey) {
          const account = await transaction.applicantAccount.findUnique({ where: { id: applicant.applicantId }, select: { authVersion: true, mobileLastFour: true } })
          if (account) return { kind: "completed", authVersion: account.authVersion, mobileLastFour: account.mobileLastFour }
        }
        return { kind: "otp-replayed", message: "This verification request has already been used." }
      }
      if (!isActiveStatus(request.status) || request.expiresAt <= new Date() || !request.aadhaarVerification) {
        await transaction.mobileChangeRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } })
        return { kind: "request-expired", message: "This verification request has expired. Start a new one." }
      }

      if (input.mockAssertion === "MOCK_AADHAAR_FAIL") {
        await transaction.mockAadhaarVerification.update({ where: { id: request.aadhaarVerification.id }, data: { completedAt: new Date(), reasonCode: "SYNTHETIC_ASSERTION_FAILED", status: "FAILED" } })
        await transaction.mobileChangeRequest.update({ where: { id: request.id }, data: { status: "FAILED" } })
        await transaction.auditEvent.create({ data: { action: "FAIL_MOCK_AADHAAR_VERIFICATION", actorId: applicant.applicantId, entityId: request.id, entityType: "MOBILE_CHANGE_REQUEST", reasonCode: "SYNTHETIC_ASSERTION_FAILED", requestId: randomUUID() } })
        return { kind: "aadhaar-failed", message: "The mock Aadhaar verification did not pass." }
      }

      await transaction.mockAadhaarVerification.update({ where: { id: request.aadhaarVerification.id }, data: { completedAt: new Date(), reasonCode: "SYNTHETIC_ASSERTION_PASSED", status: "PASSED" } })
      return completeMobileUpdate(transaction, request, input.idempotencyKey, applicant.applicantId)
    })
  } catch (error) {
    const targets = getUniqueConstraintTargets(error)
    if (targets.includes("applicantaccount_mobilehmac_key")) return { kind: "mobile-already-in-use", message: "This synthetic mobile number is already in use." }
    recordDependencyFailure(error, { dependency: "postgres", operation: "mobile_update_aadhaar_verify" })
    return { kind: "unavailable", message: "Mock Aadhaar verification is temporarily unavailable. Try again shortly." }
  }
}

export {
  completeMockAadhaarVerification,
  readMobileUpdateState,
  startMobileUpdate,
  verifyMobileUpdateOtp,
}
export type {
  MobileUpdateReadResult,
  MobileUpdateStartResult,
  MobileUpdateVerificationResult,
}
