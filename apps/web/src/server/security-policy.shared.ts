const unsafeRequestMethods = new Set(["DELETE", "PATCH", "POST", "PUT"])

const productionContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "upgrade-insecure-requests",
].join("; ")

const developmentContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
].join("; ")

const corsResponseHeaders = [
  "Access-Control-Allow-Credentials",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Origin",
  "Access-Control-Expose-Headers",
  "Access-Control-Max-Age",
] as const

type RuntimeEnvironment = "development" | "production" | "test"

function getRuntimeEnvironment(value: string | undefined): RuntimeEnvironment {
  if (value === "production" || value === "test") return value
  return "development"
}

function isUnsafeRequestMethod(method: string): boolean {
  return unsafeRequestMethods.has(method.toUpperCase())
}

function parseConfiguredPublicOrigin(
  configuredOrigin: string | undefined,
  environment: RuntimeEnvironment
): string | null {
  const value = configuredOrigin?.trim()

  if (!value) {
    if (environment === "production") {
      throw new Error("DIGILICENSE_PUBLIC_ORIGIN is required in production.")
    }
    return null
  }

  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    throw new Error(
      "DIGILICENSE_PUBLIC_ORIGIN must be an absolute HTTP(S) origin."
    )
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    value !== parsed.origin
  ) {
    throw new Error(
      "DIGILICENSE_PUBLIC_ORIGIN must contain only an HTTP(S) scheme, host, and optional port."
    )
  }

  if (environment === "production" && parsed.protocol !== "https:") {
    throw new Error("DIGILICENSE_PUBLIC_ORIGIN must use HTTPS in production.")
  }

  return parsed.origin
}

function resolveTrustedPublicOrigin(input: {
  configuredOrigin: string | undefined
  environment: RuntimeEnvironment
  requestUrl: string
}): string {
  const configured = parseConfiguredPublicOrigin(
    input.configuredOrigin,
    input.environment
  )
  if (configured) return configured

  try {
    return new URL(input.requestUrl).origin
  } catch {
    throw new Error("The request URL does not contain a valid origin.")
  }
}

function isRequestOriginAllowed(
  origin: string | null,
  trustedOrigin: string
): boolean {
  return origin === null || origin === trustedOrigin
}

function buildContentSecurityPolicy(
  environment: RuntimeEnvironment
): string {
  return environment === "production"
    ? productionContentSecurityPolicy
    : developmentContentSecurityPolicy
}

function buildSecurityHeaderValues(
  environment: RuntimeEnvironment
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildContentSecurityPolicy(environment),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  }

  if (environment === "production") {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains"
  }

  return headers
}

function applySecurityHeaders(
  response: Response,
  environment: RuntimeEnvironment
): Response {
  const headers = new Headers(response.headers)

  for (const header of corsResponseHeaders) headers.delete(header)

  for (const [name, value] of Object.entries(
    buildSecurityHeaderValues(environment)
  )) {
    headers.set(name, value)
  }

  if (environment !== "production") {
    headers.delete("Strict-Transport-Security")
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  buildSecurityHeaderValues,
  getRuntimeEnvironment,
  isRequestOriginAllowed,
  isUnsafeRequestMethod,
  parseConfiguredPublicOrigin,
  resolveTrustedPublicOrigin,
}
export type { RuntimeEnvironment }
