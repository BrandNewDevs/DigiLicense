import { describe, expect, it } from "vitest"

import {
  getActionsForStatus,
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

  it("turns internal status codes into readable labels", () => {
    expect(getStatusLabel("PAYMENT_REVIEW")).toBe("Payment review")
    expect(getStatusLabel("WAITLISTED")).toBe("On appointment waitlist")
  })
})
