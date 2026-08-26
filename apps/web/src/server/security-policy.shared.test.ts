import { describe, expect, it } from "vitest"

import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  buildSecurityHeaderValues,
  isRequestOriginAllowed,
  isUnsafeRequestMethod,
  parseConfiguredPublicOrigin,
  resolveTrustedPublicOrigin,
} from "./security-policy.shared"

describe("trusted public origin", () => {
  it("requires an explicit origin in production", () => {
    expect(() => parseConfiguredPublicOrigin(undefined, "production")).toThrow(
      "DIGILICENSE_PUBLIC_ORIGIN is required in production."
    )
  })

  it("requires HTTPS in production", () => {
    expect(() =>
      parseConfiguredPublicOrigin("http://digilicense.example", "production")
    ).toThrow("DIGILICENSE_PUBLIC_ORIGIN must use HTTPS in production.")
  })

  it.each([
    "https://user@digilicense.example",
    "https://digilicense.example/",
    "https://digilicense.example/path",
    "https://digilicense.example?query=value",
    "https://digilicense.example#fragment",
    "ftp://digilicense.example",
  ])("rejects values that are not an exact HTTP(S) origin: %s", (value) => {
    expect(() => parseConfiguredPublicOrigin(value, "production")).toThrow()
  })

  it("accepts and returns a canonical HTTPS production origin", () => {
    expect(
      parseConfiguredPublicOrigin(
        "https://digilicense.example",
        "production"
      )
    ).toBe("https://digilicense.example")
  })

  it("allows an explicit localhost HTTP origin in development", () => {
    expect(
      parseConfiguredPublicOrigin("http://localhost:3000", "development")
    ).toBe("http://localhost:3000")
  })

  it("falls back to the request origin outside production", () => {
    expect(
      resolveTrustedPublicOrigin({
        configuredOrigin: undefined,
        environment: "development",
        requestUrl: "http://127.0.0.1:3000/services?ignored=yes",
      })
    ).toBe("http://127.0.0.1:3000")
  })
})

describe("same-origin request decisions", () => {
  it("recognizes only unsafe mutation methods", () => {
    expect(isUnsafeRequestMethod("POST")).toBe(true)
    expect(isUnsafeRequestMethod("patch")).toBe(true)
    expect(isUnsafeRequestMethod("GET")).toBe(false)
    expect(isUnsafeRequestMethod("HEAD")).toBe(false)
    expect(isUnsafeRequestMethod("OPTIONS")).toBe(false)
  })

  it("accepts a missing or exactly matching Origin header", () => {
    expect(isRequestOriginAllowed(null, "https://digilicense.example")).toBe(
      true
    )
    expect(
      isRequestOriginAllowed(
        "https://digilicense.example",
        "https://digilicense.example"
      )
    ).toBe(true)
  })

  it("rejects a mismatched Origin header", () => {
    expect(
      isRequestOriginAllowed(
        "https://attacker.example",
        "https://digilicense.example"
      )
    ).toBe(false)
  })
})

describe("browser security headers", () => {
  it("builds the restrictive production CSP", () => {
    const policy = buildContentSecurityPolicy("production")

    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("connect-src 'self'")
    expect(policy).toContain("upgrade-insecure-requests")
    expect(policy).not.toContain("unsafe-eval")
    expect(policy).not.toContain("https://")
  })

  it("adds production headers and removes downstream CORS headers", () => {
    const response = applySecurityHeaders(
      new Response("Forbidden", {
        headers: {
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Origin": "https://attacker.example",
        },
        status: 403,
      }),
      "production"
    )

    expect(response.status).toBe(403)
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'self'"
    )
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe(
      "same-origin"
    )
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "same-origin"
    )
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("X-Frame-Options")).toBe("DENY")
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer")
    expect(response.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    )
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains"
    )
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false)
    expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(
      false
    )
  })

  it("provides the same header values for static-asset servers", () => {
    const headers = buildSecurityHeaderValues("production")

    expect(headers["Content-Security-Policy"]).toContain(
      "default-src 'self'"
    )
    expect(headers["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains"
    )
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined()
  })

  it("allows Vite development connections without emitting HSTS", () => {
    const response = applySecurityHeaders(
      new Response("ok", {
        headers: {
          "Strict-Transport-Security": "max-age=100",
        },
      }),
      "development"
    )
    const policy = response.headers.get("Content-Security-Policy") ?? ""

    expect(policy).toContain("connect-src 'self' ws: wss:")
    expect(policy).toContain("'unsafe-eval'")
    expect(policy).not.toContain("upgrade-insecure-requests")
    expect(response.headers.has("Strict-Transport-Security")).toBe(false)
  })

  it("preserves separate session cookies while wrapping a response", () => {
    const headers = new Headers()
    headers.append("Set-Cookie", "applicant=session-one; HttpOnly")
    headers.append("Set-Cookie", "operator=session-two; HttpOnly")

    const response = applySecurityHeaders(
      new Response("ok", { headers }),
      "production"
    )

    expect(response.headers.getSetCookie()).toEqual([
      "applicant=session-one; HttpOnly",
      "operator=session-two; HttpOnly",
    ])
  })
})
