import { describe, expect, it } from "vitest"

import { applicationLookupSchema } from "./application-status"

describe("applicationLookupSchema", () => {
  it("accepts a valid application number", () => {
    const result = applicationLookupSchema.safeParse({
      applicationNumber: "DLDEMO20260001",
    })

    expect(result.success).toBe(true)
  })

  it("trims and uppercases the application number", () => {
    const result = applicationLookupSchema.parse({
      applicationNumber: "  dldemo20260001  ",
    })

    expect(result.applicationNumber).toBe("DLDEMO20260001")
  })

  it.each(["ABCD1234", "A".repeat(32)])(
    "accepts a value at a length boundary: %s",
    (applicationNumber) => {
      expect(
        applicationLookupSchema.safeParse({ applicationNumber }).success
      ).toBe(true)
    }
  )

  it.each([
    ["an empty value", ""],
    ["whitespace only", "   "],
    ["fewer than 8 characters", "ABC1234"],
    ["more than 32 characters", "A".repeat(33)],
    ["spaces within the value", "DL DEMO 2026"],
    ["punctuation other than a hyphen", "DL/DEMO/2026"],
  ])("rejects %s", (_case, applicationNumber) => {
    expect(
      applicationLookupSchema.safeParse({ applicationNumber }).success
    ).toBe(false)
  })

  it.each([
    ["a missing field", {}],
    ["a null value", { applicationNumber: null }],
    ["a numeric value", { applicationNumber: 20260001 }],
  ])("rejects %s", (_case, input) => {
    expect(applicationLookupSchema.safeParse(input).success).toBe(false)
  })
})
