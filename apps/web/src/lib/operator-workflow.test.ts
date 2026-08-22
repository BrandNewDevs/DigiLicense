import { describe, expect, it } from "vitest"

import {
  getActionsForStatus,
  getDecisionLabel,
  getDecisionReasonCodes,
  getStatusLabel,
  operatorActions,
} from "./operator-workflow"

describe("operator workflow", () => {
  it("offers only actions allowed by the current state", () => {
    expect(
      getActionsForStatus("DOCUMENT_REVIEW").map((action) => action.id)
    ).toEqual(["VERIFY_DOCUMENTS", "REQUEST_CORRECTION"])
    expect(getActionsForStatus("APPROVED")).toEqual([])
  })

  it("defines a changed state and applicant next action for every command", () => {
    for (const action of Object.values(operatorActions)) {
      expect(action.to).not.toBe(action.from)
      expect(action.nextAction.length).toBeGreaterThan(10)
      expect(action.reasonCode).toMatch(/^SYNTHETIC_/)
    }
  })

  it("gives every command at least one allowlisted decision reason", () => {
    for (const name of Object.keys(operatorActions)) {
      const codes = getDecisionReasonCodes(
        name as keyof typeof operatorActions
      )

      expect(codes.length).toBeGreaterThan(0)

      for (const code of codes) {
        expect(code).toMatch(/^[A-Z][A-Z_]{3,59}$/)
      }

      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  it("resolves labels only for codes on the action's own allowlist", () => {
    expect(getDecisionLabel("VERIFY_DOCUMENTS", "DOCUMENTS_LEGIBLE")).toBe(
      "All required synthetic fields were legible"
    )
    expect(getDecisionLabel("VERIFY_DOCUMENTS", "EXAMINER_SHEET_PASS")).toBeUndefined()
    expect(getDecisionLabel("VERIFY_DOCUMENTS", "NOT_A_CODE")).toBeUndefined()
  })

  it("turns internal status codes into readable labels", () => {
    expect(getStatusLabel("PAYMENT_REVIEW")).toBe("Payment review")
    expect(getStatusLabel("WAITLISTED")).toBe("On appointment waitlist")
  })
})
