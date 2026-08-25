import { createHmac } from "node:crypto"

type MobileHashCandidate = {
  hmac: string
  keyVersion: string
}

type MobileHmacKey = {
  keyVersion: string
  secret: string
}

function normalizeMobileNumber(value: string): string | undefined {
  const normalized = value.trim()
  return /^\d{10}$/.test(normalized) ? normalized : undefined
}

function getRequiredSecret(name: string): string {
  const secret = process.env[name]

  if (!secret || secret.length < 32) {
    throw new Error(
      `${name} must contain at least 32 characters.`
    )
  }

  return secret
}

function hashWithKey(normalizedMobileNumber: string, key: MobileHmacKey): string {
  return createHmac("sha256", key.secret)
    .update(`mobile-number:${normalizedMobileNumber}`)
    .digest("hex")
}

function getMobileHmacKeys(): readonly MobileHmacKey[] {
  const current: MobileHmacKey = {
    keyVersion: process.env.DIGILICENSE_IDENTIFIER_HMAC_KEY_VERSION?.trim() || "v1",
    secret: getRequiredSecret("DIGILICENSE_IDENTIFIER_HMAC_SECRET"),
  }
  const previousSecret = process.env.DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_SECRET
  const previousVersion = process.env.DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_KEY_VERSION?.trim()

  if (!previousSecret && !previousVersion) return [current]
  if (!previousSecret || !previousVersion) {
    throw new Error(
      "DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_SECRET and DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_KEY_VERSION must be configured together."
    )
  }
  if (previousVersion === current.keyVersion) {
    throw new Error("Current and previous mobile HMAC key versions must differ.")
  }

  return [
    current,
    { keyVersion: previousVersion, secret: getRequiredSecret("DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_SECRET") },
  ]
}

function hashMobileNumber(normalizedMobileNumber: string): string {
  return hashWithKey(normalizedMobileNumber, getMobileHmacKeys()[0])
}

function getMobileHashCandidates(
  normalizedMobileNumber: string
): readonly MobileHashCandidate[] {
  return getMobileHmacKeys().map((key) => ({
    hmac: hashWithKey(normalizedMobileNumber, key),
    keyVersion: key.keyVersion,
  }))
}

function getCurrentMobileHmacKeyVersion(): string {
  return getMobileHmacKeys()[0].keyVersion
}

export {
  getCurrentMobileHmacKeyVersion,
  getMobileHashCandidates,
  hashMobileNumber,
  normalizeMobileNumber,
}
