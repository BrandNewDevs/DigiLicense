type SecurityHandlerType = "router" | "serverFn"

type SecurityRejectionReason =
  | "CROSS_ORIGIN_REQUEST"
  | "CSRF_VALIDATION_FAILED"

type SecurityRequestRejectedEvent = {
  event: "security_request_rejected"
  handlerType: SecurityHandlerType
  method: string
  reasonCode: SecurityRejectionReason
  requestId: string
  severity: "warning"
  timestamp: string
}

const telemetryHttpMethods = new Set([
  "CONNECT",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
])

function sanitizeHttpMethod(method: string): string {
  const normalized = method.trim().toUpperCase()
  return telemetryHttpMethods.has(normalized) ? normalized : "UNKNOWN"
}

function buildSecurityRequestRejectedEvent(
  input: {
    handlerType: SecurityHandlerType
    method: string
    reasonCode: SecurityRejectionReason
  },
  requestId: string,
  now: Date
): SecurityRequestRejectedEvent {
  return {
    event: "security_request_rejected",
    handlerType: input.handlerType,
    method: sanitizeHttpMethod(input.method),
    reasonCode: input.reasonCode,
    requestId,
    severity: "warning",
    timestamp: now.toISOString(),
  }
}

export { buildSecurityRequestRejectedEvent, sanitizeHttpMethod }
export type {
  SecurityHandlerType,
  SecurityRejectionReason,
  SecurityRequestRejectedEvent,
}
