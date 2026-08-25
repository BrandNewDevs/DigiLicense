import { afterEach, describe, expect, it } from "vitest"

import {
  getMobileHashCandidates,
  hashMobileNumber,
  normalizeMobileNumber,
} from "./mobile-identity"

const previousHmacSecret = process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET
const previousHmacKeyVersion = process.env.DIGILICENSE_IDENTIFIER_HMAC_KEY_VERSION
const previousHmacPreviousSecret = process.env.DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_SECRET
const previousHmacPreviousKeyVersion =
  process.env.DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_KEY_VERSION

afterEach(() => {
  if (previousHmacSecret === undefined) delete process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET
  else process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET = previousHmacSecret
  if (previousHmacKeyVersion === undefined) delete process.env.DIGILICENSE_IDENTIFIER_HMAC_KEY_VERSION
  else process.env.DIGILICENSE_IDENTIFIER_HMAC_KEY_VERSION = previousHmacKeyVersion
  if (previousHmacPreviousSecret === undefined) delete process.env.DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_SECRET
  else process.env.DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_SECRET = previousHmacPreviousSecret
  if (previousHmacPreviousKeyVersion === undefined) delete process.env.DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_KEY_VERSION
  else process.env.DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_KEY_VERSION = previousHmacPreviousKeyVersion
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

  it("returns current and previous lookup candidates during a key rotation", () => {
    process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET =
      "synthetic-current-secret-with-at-least-thirty-two-characters"
    process.env.DIGILICENSE_IDENTIFIER_HMAC_KEY_VERSION = "v2"
    process.env.DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_SECRET =
      "synthetic-previous-secret-with-at-least-thirty-two-characters"
    process.env.DIGILICENSE_IDENTIFIER_HMAC_PREVIOUS_KEY_VERSION = "v1"

    expect(getMobileHashCandidates("9000000001").map((candidate) => candidate.keyVersion)).toEqual(["v2", "v1"])
  })
})
