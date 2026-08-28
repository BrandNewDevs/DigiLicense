import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import {
  FeeService,
  PaymentStatus,
  Prisma,
  WorkflowActor,
  prisma,
} from "@digilicense/db/server"
import type { ApplicationStatus } from "@digilicense/db/server"

import { addUtcYears, renewalValidityYears } from "../lib/renewal"
import type {
  FeeQuoteInput,
  ResolveApplicationPaymentInput,
  StartApplicationPaymentInput,
} from "../validation/payment"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit, getRateLimitClientIp } from "./rate-limit.server"

const unavailableMessage = "Payment service is temporarily unavailable."
const notFoundMessage = "No payment journey was found for this account."
const paymentBoundaryDisclosure =
  "Recorded by DigiLicense only; no government service or payment provider was contacted."

function throwIfAborted(signal?: AbortSignal) {
  signal?.throwIfAborted()
}

const publicServiceToFeeService = {
  "address-change": FeeService.ADDRESS_CHANGE,
  "learner-licence": FeeService.LEARNER_LICENCE,
  "permanent-licence": FeeService.PERMANENT_LICENCE,
  renewal: FeeService.RENEWAL,
  replacement: FeeService.REPLACEMENT,
} as const

const applicationServiceToFeeService: Readonly<
  Partial<Record<string, FeeService>>
> = {
  "Driving-licence address change": FeeService.ADDRESS_CHANGE,
  "Driving-licence renewal": FeeService.RENEWAL,
  "Duplicate or replacement driving licence": FeeService.REPLACEMENT,
  "Learner's licence": FeeService.LEARNER_LICENCE,
  "Permanent driving licence": FeeService.PERMANENT_LICENCE,
}

type FeeQuote = {
  amountPaise: number
  catalogueCode: string
  catalogueVersion: string
  disclosure: string
  kind: "found"
  service: keyof typeof publicServiceToFeeService
}

type FeeQuoteResult =
  | FeeQuote
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }

type PaymentProjection = {
  amountPaise: number
  catalogueCode: string
  catalogueVersion: string
  completedAt: string | null
  disclosure: string
  id: string
  reference: string | null
  status: PaymentStatus
}

type PaymentFailure =
  | { kind: "authentication-required"; message: string }
  | { kind: "invalid-state"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }

type PaymentReadResult =
  | PaymentFailure
  | { kind: "found"; payment: PaymentProjection | null }
type PaymentStartResult =
  | PaymentFailure
  | { kind: "already-paid" | "started"; payment: PaymentProjection }
type PaymentResolveResult =
  | PaymentFailure
  | {
      applicationStatus: ApplicationStatus
      kind: "failed" | "paid"
      payment: PaymentProjection
    }

type ProjectablePayment = {
  amountPaise: number
  completedAt: Date | null
  feeSchedule: { code: string } | null
  feeScheduleVersion: string | null
  id: string
  reference: string | null
  status: PaymentStatus
}

type ResolvedProjectablePayment = ProjectablePayment & {
  application: { status: ApplicationStatus }
}

type PaymentCompletionTransition = {
  blockingReasonCode:
    | "APPOINTMENT_PREFERENCES_REQUIRED"
    | "DOCUMENT_REVIEW_PENDING"
    | null
  documentStatus: "ACCEPTED" | "UNDER_REVIEW" | null
  events: Array<{
    description: string
    fromStatus: ApplicationStatus
    title: string
    toStatus: ApplicationStatus
  }>
  nextAction: string
  notification: { message: string; title: string }
  status: ApplicationStatus
  statusDeadlineAt: Date | null
}

function getPaymentCompletionTransition(
  service: string,
  completedAt: Date
): PaymentCompletionTransition {
  if (service === "Learner's licence") {
    return {
      blockingReasonCode: null,
      documentStatus: "ACCEPTED",
      events: [
        {
          description:
            "DigiLicense automatically completed the document checks. No government service or real document was used.",
          fromStatus: "PAYMENT_CONFIRMED",
          title: "Automatic checks completed",
          toStatus: "DOCUMENTS_VERIFIED",
        },
      ],
      nextAction: "Your application is ready for the learner's test.",
      notification: {
        message: "Your application is ready for the learner's test.",
        title: "Learner application ready",
      },
      status: "DOCUMENTS_VERIFIED",
      statusDeadlineAt: null,
    }
  }
  if (service === "Permanent driving licence") {
    return {
      blockingReasonCode: "APPOINTMENT_PREFERENCES_REQUIRED",
      documentStatus: null,
      events: [
        {
          description:
            "The application can now join the DigiLicense appointment waitlist. No government service was contacted.",
          fromStatus: "PAYMENT_CONFIRMED",
          title: "Appointment preferences available",
          toStatus: "WAITLISTED",
        },
      ],
      nextAction:
        "Choose driving-test appointment preferences to join the waitlist.",
      notification: {
        message:
          "Choose driving-test appointment preferences to join the waitlist.",
        title: "Appointment preferences available",
      },
      status: "WAITLISTED",
      statusDeadlineAt: null,
    }
  }
  if (service === "Driving-licence address change") {
    return {
      blockingReasonCode: "DOCUMENT_REVIEW_PENDING",
      documentStatus: "UNDER_REVIEW",
      events: [
        {
          description:
            "DigiLicense started the automatic proof review. No government service was contacted.",
          fromStatus: "PAYMENT_CONFIRMED",
          title: "Address proof review started",
          toStatus: "DOCUMENT_REVIEW",
        },
      ],
      nextAction:
        "DigiLicense is reviewing the submitted proof. No government service was contacted.",
      notification: {
        message: "DigiLicense started the automatic address-proof review.",
        title: "Address proof review started",
      },
      status: "DOCUMENT_REVIEW",
      statusDeadlineAt: new Date(completedAt.getTime() + 60_000),
    }
  }
  if (service === "Driving-licence renewal") {
    return {
      blockingReasonCode: null,
      documentStatus: null,
      events: [
        {
          description:
            "DigiLicense rechecked the owned licence record and renewal window after payment.",
          fromStatus: "PAYMENT_CONFIRMED",
          title: "Renewal checks completed",
          toStatus: "APPROVAL_PENDING",
        },
        {
          description:
            "The renewal is recorded by DigiLicense only under its ten-year validity rule; no government service was contacted.",
          fromStatus: "APPROVAL_PENDING",
          title: "Renewal recorded",
          toStatus: "APPROVED",
        },
      ],
      nextAction:
        "No further action is required. The renewal is recorded by DigiLicense only; no government service was contacted.",
      notification: {
        message: "Your renewal has been recorded.",
        title: "Renewal recorded",
      },
      status: "APPROVED",
      statusDeadlineAt: null,
    }
  }
  if (service === "Duplicate or replacement driving licence") {
    return {
      blockingReasonCode: null,
      documentStatus: "ACCEPTED",
      events: [
        {
          description:
            "DigiLicense rechecked the owned licence and recorded declaration after payment.",
          fromStatus: "PAYMENT_CONFIRMED",
          title: "Replacement checks completed",
          toStatus: "APPROVAL_PENDING",
        },
        {
          description:
            "The replacement is recorded by DigiLicense only; the licence number is unchanged and no government service was contacted.",
          fromStatus: "APPROVAL_PENDING",
          title: "Replacement recorded",
          toStatus: "APPROVED",
        },
      ],
      nextAction:
        "No further action is required. The replacement is recorded by DigiLicense only; no government service was contacted.",
      notification: {
        message: "Your replacement has been recorded.",
        title: "Replacement recorded",
      },
      status: "APPROVED",
      statusDeadlineAt: null,
    }
  }
  return {
    blockingReasonCode: null,
    documentStatus: null,
    events: [],
    nextAction:
      "Payment is recorded by DigiLicense only. Continue with the service workflow.",
    notification: {
      message: "Your payment outcome was recorded.",
      title: "Payment recorded",
    },
    status: "PAYMENT_CONFIRMED",
    statusDeadlineAt: null,
  }
}

function projectPayment(payment: ProjectablePayment): PaymentProjection {
  return {
    amountPaise: payment.amountPaise,
    catalogueCode: payment.feeSchedule?.code ?? "LEGACY-PAYMENT",
    catalogueVersion: payment.feeScheduleVersion ?? "legacy",
    completedAt: payment.completedAt?.toISOString() ?? null,
    disclosure: paymentBoundaryDisclosure,
    id: payment.id,
    reference: payment.reference,
    status: payment.status,
  }
}

async function getFeeQuote(
  input: FeeQuoteInput,
  signal?: AbortSignal
): Promise<FeeQuoteResult> {
  throwIfAborted(signal)
  try {
    const rateLimit = await consumeRateLimit(
      "fee-quote-public",
      getRateLimitClientIp()
    )
    if (!rateLimit.allowed) {
      return {
        kind: "rate-limited",
        message: "Too many fee requests. Try again shortly.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      }
    }

    throwIfAborted(signal)
    const fee = await prisma.feeSchedule.findFirst({
      where: {
        active: true,
        effectiveFrom: { lte: new Date() },
        service: publicServiceToFeeService[input.service],
      },
      orderBy: { effectiveFrom: "desc" },
      select: { amountPaise: true, code: true, version: true },
    })
    throwIfAborted(signal)
    if (!fee) return { kind: "unavailable", message: unavailableMessage }

    return {
      amountPaise: fee.amountPaise,
      catalogueCode: fee.code,
      catalogueVersion: fee.version,
      disclosure: paymentBoundaryDisclosure,
      kind: "found",
      service: input.service,
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "fee_quote_read",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function authenticatePaymentApplicant(): Promise<
  { applicantId: string; kind: "authenticated" } | PaymentFailure
> {
  try {
    const applicant = await requireApplicant()
    return applicant
      ? { applicantId: applicant.applicantId, kind: "authenticated" }
      : {
          kind: "authentication-required",
          message: "Sign in as an applicant to manage a payment.",
        }
  } catch {
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function consumePaymentRateLimit(
  rule:
    | "application-payment-read"
    | "application-payment-resolve"
    | "application-payment-start",
  applicantId: string
): Promise<{ kind: "allowed" } | PaymentFailure> {
  try {
    const rateLimit = await consumeRateLimit(rule, applicantId)
    if (!rateLimit.allowed) {
      return {
        kind: "rate-limited",
        message: "Too many payment requests. Try again shortly.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      }
    }
    return { kind: "allowed" }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_payment",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

const paymentProjectionSelect = {
  amountPaise: true,
  completedAt: true,
  feeSchedule: { select: { code: true } },
  feeScheduleVersion: true,
  id: true,
  reference: true,
  status: true,
} as const

async function readApplicationPayment(
  input: { applicationNumber: string },
  signal?: AbortSignal
): Promise<PaymentReadResult> {
  throwIfAborted(signal)
  const authorization = await authenticatePaymentApplicant()
  if (authorization.kind !== "authenticated") return authorization

  const rateLimit = await consumePaymentRateLimit(
    "application-payment-read",
    authorization.applicantId
  )
  if (rateLimit.kind !== "allowed") return rateLimit

  try {
    throwIfAborted(signal)
    const application = await prisma.application.findFirst({
      where: {
        applicantId: authorization.applicantId,
        applicationNumber: input.applicationNumber,
      },
      select: {
        payments: {
          orderBy: { createdAt: "desc" },
          select: paymentProjectionSelect,
          take: 1,
        },
      },
    })
    throwIfAborted(signal)
    if (!application) return { kind: "not-found", message: notFoundMessage }

    return {
      kind: "found",
      payment: application.payments[0]
        ? projectPayment(application.payments[0])
        : null,
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "application_payment_read",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function findOwnedStartReplay(
  applicantId: string,
  input: StartApplicationPaymentInput,
  signal?: AbortSignal
): Promise<ProjectablePayment | null> {
  throwIfAborted(signal)
  const replay = await prisma.paymentRecord.findFirst({
    where: {
      application: {
        applicantId,
        applicationNumber: input.applicationNumber,
      },
      idempotencyKey: input.idempotencyKey,
    },
    select: paymentProjectionSelect,
  })
  throwIfAborted(signal)
  return replay
}

async function startApplicationPayment(
  input: StartApplicationPaymentInput,
  signal?: AbortSignal
): Promise<PaymentStartResult> {
  throwIfAborted(signal)
  const authorization = await authenticatePaymentApplicant()
  if (authorization.kind !== "authenticated") return authorization

  try {
    const replay = await findOwnedStartReplay(
      authorization.applicantId,
      input,
      signal
    )
    if (replay) {
      return {
        kind: replay.status === PaymentStatus.PAID ? "already-paid" : "started",
        payment: projectPayment(replay),
      }
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "application_payment_start_replay",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }

  const rateLimit = await consumePaymentRateLimit(
    "application-payment-start",
    authorization.applicantId
  )
  if (rateLimit.kind !== "allowed") return rateLimit

  try {
    throwIfAborted(signal)
    const result = await prisma.$transaction(async (transaction) => {
      throwIfAborted(signal)
      const application = await transaction.application.findFirst({
        where: {
          applicantId: authorization.applicantId,
          applicationNumber: input.applicationNumber,
        },
        select: { id: true, service: true, status: true },
      })
      if (!application) return { kind: "not-found" as const }

      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${application.id}, 0))
      `

      const replay = await transaction.paymentRecord.findFirst({
        where: {
          applicationId: application.id,
          idempotencyKey: input.idempotencyKey,
        },
        select: paymentProjectionSelect,
      })
      if (replay) {
        return {
          kind:
            replay.status === PaymentStatus.PAID
              ? ("already-paid" as const)
              : ("started" as const),
          payment: replay,
        }
      }

      const paid = await transaction.paymentRecord.findFirst({
        where: { applicationId: application.id, status: PaymentStatus.PAID },
        select: paymentProjectionSelect,
      })
      if (paid) return { kind: "already-paid" as const, payment: paid }
      if (application.status !== "PAYMENT_REVIEW") {
        return { kind: "invalid-state" as const }
      }

      const active = await transaction.paymentRecord.findFirst({
        where: {
          applicationId: application.id,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
        orderBy: { createdAt: "desc" },
        select: paymentProjectionSelect,
      })
      if (active) return { kind: "started" as const, payment: active }

      const feeService = applicationServiceToFeeService[application.service]
      if (!feeService) return { kind: "invalid-state" as const }
      const fee = await transaction.feeSchedule.findFirst({
        where: {
          active: true,
          effectiveFrom: { lte: new Date() },
          service: feeService,
        },
        orderBy: { effectiveFrom: "desc" },
        select: { amountPaise: true, code: true, id: true, version: true },
      })
      if (!fee) return { kind: "unavailable" as const }

      const payment = await transaction.paymentRecord.create({
        data: {
          amountPaise: fee.amountPaise,
          applicationId: application.id,
          feeLines: JSON.stringify([
            {
              amountPaise: fee.amountPaise,
              catalogueCode: fee.code,
              catalogueVersion: fee.version,
            },
          ]),
          feeScheduleId: fee.id,
          feeScheduleVersion: fee.version,
          idempotencyKey: input.idempotencyKey,
        },
        select: paymentProjectionSelect,
      })
      await transaction.auditEvent.create({
        data: {
          action: "START_PAYMENT",
          actorId: authorization.applicantId,
          applicationId: application.id,
          entityId: payment.id,
          entityType: "PAYMENT",
          reasonCode: "DIGILICENSE_PAYMENT_STARTED",
          requestId: randomUUID(),
        },
      })
      return { kind: "started" as const, payment }
    })
    throwIfAborted(signal)

    if (result.kind === "not-found") {
      return { kind: "not-found", message: notFoundMessage }
    }
    if (result.kind === "invalid-state") {
      return {
        kind: "invalid-state",
        message: "This application is not awaiting a payment.",
      }
    }
    if (result.kind === "unavailable") {
      return { kind: "unavailable", message: unavailableMessage }
    }
    return { kind: result.kind, payment: projectPayment(result.payment) }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replay = await findOwnedStartReplay(
        authorization.applicantId,
        input,
        signal
      )
      if (replay) {
        return {
          kind:
            replay.status === PaymentStatus.PAID ? "already-paid" : "started",
          payment: projectPayment(replay),
        }
      }
    }
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "application_payment_start",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function findOwnedResolutionReplay(
  applicantId: string,
  input: ResolveApplicationPaymentInput,
  signal?: AbortSignal
): Promise<ResolvedProjectablePayment | null> {
  throwIfAborted(signal)
  const replay = await prisma.paymentRecord.findFirst({
    where: {
      application: {
        applicantId,
        applicationNumber: input.applicationNumber,
      },
      id: input.paymentId,
      resolutionIdempotencyKey: input.idempotencyKey,
    },
    select: {
      ...paymentProjectionSelect,
      application: { select: { status: true } },
    },
  })
  throwIfAborted(signal)
  return replay
}

function projectResolvedPayment(
  payment: ProjectablePayment,
  applicationStatus: ApplicationStatus
): PaymentResolveResult {
  const paid = payment.status === PaymentStatus.PAID
  return {
    applicationStatus,
    kind: paid ? "paid" : "failed",
    payment: projectPayment(payment),
  }
}

async function resolveApplicationPayment(
  input: ResolveApplicationPaymentInput,
  signal?: AbortSignal
): Promise<PaymentResolveResult> {
  throwIfAborted(signal)
  const authorization = await authenticatePaymentApplicant()
  if (authorization.kind !== "authenticated") return authorization

  try {
    const replay = await findOwnedResolutionReplay(
      authorization.applicantId,
      input,
      signal
    )
    if (replay) return projectResolvedPayment(replay, replay.application.status)
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "application_payment_resolution_replay",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }

  const rateLimit = await consumePaymentRateLimit(
    "application-payment-resolve",
    authorization.applicantId
  )
  if (rateLimit.kind !== "allowed") return rateLimit

  try {
    throwIfAborted(signal)
    const result = await prisma.$transaction(async (transaction) => {
      throwIfAborted(signal)
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT payment."id"
        FROM "PaymentRecord" payment
        INNER JOIN "Application" application
          ON application."id" = payment."applicationId"
        WHERE payment."id" = ${input.paymentId}
          AND application."applicationNumber" = ${input.applicationNumber}
          AND application."applicantId" = ${authorization.applicantId}
        FOR UPDATE OF payment, application
      `
      if (!locked[0]) return { kind: "not-found" as const }

      const payment = await transaction.paymentRecord.findUniqueOrThrow({
        where: { id: input.paymentId },
        select: {
          ...paymentProjectionSelect,
          application: { select: { id: true, service: true, status: true } },
          resolutionIdempotencyKey: true,
        },
      })
      if (payment.resolutionIdempotencyKey === input.idempotencyKey) {
        return {
          applicationStatus: payment.application.status,
          kind: "resolved" as const,
          payment,
        }
      }
      if (payment.status !== PaymentStatus.PENDING) {
        return { kind: "invalid-state" as const }
      }
      if (payment.application.status !== "PAYMENT_REVIEW") {
        return { kind: "invalid-state" as const }
      }

      const completedAt = new Date()
      const paid = input.outcome === "SUCCESS"
      const completion = getPaymentCompletionTransition(
        payment.application.service,
        completedAt
      )
      const nextStatus = paid ? completion.status : "PAYMENT_REVIEW"
      const updatedPayment = await transaction.paymentRecord.update({
        where: { id: payment.id },
        data: {
          completedAt,
          failureReason: paid ? null : "RECORDED_FAILURE",
          reference: paid
            ? `DLPAY-${completedAt.getUTCFullYear()}-${randomUUID()
                .replaceAll("-", "")
                .slice(0, 12)
                .toUpperCase()}`
            : null,
          resolutionIdempotencyKey: input.idempotencyKey,
          status: paid ? PaymentStatus.PAID : PaymentStatus.FAILED,
        },
        select: paymentProjectionSelect,
      })
      if (paid && payment.application.service === "Driving-licence renewal") {
        const renewal = await transaction.renewalDetail.findUniqueOrThrow({
          where: { applicationId: payment.application.id },
          select: {
            id: true,
            licenceRecord: { select: { id: true, validUntil: true } },
          },
        })
        const validityBase =
          renewal.licenceRecord.validUntil > completedAt
            ? renewal.licenceRecord.validUntil
            : completedAt
        const renewedValidUntil = addUtcYears(
          validityBase,
          renewalValidityYears
        )
        await transaction.drivingLicenceRecord.update({
          where: { id: renewal.licenceRecord.id },
          data: {
            lastRenewedAt: completedAt,
            validUntil: renewedValidUntil,
            version: { increment: 1 },
          },
        })
        await transaction.renewalDetail.update({
          where: { id: renewal.id },
          data: { renewedValidUntil },
        })
        await transaction.auditEvent.create({
          data: {
            action: "AUTO_APPROVE_RENEWAL",
            actorId: "digilicense-payment-workflow",
            applicationId: payment.application.id,
            entityId: renewal.id,
            entityType: "RENEWAL",
            reasonCode: "DIGILICENSE_RENEWAL_RULE_APPLIED",
            requestId: randomUUID(),
          },
        })
      }
      if (
        paid &&
        payment.application.service ===
          "Duplicate or replacement driving licence"
      ) {
        const replacement =
          await transaction.replacementDetail.findUniqueOrThrow({
            where: { applicationId: payment.application.id },
            select: {
              id: true,
              licenceRecord: { select: { id: true } },
            },
          })
        const replacementReference = `DLREPL-${completedAt.getUTCFullYear()}-${randomUUID()
          .replaceAll("-", "")
          .slice(0, 12)
          .toUpperCase()}`
        await transaction.drivingLicenceRecord.update({
          where: { id: replacement.licenceRecord.id },
          data: {
            lastReplacementAt: completedAt,
            version: { increment: 1 },
          },
        })
        await transaction.replacementDetail.update({
          where: { id: replacement.id },
          data: { replacementReference },
        })
        await transaction.auditEvent.create({
          data: {
            action: "AUTO_APPROVE_REPLACEMENT",
            actorId: "digilicense-payment-workflow",
            applicationId: payment.application.id,
            entityId: replacement.id,
            entityType: "REPLACEMENT",
            reasonCode: "DIGILICENSE_REPLACEMENT_RECORDED",
            requestId: randomUUID(),
          },
        })
      }
      await transaction.application.update({
        where: { id: payment.application.id },
        data: {
          blockingReasonCode: paid
            ? completion.blockingReasonCode
            : "PAYMENT_CONFIRMATION_PENDING",
          nextAction: paid
            ? completion.nextAction
            : "Choose retry to record another DigiLicense-only payment outcome.",
          status: nextStatus,
          statusDeadlineAt: paid ? completion.statusDeadlineAt : null,
          version: { increment: 1 },
        },
      })
      await transaction.workflowEvent.create({
        data: {
          actor: WorkflowActor.APPLICANT,
          actorId: authorization.applicantId,
          applicationId: payment.application.id,
          description: paid
            ? `Payment outcome recorded. ${paymentBoundaryDisclosure}`
            : `Payment was not completed. ${paymentBoundaryDisclosure}`,
          fromStatus: "PAYMENT_REVIEW",
          title: paid ? "Payment recorded" : "Payment attempt not completed",
          toStatus: paid ? "PAYMENT_CONFIRMED" : "PAYMENT_REVIEW",
        },
      })
      if (paid && completion.events.length > 0) {
        await transaction.workflowEvent.createMany({
          data: completion.events.map((event) => ({
            ...event,
            actor: WorkflowActor.SYSTEM,
            actorId: "digilicense-payment-workflow",
            applicationId: payment.application.id,
          })),
        })
      }
      if (paid && completion.documentStatus) {
        await transaction.documentRecord.updateMany({
          where: { applicationId: payment.application.id },
          data: { status: completion.documentStatus },
        })
      }
      await transaction.notificationRecord.create({
        data: {
          applicantId: authorization.applicantId,
          applicationId: payment.application.id,
          message: paid
            ? `${completion.notification.message} ${paymentBoundaryDisclosure}`
            : `Your payment was not completed. You can retry. ${paymentBoundaryDisclosure}`,
          title: paid
            ? completion.notification.title
            : "Payment retry available",
        },
      })
      await transaction.auditEvent.create({
        data: {
          action: paid ? "RECORD_PAYMENT_SUCCESS" : "RECORD_PAYMENT_FAILURE",
          actorId: authorization.applicantId,
          applicationId: payment.application.id,
          entityId: payment.id,
          entityType: "PAYMENT",
          reasonCode: paid
            ? "DIGILICENSE_PAYMENT_RECORDED"
            : "DIGILICENSE_PAYMENT_FAILED",
          requestId: randomUUID(),
        },
      })
      return {
        applicationStatus: nextStatus,
        kind: "resolved" as const,
        payment: updatedPayment,
      }
    })
    throwIfAborted(signal)

    if (result.kind === "not-found") {
      return { kind: "not-found", message: notFoundMessage }
    }
    if (result.kind === "invalid-state") {
      return {
        kind: "invalid-state",
        message: "This payment can no longer be changed.",
      }
    }
    return projectResolvedPayment(result.payment, result.applicationStatus)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replay = await findOwnedResolutionReplay(
        authorization.applicantId,
        input,
        signal
      )
      if (replay)
        return projectResolvedPayment(replay, replay.application.status)
    }
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "application_payment_resolve",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

export {
  getFeeQuote,
  readApplicationPayment,
  resolveApplicationPayment,
  startApplicationPayment,
}
export type {
  FeeQuoteResult,
  PaymentProjection,
  PaymentReadResult,
  PaymentResolveResult,
  PaymentStartResult,
}
