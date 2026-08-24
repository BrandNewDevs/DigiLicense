import { createHmac } from "node:crypto"

function normalizeMobileNumber(value: string): string | undefined {
  const normalized = value.trim()
  return /^\d{10}$/.test(normalized) ? normalized : undefined
}

function getIdentifierHmacSecret(): string {
  const secret = process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET

  if (!secret || secret.length < 32) {
    throw new Error(
      "DIGILICENSE_IDENTIFIER_HMAC_SECRET must contain at least 32 characters."
    )
  }

  return secret
}

function hashMobileNumber(normalizedMobileNumber: string): string {
  return createHmac("sha256", getIdentifierHmacSecret())
    .update(`mobile-number:${normalizedMobileNumber}`)
    .digest("hex")
}

export { hashMobileNumber, normalizeMobileNumber }
