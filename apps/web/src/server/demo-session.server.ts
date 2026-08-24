import "@tanstack/react-start/server-only"

import { prisma } from "@digilicense/db/server"
import { setResponseHeader, useSession } from "@tanstack/react-start/server"

type ApplicantSessionData = {
  applicantId: string
  authVersion: number
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
    typeof session.data.applicantId !== "string" ||
    typeof session.data.authVersion !== "number"
  ) {
    return null
  }

  const account = await prisma.applicantAccount.findUnique({
    where: { id: session.data.applicantId },
    select: { authVersion: true },
  })

  if (!account || account.authVersion !== session.data.authVersion) return null

  return {
    applicantId: session.data.applicantId,
    authVersion: account.authVersion,
  }
}

async function rotateApplicantSession(input: {
  applicantId: string
  authVersion: number
}) {
  const session = await getApplicantSession()
  await session.update({
    applicantId: input.applicantId,
    authVersion: input.authVersion,
    role: "applicant",
  })
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
  rotateApplicantSession,
}
