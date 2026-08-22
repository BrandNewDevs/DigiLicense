import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { buildDependencyFailureEvent } from "./logger.shared"
import type { DependencyFailureContext } from "./logger.shared"

// Emits a sanitized, structured dependency-failure event with a request
// correlation ID. Callers must not pass identifiers such as application
// numbers or applicant data anywhere in the context.
function recordDependencyFailure(
  error: unknown,
  context: DependencyFailureContext
): void {
  const event = buildDependencyFailureEvent(
    error,
    context,
    randomUUID(),
    new Date()
  )

  console.error(JSON.stringify(event))
}

export { recordDependencyFailure }
