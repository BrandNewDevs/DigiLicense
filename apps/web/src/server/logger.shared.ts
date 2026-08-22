type DependencyFailureEvent = {
  event: "dependency_failure"
  severity: "error"
  dependency: string
  operation: string
  requestId: string
  errorName: string
  timestamp: string
}

type DependencyFailureContext = {
  dependency: string
  operation: string
}

// Builds a structured event that is safe to log: it carries the error name
// only. Error messages and stacks can embed query values or record data, so
// they are never included.
function buildDependencyFailureEvent(
  error: unknown,
  context: DependencyFailureContext,
  requestId: string,
  now: Date
): DependencyFailureEvent {
  return {
    event: "dependency_failure",
    severity: "error",
    dependency: context.dependency,
    operation: context.operation,
    requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
    timestamp: now.toISOString(),
  }
}

export { buildDependencyFailureEvent }
export type { DependencyFailureContext, DependencyFailureEvent }
