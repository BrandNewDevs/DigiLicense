import { afterEach, describe, expect, it } from "vitest"

import { hashMobileNumber, normalizeMobileNumber } from "./mobile-identity"

const previousHmacSecret = process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET

afterEach(() => {
  if (previousHmacSecret === undefined) {
    delete process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET
    return
  }

  process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET = previousHmacSecret
})

describe("mobile identity helpers", () => {
  it("normalizes only ten-digit synthetic mobile numbers", () => {
    expect(normalizeMobileNumber(" 9000000001 ")).toBe("9000000001")
    expect(normalizeMobileNumber("900000001")).toBeUndefined()
    expect(normalizeMobileNumber("+919000000001")).toBeUndefined()
  })

  it("creates deterministic keyed mobile hashes", () => {
    process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET =
      "synthetic-test-secret-with-at-least-thirty-two-characters"

    expect(hashMobileNumber("9000000001")).toBe(hashMobileNumber("9000000001"))
    expect(hashMobileNumber("9000000001")).not.toBe(hashMobileNumber("9000000002"))
  })
})
