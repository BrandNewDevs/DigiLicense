import "@tanstack/react-start/server-only"

import { setResponseHeader, useSession } from "@tanstack/react-start/server"

type ApplicantSessionData = {
  applicantId: string
  role: "applicant"
}

type OperatorSessionData = {
  operatorId: string
  role: "operator"
}

type DemoRole = "applicant" | "operator"

function getSessionSecret() {
  const secret = process.env.DIGILICENSE_SESSION_SECRET

  if (!secret || secret.length < 32) {
    throw new Error(
      "DIGILICENSE_SESSION_SECRET must contain at least 32 characters."
    )
  }

  return secret
}

function getSessionOptions(role: DemoRole) {
  return {
    name: `digilicense-${role}`,
    password: getSessionSecret(),
    maxAge: 30 * 60,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
    sessionHeader: false as const,
  }
}

async function getApplicantSession() {
  return useSession<ApplicantSessionData>(getSessionOptions("applicant"))
}

async function getOperatorSession() {
  return useSession<OperatorSessionData>(getSessionOptions("operator"))
}

async function requireApplicant() {
  setResponseHeader("Cache-Control", "private, no-store")
  const session = await getApplicantSession()

  if (
    session.data.role !== "applicant" ||
    session.data.applicantId !== "demo-applicant-001"
  ) {
    return null
  }

  return { applicantId: session.data.applicantId }
}

async function requireOperator() {
  setResponseHeader("Cache-Control", "private, no-store")
  const session = await getOperatorSession()

  if (
    session.data.role !== "operator" ||
    session.data.operatorId !== "demo-operator-001"
  ) {
    return null
  }

  return { operatorId: session.data.operatorId }
}

export {
  getApplicantSession,
  getOperatorSession,
  requireApplicant,
  requireOperator,
}
