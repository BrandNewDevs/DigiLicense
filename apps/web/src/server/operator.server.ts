import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { WorkflowActor } from "../generated/prisma/enums"
import type { ApplicationStatus } from "../generated/prisma/enums"
import { operatorActions } from "../lib/operator-workflow"
import type { OperatorAction } from "../lib/operator-workflow"
import { prisma } from "./db.server"
import { requireOperator } from "./demo-session.server"

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

  const [applications, audits] = await Promise.all([
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

  const application = await prisma.application.findUnique({
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
  expectedVersion: number
  justification: string
}) {
  const operator = await requireOperator()

  if (!operator) return { kind: "authentication-required" as const }

  const transition = operatorActions[input.action]

  return prisma.$transaction(async (transaction) => {
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
        description: `${input.justification} This action changed synthetic DigiLicense data only.`,
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
        justification: input.justification,
        requestId: randomUUID(),
      },
    })

    return { kind: "updated" as const }
  })
}

export { applyOperatorAction, readOperatorApplication, readOperatorDashboard }
