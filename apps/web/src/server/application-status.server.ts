import "@tanstack/react-start/server-only"

import { prisma } from "@digilicense/db/server"
import type {
  ApplicationBlockingReason,
  ApplicationStatus,
  DocumentStatus,
  DocumentType,
  PaymentStatus,
} from "@digilicense/db/server"

import {
  getApplicationStatusLabel,
  getBlockingReasonMessage,
} from "../lib/application-status"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"

const historyLimit = 50
const documentLimit = 20
const notificationLimit = 20
const unavailableMessage = "Application tracking is temporarily unavailable."
const notFoundMessage =
  "No application was found for this account and reference."

type ApplicationStatusProjection = {
  kind: "found"
  application: {
    applicationNumber: string
    service: string
    status: { code: ApplicationStatus; label: string }
    nextAction: string
    submittedAt: string
    updatedAt: string
    version: number
  }
  deadline: { kind: "EXPECTED_REVIEW_BY"; at: string; overdue: boolean } | null
  blockingReason: { code: ApplicationBlockingReason; message: string } | null
  payment: {
    amountPaise: number
    catalogueCode: string
    catalogueVersion: string
    completedAt: string | null
    disclosure: string
    reference: string | null
    status: PaymentStatus
  } | null
  serviceOutcome:
    | {
        disclosure: string
        kind: "RENEWAL"
        previousValidUntil: string
        renewedValidUntil: string | null
      }
    | {
        disclosure: string
        kind: "REPLACEMENT"
        replacementReference: string | null
      }
    | null
  appointment: {
    confirmed: {
      confirmedAt: string
      endsAt: string
      startsAt: string
      zone: string
    } | null
    offer: {
      expiresAt: string
      ranking: {
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
    state:
      | "CONFIRMED"
      | "COOLDOWN"
      | "OFFERED"
      | "PREFERENCES_REQUIRED"
      | "WAITLISTED"
      | "LEFT"
  } | null
  history: {
    items: Array<{
      id: string
      actor: "APPLICANT" | "OPERATOR" | "SYSTEM"
      title: string
      description: string
      fromStatus: ApplicationStatus | null
      toStatus: ApplicationStatus
      createdAt: string
    }>
    hasMore: boolean
  }
  documents: {
    items: Array<{
      id: string
      type: DocumentType
      status: DocumentStatus
      recordedAt: string
      updatedAt: string
    }>
    hasMore: boolean
  }
  notifications: {
    items: Array<{
      id: string
      title: string
      message: string
      createdAt: string
    }>
    unreadCount: number
    hasMore: boolean
  }
}

type ApplicationStatusResult =
  | ApplicationStatusProjection
  | { kind: "authentication-required"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }

type MarkNotificationReadResult =
  | { kind: "authentication-required"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "success" }
  | { kind: "unavailable"; message: string }

type AuthenticatedApplicant = { kind: "authenticated"; applicantId: string }
type AuthorizationFailure = Exclude<
  ApplicationStatusResult,
  ApplicationStatusProjection
>
type RateLimitFailure = Extract<
  ApplicationStatusResult,
  { kind: "rate-limited" | "unavailable" }
>

async function requireStatusApplicant(): Promise<
  AuthenticatedApplicant | AuthorizationFailure
> {
  try {
    const applicant = await requireApplicant()
    if (!applicant) {
      return {
        kind: "authentication-required",
        message: "Sign in as an applicant to track an application.",
      }
    }
    return { kind: "authenticated", applicantId: applicant.applicantId }
  } catch {
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function consumeStatusRateLimit(
  rule: "application-notification-read" | "application-status-lookup",
  applicantId: string
): Promise<{ kind: "allowed" } | RateLimitFailure> {
  try {
    const result = await consumeRateLimit(rule, applicantId)
    if (!result.allowed) {
      return {
        kind: "rate-limited",
        message: "Too many application tracking requests. Try again shortly.",
        retryAfterSeconds: result.retryAfterSeconds,
      }
    }
    return { kind: "allowed" }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_application_status",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function lookupAuthorizedApplicationStatus(
  applicationNumber: string
): Promise<ApplicationStatusResult> {
  const authorization = await requireStatusApplicant()
  if (authorization.kind !== "authenticated") return authorization

  const rateLimit = await consumeStatusRateLimit(
    "application-status-lookup",
    authorization.applicantId
  )
  if (rateLimit.kind !== "allowed") return rateLimit

  try {
    const record = await prisma.application.findFirst({
      where: {
        applicantId: authorization.applicantId,
        applicationNumber,
      },
      select: {
        applicationNumber: true,
        appointmentWaitlistEntries: {
          orderBy: { createdAt: "desc" },
          select: {
            offers: {
              select: {
                expiresAt: true,
                rankingBreakdown: true,
                rankingPolicyVersion: true,
                rankingScore: true,
                slot: { select: { endsAt: true, startsAt: true, zone: true } },
              },
              take: 1,
              where: { status: "ACTIVE" },
            },
            status: true,
          },
          take: 1,
        },
        blockingReasonCode: true,
        confirmedAppointment: {
          select: {
            confirmedAt: true,
            slot: { select: { endsAt: true, startsAt: true, zone: true } },
          },
        },
        documents: {
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
            id: true,
            status: true,
            type: true,
            updatedAt: true,
          },
          take: documentLimit + 1,
        },
        id: true,
        nextAction: true,
        notifications: {
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, id: true, message: true, title: true },
          take: notificationLimit + 1,
          where: { applicantId: authorization.applicantId, status: "UNREAD" },
        },
        service: true,
        renewalDetail: {
          select: { previousValidUntil: true, renewedValidUntil: true },
        },
        replacementDetail: {
          select: { replacementReference: true },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          select: {
            amountPaise: true,
            completedAt: true,
            feeSchedule: { select: { code: true } },
            feeScheduleVersion: true,
            reference: true,
            status: true,
          },
          take: 1,
        },
        status: true,
        statusDeadlineAt: true,
        submittedAt: true,
        updatedAt: true,
        version: true,
        workflowEvents: {
          orderBy: { createdAt: "desc" },
          select: {
            actor: true,
            createdAt: true,
            description: true,
            fromStatus: true,
            id: true,
            title: true,
            toStatus: true,
          },
          take: historyLimit + 1,
        },
      },
    })

    if (!record) return { kind: "not-found", message: notFoundMessage }

    const unreadCount = await prisma.notificationRecord.count({
      where: {
        applicantId: authorization.applicantId,
        applicationId: record.id,
        status: "UNREAD",
      },
    })
    const historyHasMore = record.workflowEvents.length > historyLimit
    const documentsHasMore = record.documents.length > documentLimit
    const notificationsHasMore = record.notifications.length > notificationLimit
    const deadline = record.statusDeadlineAt
    const waitlistEntry = record.appointmentWaitlistEntries.at(0)
    const activeOffer = waitlistEntry?.offers.at(0)
    const confirmedAppointment = record.confirmedAppointment
    const payment = record.payments.at(0)

    return {
      kind: "found",
      application: {
        applicationNumber: record.applicationNumber,
        service: record.service,
        status: {
          code: record.status,
          label: getApplicationStatusLabel(record.status),
        },
        nextAction: record.nextAction,
        submittedAt: record.submittedAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        version: record.version,
      },
      blockingReason: record.blockingReasonCode
        ? {
            code: record.blockingReasonCode,
            message: getBlockingReasonMessage(record.blockingReasonCode),
          }
        : null,
      payment: payment
        ? {
            amountPaise: payment.amountPaise,
            catalogueCode: payment.feeSchedule?.code ?? "LEGACY-PAYMENT",
            catalogueVersion: payment.feeScheduleVersion ?? "legacy",
            completedAt: payment.completedAt?.toISOString() ?? null,
            disclosure:
              "Recorded by DigiLicense only; no government service or payment provider was contacted.",
            reference: payment.reference,
            status: payment.status,
          }
        : null,
      serviceOutcome: record.renewalDetail
        ? {
            disclosure:
              "Recorded by DigiLicense only; no government service was contacted.",
            kind: "RENEWAL",
            previousValidUntil:
              record.renewalDetail.previousValidUntil.toISOString(),
            renewedValidUntil:
              record.renewalDetail.renewedValidUntil?.toISOString() ?? null,
          }
        : record.replacementDetail
          ? {
              disclosure:
                "Recorded by DigiLicense only; no government service was contacted.",
              kind: "REPLACEMENT",
              replacementReference:
                record.replacementDetail.replacementReference,
            }
          : null,
      appointment:
        record.service === "Permanent driving licence"
          ? {
              confirmed: confirmedAppointment
                ? {
                    confirmedAt: confirmedAppointment.confirmedAt.toISOString(),
                    endsAt: confirmedAppointment.slot.endsAt.toISOString(),
                    startsAt: confirmedAppointment.slot.startsAt.toISOString(),
                    zone: confirmedAppointment.slot.zone,
                  }
                : null,
              offer: activeOffer
                ? {
                    expiresAt: activeOffer.expiresAt.toISOString(),
                    ranking: {
                      breakdown:
                        activeOffer.rankingBreakdown &&
                        typeof activeOffer.rankingBreakdown === "object" &&
                        !Array.isArray(activeOffer.rankingBreakdown) &&
                        typeof activeOffer.rankingBreakdown.preferencePoints ===
                          "number" &&
                        typeof activeOffer.rankingBreakdown.urgencyPoints ===
                          "number" &&
                        typeof activeOffer.rankingBreakdown.waitTimePoints ===
                          "number"
                          ? {
                              preferencePoints:
                                activeOffer.rankingBreakdown.preferencePoints,
                              urgencyPoints:
                                activeOffer.rankingBreakdown.urgencyPoints,
                              waitTimePoints:
                                activeOffer.rankingBreakdown.waitTimePoints,
                            }
                          : null,
                      policyVersion: activeOffer.rankingPolicyVersion,
                      score: activeOffer.rankingScore,
                    },
                    slot: {
                      endsAt: activeOffer.slot.endsAt.toISOString(),
                      startsAt: activeOffer.slot.startsAt.toISOString(),
                      zone: activeOffer.slot.zone,
                    },
                  }
                : null,
              state: confirmedAppointment
                ? "CONFIRMED"
                : activeOffer
                  ? "OFFERED"
                  : waitlistEntry?.status === "COOLDOWN"
                    ? "COOLDOWN"
                    : waitlistEntry?.status === "LEFT"
                      ? "LEFT"
                      : waitlistEntry
                        ? "WAITLISTED"
                        : "PREFERENCES_REQUIRED",
            }
          : null,
      deadline: deadline
        ? {
            kind: "EXPECTED_REVIEW_BY",
            at: deadline.toISOString(),
            overdue: deadline.getTime() < Date.now(),
          }
        : null,
      documents: {
        items: record.documents.slice(0, documentLimit).map((document) => ({
          id: document.id,
          recordedAt: document.createdAt.toISOString(),
          status: document.status,
          type: document.type,
          updatedAt: document.updatedAt.toISOString(),
        })),
        hasMore: documentsHasMore,
      },
      history: {
        items: record.workflowEvents
          .slice(0, historyLimit)
          .reverse()
          .map((event) => ({
            actor: event.actor,
            createdAt: event.createdAt.toISOString(),
            description: event.description,
            fromStatus: event.fromStatus,
            id: event.id,
            title: event.title,
            toStatus: event.toStatus,
          })),
        hasMore: historyHasMore,
      },
      notifications: {
        items: record.notifications
          .slice(0, notificationLimit)
          .map((notification) => ({
            createdAt: notification.createdAt.toISOString(),
            id: notification.id,
            message: notification.message,
            title: notification.title,
          })),
        unreadCount,
        hasMore: notificationsHasMore,
      },
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "application_status_lookup",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

async function markApplicationNotificationRead(input: {
  applicationNumber: string
  notificationId: string
}): Promise<MarkNotificationReadResult> {
  const authorization = await requireStatusApplicant()
  if (authorization.kind !== "authenticated") return authorization

  const rateLimit = await consumeStatusRateLimit(
    "application-notification-read",
    authorization.applicantId
  )
  if (rateLimit.kind !== "allowed") return rateLimit

  try {
    const where = {
      applicantId: authorization.applicantId,
      application: {
        applicantId: authorization.applicantId,
        applicationNumber: input.applicationNumber,
      },
      id: input.notificationId,
    }
    const updated = await prisma.notificationRecord.updateMany({
      data: { readAt: new Date(), status: "READ" },
      where: { ...where, status: "UNREAD" },
    })
    if (updated.count === 1) return { kind: "success" }

    const alreadyRead = await prisma.notificationRecord.findFirst({
      where: { ...where, status: "READ" },
      select: { id: true },
    })
    return alreadyRead
      ? { kind: "success" }
      : { kind: "not-found", message: notFoundMessage }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "application_notification_read",
    })
    return { kind: "unavailable", message: unavailableMessage }
  }
}

export { lookupAuthorizedApplicationStatus, markApplicationNotificationRead }
export type { ApplicationStatusProjection }
