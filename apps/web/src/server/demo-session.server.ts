import "@tanstack/react-start/server-only"

import { setResponseHeader, useSession } from "@tanstack/react-start/server"

type ApplicantSessionData = {
  applicantId: string
  role: "applicant"
}

function getSessionSecret() {
  const secret = process.env.DIGILICENSE_SESSION_SECRET

  if (!secret || secret.length < 32) {
    throw new Error(
      "DIGILICENSE_SESSION_SECRET must contain at least 32 characters."
    )
  }

  return secret
}

function getSessionOptions() {
  return {
    name: "digilicense-applicant",
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
  return useSession<ApplicantSessionData>(getSessionOptions())
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

export {
  getApplicantSession,
  requireApplicant,
}
