import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { prisma, WorkflowActor } from "@digilicense/db/server"
import type { ApplicationStatus } from "@digilicense/db/server"

import { getDecisionLabel, operatorActions } from "../lib/operator-workflow"
import type { OperatorAction } from "../lib/operator-workflow"
import { requireOperator } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"

function serializeApplication(application: {
  id: string
  applicationNumber: string
  service: string
  status: ApplicationStatus
  nextAction: string
  version: number
  submittedAt: Date
}) {
  return {
    ...application,
    submittedAt: application.submittedAt.toISOString(),
  }
}

async function readOperatorDashboard() {
  const operator = await requireOperator()

  if (!operator) return { kind: "authentication-required" as const }

  let applications, audits

  try {
    ;[applications, audits] = await Promise.all([
      prisma.application.findMany({
        orderBy: [{ submittedAt: "asc" }],
        take: 25,
        select: {
          id: true,
          applicationNumber: true,
          service: true,
          status: true,
          nextAction: true,
          version: true,
          submittedAt: true,
        },
      }),
      prisma.auditEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          action: true,
          entityId: true,
          reasonCode: true,
          createdAt: true,
        },
      }),
    ])
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "operator_dashboard_read",
    })

    throw error
  }

  return {
    kind: "ready" as const,
    operatorId: operator.operatorId,
    applications: applications.map(serializeApplication),
    audits: audits.map((audit) => ({
      ...audit,
      createdAt: audit.createdAt.toISOString(),
    })),
  }
}

async function readOperatorApplication(applicationId: string) {
  const operator = await requireOperator()

  if (!operator) return { kind: "authentication-required" as const }

  let application

  try {
    application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        applicationNumber: true,
        service: true,
        status: true,
        nextAction: true,
        version: true,
        submittedAt: true,
        workflowEvents: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            actor: true,
            title: true,
            description: true,
            toStatus: true,
            createdAt: true,
          },
        },
      },
    })
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "operator_application_read",
    })

    throw error
  }

  if (!application) return { kind: "not-found" as const }

  return {
    kind: "ready" as const,
    application: {
      ...serializeApplication(application),
      workflowEvents: application.workflowEvents.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    },
  }
}

async function applyOperatorAction(input: {
  applicationId: string
  action: OperatorAction
  decisionReasonCode: string
  expectedVersion: number
}) {
  const operator = await requireOperator()

  if (!operator) return { kind: "authentication-required" as const }

  // Only the fixed allowlisted label is ever persisted. The narrative-free
  // decision reason keeps contact details or application data out of these
  // append-only records.
  const decisionLabel = getDecisionLabel(input.action, input.decisionReasonCode)

  if (!decisionLabel) return { kind: "action-unavailable" as const }

  let actionLimit

  try {
    actionLimit = await consumeRateLimit("operator-action", operator.operatorId)
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "rate_limit_operator_action",
    })

    return { kind: "action-unavailable" as const }
  }

  if (!actionLimit.allowed) {
    return {
      kind: "rate-limited" as const,
      message:
        "Too many actions in a short time. Wait a moment, reload the case, and try again.",
      retryAfterSeconds: actionLimit.retryAfterSeconds,
    }
  }

  const transition = operatorActions[input.action]

  try {
    return await prisma.$transaction(async (transaction) => {
      const application = await transaction.application.findUnique({
        where: { id: input.applicationId },
        select: {
          id: true,
          applicationNumber: true,
          status: true,
          version: true,
        },
      })

      if (!application) return { kind: "not-found" as const }

      if (
        application.status !== transition.from ||
        application.version !== input.expectedVersion
      ) {
        return {
          kind: "conflict" as const,
          message:
            "This application changed. Reload it before taking another action.",
        }
      }

      const update = await transaction.application.updateMany({
        where: {
          id: application.id,
          status: transition.from,
          version: input.expectedVersion,
        },
        data: {
          status: transition.to,
          nextAction: transition.nextAction,
          version: { increment: 1 },
        },
      })

      if (update.count !== 1) {
        return {
          kind: "conflict" as const,
          message:
            "Another operator changed this application. Reload and try again.",
        }
      }

      await transaction.workflowEvent.create({
        data: {
          applicationId: application.id,
          actor: WorkflowActor.OPERATOR,
          actorId: operator.operatorId,
          title: transition.eventTitle,
          description: `${decisionLabel}. This action changed synthetic DigiLicense data only.`,
          fromStatus: transition.from,
          toStatus: transition.to,
        },
      })

      await transaction.auditEvent.create({
        data: {
          applicationId: application.id,
          actorId: operator.operatorId,
          action: input.action,
          entityType: "APPLICATION",
          entityId: application.applicationNumber,
          reasonCode: transition.reasonCode,
          justification: `Allowlisted decision reason: ${decisionLabel}`,
          requestId: randomUUID(),
        },
      })

      return { kind: "updated" as const }
    })
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "operator_action_transaction",
    })

    return { kind: "action-unavailable" as const }
  }
}

export { applyOperatorAction, readOperatorApplication, readOperatorDashboard }
