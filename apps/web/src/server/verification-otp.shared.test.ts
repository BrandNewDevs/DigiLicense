import { afterEach, describe, expect, it } from "vitest"

import { hashWorkflowOtp, workflowOtpMatches } from "./verification-otp.shared"

const previousHmacSecret = process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET

afterEach(() => {
  if (previousHmacSecret === undefined) {
    delete process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET
    return
  }

  process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET = previousHmacSecret
})

describe("workflow OTP hashing", () => {
  it("matches only the intended purpose and synthetic OTP", () => {
    process.env.DIGILICENSE_IDENTIFIER_HMAC_SECRET =
      "synthetic-test-secret-with-at-least-thirty-two-characters"
    const addressHash = hashWorkflowOtp("address-change", "123456")

    expect(addressHash).not.toContain("123456")
    expect(workflowOtpMatches("address-change", addressHash, "123456")).toBe(
      true
    )
    expect(workflowOtpMatches("mobile-update", addressHash, "123456")).toBe(
      false
    )
    expect(workflowOtpMatches("address-change", addressHash, "000000")).toBe(
      false
    )
  })
})
