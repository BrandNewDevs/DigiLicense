import "@tanstack/react-start/server-only"

import { setResponseHeader, useSession } from "@tanstack/react-start/server"

type ApplicantSessionData = {
  applicantId: string
  role: "applicant"
}

type ApplicationStatusRecord = {
  applicantId: string
  applicationNumber: string
  service: string
  status: string
  nextAction: string
}

const syntheticApplications: readonly ApplicationStatusRecord[] = [
  {
    applicantId: "demo-applicant-001",
    applicationNumber: "DLDEMO20260001",
    service: "Learner's licence",
    status: "Submitted",
    nextAction: "Wait for document review.",
  },
]

async function lookupAuthorizedApplicationStatus(applicationNumber: string) {
  setResponseHeader("Cache-Control", "private, no-store")

  const sessionPassword = process.env.DIGILICENSE_SESSION_SECRET

  if (!sessionPassword || sessionPassword.length < 32) {
    return {
      kind: "unavailable" as const,
      message: "Application tracking is temporarily unavailable.",
    }
  }

  let session

  try {
    session = await useSession<ApplicantSessionData>({
      name: "digilicense-applicant",
      password: sessionPassword,
      maxAge: 30 * 60,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
      sessionHeader: false,
    })
  } catch {
    return {
      kind: "authentication-required" as const,
      message: "Sign in as an applicant to track an application.",
    }
  }

  const { applicantId, role } = session.data

  if (role !== "applicant" || typeof applicantId !== "string") {
    return {
      kind: "authentication-required" as const,
      message: "Sign in as an applicant to track an application.",
    }
  }

  const record = syntheticApplications.find(
    (application) =>
      application.applicantId === applicantId &&
      application.applicationNumber === applicationNumber
  )

  if (!record) {
    return {
      kind: "not-found" as const,
      message: "No application was found for this account and reference.",
    }
  }

  return {
    kind: "found" as const,
    service: record.service,
    status: record.status,
    nextAction: record.nextAction,
  }
}

export { lookupAuthorizedApplicationStatus }
