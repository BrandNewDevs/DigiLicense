import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { prisma } from "@digilicense/db/server"

import { getApplicationStatusLabel } from "../lib/application-status"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"

type DashboardResult =
  | {
      kind: "found"
      applicationCount: number
      applications: Array<{
        applicationNumber: string
        nextAction: string
        service: string
        statusLabel: string
        statusDeadlineAt: string | null
        unreadNotifications: number
      }>
      unreadNotificationCount: number
      isWalkthroughAccount: boolean
    }
  | { kind: "authentication-required"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }

async function readApplicantDashboard(): Promise<DashboardResult> {
  let applicantId: string
  try {
    const applicant = await requireApplicant()
    if (!applicant) {
      return {
        kind: "authentication-required",
        message: "Sign in as an applicant to view your dashboard.",
      }
    }
    applicantId = applicant.applicantId
  } catch {
    return {
      kind: "unavailable",
      message: "Your dashboard is temporarily unavailable.",
    }
  }

  try {
    const rate = await consumeRateLimit("applicant-dashboard-read", applicantId)
    if (!rate.allowed) {
      return {
        kind: "rate-limited",
        message: "Please wait before refreshing your dashboard.",
        retryAfterSeconds: rate.retryAfterSeconds,
      }
    }

    const [applications, applicationCount, unreadNotificationCount] =
      await Promise.all([
        prisma.application.findMany({
          where: { applicantId },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            applicationNumber: true,
            nextAction: true,
            service: true,
            status: true,
            statusDeadlineAt: true,
            _count: {
              select: {
                notifications: { where: { applicantId, status: "UNREAD" } },
              },
            },
          },
        }),
        prisma.application.count({ where: { applicantId } }),
        prisma.notificationRecord.count({
          where: { applicantId, status: "UNREAD" },
        }),
      ])

    return {
      kind: "found",
      applicationCount,
      applications: applications.map((application) => ({
        applicationNumber: application.applicationNumber,
        nextAction: application.nextAction,
        service: application.service,
        statusLabel: getApplicationStatusLabel(application.status),
        statusDeadlineAt: application.statusDeadlineAt?.toISOString() ?? null,
        unreadNotifications: application._count.notifications,
      })),
      unreadNotificationCount,
      isWalkthroughAccount: applicantId === "demo-applicant-004",
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "applicant_dashboard_read",
    })
    return {
      kind: "unavailable",
      message: "Your dashboard is temporarily unavailable.",
    }
  }
}

async function resetWalkthroughAppointment(): Promise<
  | { kind: "reset"; message: string }
  | { kind: "not-available"; message: string }
  | { kind: "authentication-required"; message: string }
  | { kind: "rate-limited"; message: string; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
> {
  const applicant = await requireApplicant()
  if (!applicant)
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to reset this walkthrough.",
    }
  if (applicant.applicantId !== "demo-applicant-004")
    return {
      kind: "not-available",
      message: "This reset is available only for the walkthrough account.",
    }

  try {
    const rate = await consumeRateLimit(
      "walkthrough-reset",
      applicant.applicantId
    )
    if (!rate.allowed) {
      return {
        kind: "rate-limited",
        message: "Please wait before resetting the walkthrough.",
        retryAfterSeconds: rate.retryAfterSeconds,
      }
    }

    await prisma.$transaction(async (transaction) => {
      const applications = await transaction.application.findMany({
        where: { applicantId: applicant.applicantId },
        select: { id: true },
      })
      const applicationIds = applications.map((application) => application.id)
      const offers = await transaction.appointmentOffer.findMany({
        where: { waitlistEntry: { applicationId: { in: applicationIds } } },
        select: { id: true, slotId: true },
      })
      const offerIds = offers.map((offer) => offer.id)
      const slotIds = offers.map((offer) => offer.slotId)

      await transaction.confirmedAppointment.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.appointmentNotificationDelivery.deleteMany({
        where: { offerId: { in: offerIds } },
      })
      await transaction.appointmentOffer.deleteMany({
        where: { id: { in: offerIds } },
      })
      await transaction.appointmentWaitlistEntry.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.appointmentSlot.updateMany({
        where: {
          id: { in: slotIds },
          confirmation: { is: null },
          offers: {
            none: {
              status: "ACTIVE",
              waitlistEntry: { applicantId: { not: applicant.applicantId } },
            },
          },
        },
        data: { status: "OPEN" },
      })
      await transaction.learnerTestAttempt.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.documentRecord.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.paymentRecord.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.notificationRecord.deleteMany({
        where: { applicantId: applicant.applicantId },
      })
      await transaction.workflowEvent.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.auditEvent.deleteMany({
        where: {
          OR: [
            { applicationId: { in: applicationIds } },
            { actorId: applicant.applicantId },
          ],
        },
      })
      await transaction.applicationDraft.deleteMany({
        where: { applicantId: applicant.applicantId },
      })
      await transaction.addressChangeDetail.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.renewalDetail.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.replacementDetail.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.permanentLicenceDetail.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.learnerLicenceDetail.deleteMany({
        where: { applicationId: { in: applicationIds } },
      })
      await transaction.application.deleteMany({
        where: { id: { in: applicationIds } },
      })
      await transaction.auditEvent.create({
        data: {
          action: "RESET_WALKTHROUGH",
          actorId: applicant.applicantId,
          entityId: applicant.applicantId,
          entityType: "APPLICANT_ACCOUNT",
          reasonCode: "JUDGE_WALKTHROUGH_RESET",
          requestId: randomUUID(),
        },
      })
    })
    return {
      kind: "reset",
      message: "The walkthrough has been reset to the learner application.",
    }
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "walkthrough_appointment_reset",
    })
    return { kind: "unavailable", message: "The reset could not be completed." }
  }
}

export { readApplicantDashboard, resetWalkthroughAppointment }
