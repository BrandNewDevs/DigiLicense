import { describe, expect, it } from "vitest"

import {
  buildSecurityRequestRejectedEvent,
  sanitizeHttpMethod,
} from "./security-telemetry.shared"

describe("security rejection telemetry", () => {
  it("builds a structured event from allowlisted fields", () => {
    expect(
      buildSecurityRequestRejectedEvent(
        {
          handlerType: "serverFn",
          method: "POST",
          reasonCode: "CSRF_VALIDATION_FAILED",
        },
        "request-123",
        new Date("2026-08-26T00:00:00.000Z")
      )
    ).toEqual({
      event: "security_request_rejected",
      handlerType: "serverFn",
      method: "POST",
      reasonCode: "CSRF_VALIDATION_FAILED",
      requestId: "request-123",
      severity: "warning",
      timestamp: "2026-08-26T00:00:00.000Z",
    })
  })

  it("does not accept an unbounded method value", () => {
    expect(sanitizeHttpMethod("POST applicant-secret")).toBe("UNKNOWN")
    expect(sanitizeHttpMethod("custommethodtoolong")).toBe("UNKNOWN")
  })
})
