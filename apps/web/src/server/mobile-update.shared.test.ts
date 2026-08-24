import { afterEach, describe, expect, it } from "vitest"

import {
  hashMobileUpdateOtp,
  otpMatches,
} from "./mobile-update.shared"

const previousHmacSecret = process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET

afterEach(() => {
  if (previousHmacSecret === undefined) {
    delete process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET
    return
  }

  process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET = previousHmacSecret
})

describe("mobile update OTP hashing", () => {
  it("matches only the fixed supplied OTP without persisting plaintext", () => {
    process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET =
      "synthetic-test-secret-with-at-least-thirty-two-characters"
    const hash = hashMobileUpdateOtp("123456")

    expect(hash).not.toContain("123456")
    expect(otpMatches(hash, "123456")).toBe(true)
    expect(otpMatches(hash, "000000")).toBe(false)
  })
})
