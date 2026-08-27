import "@tanstack/react-start/server-only"

import { prisma } from "@digilicense/db/server"

import { getApplicationStatusLabel } from "../lib/application-status"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"

type DashboardResult =
  | {
      kind: "found"
      applications: Array<{
        applicationNumber: string
        nextAction: string
        service: string
        statusLabel: string
        statusDeadlineAt: string | null
        unreadNotifications: number
      }>
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

    const applications = await prisma.application.findMany({
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
    })

    return {
      kind: "found",
      applications: applications.map((application) => ({
        applicationNumber: application.applicationNumber,
        nextAction: application.nextAction,
        service: application.service,
        statusLabel: getApplicationStatusLabel(application.status),
        statusDeadlineAt: application.statusDeadlineAt?.toISOString() ?? null,
        unreadNotifications: application._count.notifications,
      })),
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

export { readApplicantDashboard }
