import { describe, expect, it } from "vitest"

import { addUtcYears, getRenewalEligibility } from "./renewal"

describe("renewal date policy", () => {
  it("uses calendar-safe UTC arithmetic", () => {
    expect(
      addUtcYears(new Date("2024-02-29T08:30:00.000Z"), 1).toISOString()
    ).toBe("2025-02-28T08:30:00.000Z")
  })

  it("opens and closes an inclusive twelve-month window", () => {
    const expiry = new Date("2027-08-31T00:00:00.000Z")
    expect(
      getRenewalEligibility(expiry, new Date("2026-08-30T23:59:59.999Z")).kind
    ).toBe("not-open")
    expect(
      getRenewalEligibility(expiry, new Date("2026-08-31T00:00:00.000Z")).kind
    ).toBe("eligible")
    expect(
      getRenewalEligibility(expiry, new Date("2028-09-01T00:00:00.000Z")).kind
    ).toBe("window-closed")
  })
})
