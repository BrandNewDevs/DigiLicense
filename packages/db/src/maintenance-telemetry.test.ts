import { describe, expect, it } from "vitest"

import {
  buildMaintenanceCleanupCompletedEvent,
  buildMaintenanceCleanupFailedEvent,
} from "./maintenance-telemetry"

describe("maintenance cleanup telemetry", () => {
  it("emits a structured deletion metric without record data", () => {
    expect(
      buildMaintenanceCleanupCompletedEvent(
        "address_change_verification_retention_purge",
        { batches: 2, deleted: 17 },
        new Date("2026-08-26T00:00:00.000Z")
      )
    ).toEqual({
      event: "maintenance_cleanup_completed",
      metrics: { batches: 2, deletedRecords: 17 },
      operation: "address_change_verification_retention_purge",
      severity: "info",
      timestamp: "2026-08-26T00:00:00.000Z",
    })
  })

  it("records only a sanitized error name on failure", () => {
    const event = buildMaintenanceCleanupFailedEvent(
      new Error("applicant demo-applicant-001 verification secret"),
      "address_change_verification_retention_purge",
      "request-123",
      new Date("2026-08-26T00:00:00.000Z")
    )

    expect(event).toEqual({
      errorName: "Error",
      event: "maintenance_cleanup_failed",
      operation: "address_change_verification_retention_purge",
      requestId: "request-123",
      severity: "error",
      timestamp: "2026-08-26T00:00:00.000Z",
    })
    expect(JSON.stringify(event)).not.toContain("demo-applicant-001")
  })
})
