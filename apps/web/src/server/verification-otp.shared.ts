import "@tanstack/react-start/server-only"

import { createHmac, randomInt, timingSafeEqual } from "node:crypto"

// Each challenge receives an unpredictable code. The code is shown only to
// the authenticated applicant because this prototype does not send SMS.
function generateWorkflowOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0")
}

function getDemoApplicantOtp(): string {
  const configuredOtp = process.env.DIGILICENSE_DEMO_APPLICANT_OTP?.trim()
  if (configuredOtp && /^\d{6}$/.test(configuredOtp)) return configuredOtp
  if (process.env.NODE_ENV !== "production") return "676767"
  throw new Error(
    "DIGILICENSE_DEMO_APPLICANT_OTP must be a six-digit synthetic OTP in production."
  )
}

function hashWorkflowOtp(purpose: string, otp: string): string {
  const secret = process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET

  if (!secret || secret.length < 32) {
    throw new Error(
      "DIGILICENSE_IDENTIFIER_HMAC_SECRET must contain at least 32 characters."
    )
  }

  return createHmac("sha256", secret)
    .update(`${purpose}-otp:${otp}`)
    .digest("hex")
}

function workflowOtpMatches(
  purpose: string,
  expectedHash: string,
  candidateOtp: string
): boolean {
  const candidateHash = hashWorkflowOtp(purpose, candidateOtp)
  const expected = Buffer.from(expectedHash, "utf8")
  const candidate = Buffer.from(candidateHash, "utf8")

  return (
    expected.length === candidate.length && timingSafeEqual(expected, candidate)
  )
}

export {
  generateWorkflowOtp,
  getDemoApplicantOtp,
  hashWorkflowOtp,
  workflowOtpMatches,
}
