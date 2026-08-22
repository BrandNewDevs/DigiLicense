import { describe, expect, it } from "vitest"

import { operatorApplicationActionSchema } from "./operator"

describe("operatorApplicationActionSchema", () => {
  const validInput = {
    applicationId: "demo-application-001",
    action: "VERIFY_DOCUMENTS",
    expectedVersion: 1,
    justification: "Synthetic document review completed.",
  }

  it("accepts a known command with a decision note", () => {
    expect(operatorApplicationActionSchema.safeParse(validInput).success).toBe(
      true
    )
  })

  it.each([
    ["an unknown command", { ...validInput, action: "SET_ANY_STATUS" }],
    ["a stale version shape", { ...validInput, expectedVersion: 0 }],
    ["a missing decision note", { ...validInput, justification: "short" }],
    ["an unexpected field", { ...validInput, applicantName: "Real Person" }],
  ])("rejects %s", (_case, input) => {
    expect(operatorApplicationActionSchema.safeParse(input).success).toBe(false)
  })
})
