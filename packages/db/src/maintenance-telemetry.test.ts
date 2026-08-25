import { describe, expect, it, vi } from "vitest"

import {
  buildMaintenanceCleanupCompletedEvent,
  buildMaintenanceCleanupFailedEvent,
  runMaintenanceCleanup,
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

  it("logs a sanitized failure event and rethrows the cleanup failure", async () => {
    const failure = new Error("applicant demo-applicant-001 verification secret")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    try {
      await expect(
        runMaintenanceCleanup(
          "address_change_verification_retention_purge",
          async () => {
            throw failure
          }
        )
      ).rejects.toBe(failure)

      expect(errorSpy).toHaveBeenCalledTimes(1)

      const [serializedEvent] = errorSpy.mock.calls[0] ?? []
      expect(typeof serializedEvent).toBe("string")

      if (typeof serializedEvent !== "string") {
        return
      }

      expect(serializedEvent).toContain('"event":"maintenance_cleanup_failed"')
      expect(serializedEvent).toContain(
        '"operation":"address_change_verification_retention_purge"'
      )
      expect(serializedEvent).toContain('"errorName":"Error"')
      expect(serializedEvent).not.toContain("demo-applicant-001")
      expect(serializedEvent).not.toContain("verification secret")
    } finally {
      errorSpy.mockRestore()
    }
  })
})
