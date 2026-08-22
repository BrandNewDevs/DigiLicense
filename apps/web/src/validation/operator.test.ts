import { describe, expect, it } from "vitest"

import { operatorApplicationActionSchema } from "./operator"

describe("operatorApplicationActionSchema", () => {
  const validInput = {
    applicationId: "demo-application-001",
    action: "VERIFY_DOCUMENTS",
    decisionReasonCode: "DOCUMENTS_MATCH_CHECKLIST",
    expectedVersion: 1,
  }

  it("accepts a known command with an allowlisted decision reason", () => {
    expect(operatorApplicationActionSchema.safeParse(validInput).success).toBe(
      true
    )
  })

  it.each([
    ["an unknown command", { ...validInput, action: "SET_ANY_STATUS" }],
    ["a stale version shape", { ...validInput, expectedVersion: 0 }],
    ["an empty decision reason", { ...validInput, decisionReasonCode: "" }],
    [
      "a reason from a different action's allowlist",
      {
        ...validInput,
        decisionReasonCode: "EXAMINER_SHEET_PASS",
      },
    ],
    ["an unexpected field", { ...validInput, applicantName: "Real Person" }],
  ])("rejects %s", (_case, input) => {
    expect(operatorApplicationActionSchema.safeParse(input).success).toBe(false)
  })
})
