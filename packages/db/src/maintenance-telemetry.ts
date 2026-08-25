import { randomUUID } from "node:crypto"

type MaintenanceCleanupResult = {
  batches: number
  deleted: number
}

type MaintenanceCleanupCompletedEvent = {
  event: "maintenance_cleanup_completed"
  metrics: { batches: number; deletedRecords: number }
  operation: string
  severity: "info"
  timestamp: string
}

type MaintenanceCleanupFailedEvent = {
  errorName: string
  event: "maintenance_cleanup_failed"
  operation: string
  requestId: string
  severity: "error"
  timestamp: string
}

function buildMaintenanceCleanupCompletedEvent(
  operation: string,
  result: MaintenanceCleanupResult,
  now: Date
): MaintenanceCleanupCompletedEvent {
  return {
    event: "maintenance_cleanup_completed",
    metrics: {
      batches: result.batches,
      deletedRecords: result.deleted,
    },
    operation,
    severity: "info",
    timestamp: now.toISOString(),
  }
}

function buildMaintenanceCleanupFailedEvent(
  error: unknown,
  operation: string,
  requestId: string,
  now: Date
): MaintenanceCleanupFailedEvent {
  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    event: "maintenance_cleanup_failed",
    operation,
    requestId,
    severity: "error",
    timestamp: now.toISOString(),
  }
}

async function runMaintenanceCleanup(
  operation: string,
  cleanup: () => Promise<MaintenanceCleanupResult>
): Promise<MaintenanceCleanupResult> {
  try {
    const result = await cleanup()
    console.info(
      JSON.stringify(
        buildMaintenanceCleanupCompletedEvent(operation, result, new Date())
      )
    )
    return result
  } catch (error) {
    console.error(
      JSON.stringify(
        buildMaintenanceCleanupFailedEvent(
          error,
          operation,
          randomUUID(),
          new Date()
        )
      )
    )
    throw error
  }
}

export {
  buildMaintenanceCleanupCompletedEvent,
  buildMaintenanceCleanupFailedEvent,
  runMaintenanceCleanup,
}
export type {
  MaintenanceCleanupCompletedEvent,
  MaintenanceCleanupFailedEvent,
  MaintenanceCleanupResult,
}
