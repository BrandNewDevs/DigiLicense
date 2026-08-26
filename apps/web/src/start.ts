import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start"

import {
  applySecurityHeaders,
  getRuntimeEnvironment,
  isRequestOriginAllowed,
  isUnsafeRequestMethod,
  resolveTrustedPublicOrigin,
} from "./server/security-policy.shared"
import { buildSecurityRequestRejectedEvent } from "./server/security-telemetry.shared"
import type {
  SecurityHandlerType,
  SecurityRejectionReason,
} from "./server/security-telemetry.shared"

function recordSecurityRequestRejection(input: {
  handlerType: SecurityHandlerType
  method: string
  reasonCode: SecurityRejectionReason
}): void {
  console.warn(
    JSON.stringify(
      buildSecurityRequestRejectedEvent(
        input,
        crypto.randomUUID(),
        new Date()
      )
    )
  )
}

function forbiddenResponse(): Response {
  return new Response("Forbidden", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: 403,
  })
}

function getTrustedOrigin(request: Request): string {
  return resolveTrustedPublicOrigin({
    configuredOrigin: process.env.DIGILICENSE_PUBLIC_ORIGIN,
    environment: getRuntimeEnvironment(process.env.NODE_ENV),
    requestUrl: request.url,
  })
}

const securityHeadersMiddleware = createMiddleware().server(
  async ({ next }) => {
    const result = await next()

    return {
      ...result,
      response: applySecurityHeaders(
        result.response,
        getRuntimeEnvironment(process.env.NODE_ENV)
      ),
    }
  }
)

const sameOriginCorsMiddleware = createMiddleware().server(
  async ({ handlerType, next, request }) => {
    const allowed = isRequestOriginAllowed(
      request.headers.get("Origin"),
      getTrustedOrigin(request)
    )

    if (!allowed) {
      recordSecurityRequestRejection({
        handlerType,
        method: request.method,
        reasonCode: "CROSS_ORIGIN_REQUEST",
      })
      return forbiddenResponse()
    }

    return next()
  }
)

const csrfProtectionMiddleware = createCsrfMiddleware({
  allowRequestsWithoutOriginCheck: false,
  failureResponse: ({ handlerType, request }) => {
    recordSecurityRequestRejection({
      handlerType,
      method: request.method,
      reasonCode: "CSRF_VALIDATION_FAILED",
    })
    return forbiddenResponse()
  },
  filter: ({ request }) => isUnsafeRequestMethod(request.method),
  origin: (origin, { request }) => origin === getTrustedOrigin(request),
  referer: (referer, { request }) => {
    try {
      return new URL(referer).origin === getTrustedOrigin(request)
    } catch {
      return false
    }
  },
  secFetchSite: "same-origin",
})

const startInstance = createStart(() => ({
  requestMiddleware: [
    securityHeadersMiddleware,
    sameOriginCorsMiddleware,
    csrfProtectionMiddleware,
  ],
}))

export { startInstance }
