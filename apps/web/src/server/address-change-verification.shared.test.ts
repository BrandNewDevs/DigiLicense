import { describe, expect, it } from "vitest"

import { getAddressChangeVerificationTerminalResult } from "./address-change-verification.shared"

describe("address-change verification terminal states", () => {
  it.each([
    ["LOCKED", "otp-locked"],
    ["EXPIRED", "verification-expired"],
    ["CONSUMED", "verification-consumed"],
    ["CANCELLED", "verification-cancelled"],
  ] as const)("maps %s to %s", (status, kind) => {
    expect(getAddressChangeVerificationTerminalResult(status).kind).toBe(kind)
  })
})
