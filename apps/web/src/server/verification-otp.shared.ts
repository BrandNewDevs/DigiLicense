import "@tanstack/react-start/server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

function getMockWorkflowOtp(): string {
  const configuredOtp =
    process.env.DIGILICENSE_MOCK_WORKFLOW_OTP?.trim() ??
    process.env.DIGILICENSE_MOCK_MOBILE_UPDATE_OTP?.trim()

  if (configuredOtp && /^\d{6}$/.test(configuredOtp)) return configuredOtp

  if (process.env.NODE_ENV !== "production") return "123456"

  throw new Error(
    "DIGILICENSE_MOCK_WORKFLOW_OTP must be a six-digit synthetic OTP in production."
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

export { getMockWorkflowOtp, hashWorkflowOtp, workflowOtpMatches }
