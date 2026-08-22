import { describe, expect, it } from "vitest"

import { buildDependencyFailureEvent } from "./logger.shared"

describe("buildDependencyFailureEvent", () => {
  it("records only the error name and safe context fields", () => {
    const failure = new Error(
      'Query failed for applicationNumber DLDEMO20260001 applicant demo-applicant-001'
    )
    const event = buildDependencyFailureEvent(
      failure,
      { dependency: "postgres", operation: "application_status_lookup" },
      "request-123",
      new Date("2026-08-23T00:00:00.000Z")
    )

    expect(event).toEqual({
      event: "dependency_failure",
      severity: "error",
      dependency: "postgres",
      operation: "application_status_lookup",
      requestId: "request-123",
      errorName: "Error",
      timestamp: "2026-08-23T00:00:00.000Z",
    })
  })

  it("never includes the error message or stack in the event", () => {
    const failure = new Error(
      "secret-value applicationNumber DLDEMO20260001"
    )
    const event = buildDependencyFailureEvent(
      failure,
      { dependency: "postgres", operation: "lookup" },
      "req-1",
      new Date()
    )

    expect(JSON.stringify(event)).not.toContain("secret-value")
    expect(JSON.stringify(event)).not.toContain("DLDEMO20260001")
  })

  it("falls back to UnknownError for non-Error throwables", () => {
    const event = buildDependencyFailureEvent(
      "connection refused",
      { dependency: "postgres", operation: "lookup" },
      "req-2",
      new Date()
    )

    expect(event.errorName).toBe("UnknownError")
  })
})
