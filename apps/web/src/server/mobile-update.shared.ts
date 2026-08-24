import "@tanstack/react-start/server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

function getMockMobileUpdateOtp(): string {
  const configuredOtp = process.env.DIGILICENSE_MOCK_MOBILE_UPDATE_OTP?.trim()

  if (configuredOtp && /^\d{6}$/.test(configuredOtp)) return configuredOtp

  if (process.env.NODE_ENV !== "production") return "123456"

  throw new Error(
    "DIGILICENSE_MOCK_MOBILE_UPDATE_OTP must be a six-digit synthetic OTP in production."
  )
}

function hashMobileUpdateOtp(otp: string): string {
  const secret = process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET

  if (!secret || secret.length < 32) {
    throw new Error(
      "DIGILICENSE_IDENTIFIER_HMAC_SECRET must contain at least 32 characters."
    )
  }

  return createHmac("sha256", secret)
    .update(`mobile-update-otp:${otp}`)
    .digest("hex")
}

function otpMatches(expectedHash: string, candidateOtp: string): boolean {
  const candidateHash = hashMobileUpdateOtp(candidateOtp)
  const expected = Buffer.from(expectedHash, "utf8")
  const candidate = Buffer.from(candidateHash, "utf8")

  return (
    expected.length === candidate.length && timingSafeEqual(expected, candidate)
  )
}

export { getMockMobileUpdateOtp, hashMobileUpdateOtp, otpMatches }
