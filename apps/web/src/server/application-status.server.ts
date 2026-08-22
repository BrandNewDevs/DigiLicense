import "@tanstack/react-start/server-only"

import { prisma } from "@digilicense/db/server"

import { getStatusLabel } from "../lib/operator-workflow"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"

async function lookupAuthorizedApplicationStatus(applicationNumber: string) {
  let applicant

  try {
    applicant = await requireApplicant()
  } catch {
    return {
      kind: "unavailable" as const,
      message: "Application tracking is temporarily unavailable.",
    }
  }

  if (!applicant) {
    return {
      kind: "authentication-required" as const,
      message: "Sign in as an applicant to track an application.",
    }
  }

  let record

  try {
    record = await prisma.application.findFirst({
      where: {
        applicantId: applicant.applicantId,
        applicationNumber,
      },
      select: {
        service: true,
        status: true,
        nextAction: true,
      },
    })
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "application_status_lookup",
    })

    return {
      kind: "unavailable" as const,
      message: "Application tracking is temporarily unavailable.",
    }
  }

  if (!record) {
    return {
      kind: "not-found" as const,
      message: "No application was found for this account and reference.",
    }
  }

  return {
    kind: "found" as const,
    service: record.service,
    status: getStatusLabel(record.status),
    nextAction: record.nextAction,
  }
}

export { lookupAuthorizedApplicationStatus }
