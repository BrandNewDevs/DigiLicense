import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { startInstance } from "../start"

vi.mock("@tanstack/react-start/server-only", () => ({}))

type HandlerType = "router" | "serverFn"

type MiddlewareResult = {
  context: Record<string, never>
  pathname: string
  request: Request
  response: Response
}

type MiddlewareHandler = (input: {
  context: Record<string, never>
  handlerType: HandlerType
  next: () => Promise<MiddlewareResult>
  pathname: string
  request: Request
}) =>
  | MiddlewareResult
  | Promise<MiddlewareResult>
  | Response
  | Promise<Response>

async function executeSecurityMiddleware(
  request: Request,
  handlerType: HandlerType = "serverFn"
): Promise<Response> {
  const options = await startInstance.getOptions()
  const middleware = options.requestMiddleware ?? []
  const base = {
    context: {},
    pathname: new URL(request.url).pathname,
    request,
  }

  async function execute(index: number): Promise<MiddlewareResult> {
    if (index >= middleware.length) {
      return {
        ...base,
        response: new Response("accepted", { status: 200 }),
      }
    }

    const current = middleware[index]
    const handler = current.options.server as unknown as
      | MiddlewareHandler
      | undefined
    if (!handler) throw new Error("Expected request middleware server handler.")

    const result = await handler({
      ...base,
      handlerType,
      next: () => execute(index + 1),
    })

    return result instanceof Response
      ? { ...base, response: result }
      : result
  }

  return (await execute(0)).response
}

function createRequest(
  method: string,
  headers: HeadersInit = {},
  body?: string
): Request {
  return new Request("https://digilicense.example/services/update-mobile", {
    body,
    headers,
    method,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

describe("global request security middleware", () => {
  it("accepts a same-origin unsafe request", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DIGILICENSE_PUBLIC_ORIGIN", "https://digilicense.example")

    const response = await executeSecurityMiddleware(
      createRequest("POST", { Origin: "https://digilicense.example" }, "{}")
    )

    expect(response.status).toBe(200)
  })

  it("accepts browser-controlled same-origin fetch metadata", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DIGILICENSE_PUBLIC_ORIGIN", "https://digilicense.example")

    const response = await executeSecurityMiddleware(
      createRequest("POST", { "Sec-Fetch-Site": "same-origin" }, "{}")
    )

    expect(response.status).toBe(200)
  })

  it("rejects cross-site fetch metadata even with a matching Origin", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DIGILICENSE_PUBLIC_ORIGIN", "https://digilicense.example")

    const response = await executeSecurityMiddleware(
      createRequest(
        "POST",
        {
          Origin: "https://digilicense.example",
          "Sec-Fetch-Site": "cross-site",
        },
        "{}"
      )
    )

    expect(response.status).toBe(403)
    expect(await response.text()).toBe("Forbidden")
  })

  it("rejects a mismatched Origin", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DIGILICENSE_PUBLIC_ORIGIN", "https://digilicense.example")

    const response = await executeSecurityMiddleware(
      createRequest("POST", { Origin: "https://attacker.example" }, "{}")
    )

    expect(response.status).toBe(403)
  })

  it("accepts a same-origin Referer fallback", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DIGILICENSE_PUBLIC_ORIGIN", "https://digilicense.example")

    const response = await executeSecurityMiddleware(
      createRequest("POST", {
        Referer: "https://digilicense.example/services/update-mobile",
      }, "{}")
    )

    expect(response.status).toBe(200)
  })

  it("rejects an unsafe request without origin metadata", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DIGILICENSE_PUBLIC_ORIGIN", "https://digilicense.example")

    const response = await executeSecurityMiddleware(
      createRequest("POST", {}, "{}")
    )

    expect(response.status).toBe(403)
  })

  it("allows a safe GET without origin metadata", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DIGILICENSE_PUBLIC_ORIGIN", "https://digilicense.example")

    const response = await executeSecurityMiddleware(createRequest("GET"))

    expect(response.status).toBe(200)
  })

  it("rejects a cross-origin preflight", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DIGILICENSE_PUBLIC_ORIGIN", "https://digilicense.example")

    const response = await executeSecurityMiddleware(
      createRequest("OPTIONS", {
        Origin: "https://attacker.example",
        "Access-Control-Request-Method": "POST",
      })
    )

    expect(response.status).toBe(403)
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false)
    expect(response.headers.has("Access-Control-Allow-Methods")).toBe(false)
  })

  it("adds production headers to rejection responses", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DIGILICENSE_PUBLIC_ORIGIN", "https://digilicense.example")

    const response = await executeSecurityMiddleware(
      createRequest("POST", {}, "{}")
    )

    expect(response.status).toBe(403)
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'self'"
    )
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains"
    )
    expect(response.headers.get("X-Frame-Options")).toBe("DENY")
  })

  it("logs only sanitized metadata for a rejected request", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DIGILICENSE_PUBLIC_ORIGIN", "https://digilicense.example")
    const warning = vi.mocked(console.warn)

    await executeSecurityMiddleware(
      createRequest(
        "POST",
        {
          Cookie: "session=applicant-secret",
          Origin: "https://attacker.example/private-origin",
          Referer: "https://attacker.example/?application=DL-SECRET",
        },
        "body-secret"
      )
    )

    expect(warning).toHaveBeenCalledTimes(1)
    const [serializedEvent] = warning.mock.calls[0] ?? []
    expect(typeof serializedEvent).toBe("string")

    if (typeof serializedEvent !== "string") return

    expect(serializedEvent).toContain('"event":"security_request_rejected"')
    expect(serializedEvent).toContain('"reasonCode":"CROSS_ORIGIN_REQUEST"')
    expect(serializedEvent).toContain('"method":"POST"')
    expect(serializedEvent).not.toContain("attacker.example")
    expect(serializedEvent).not.toContain("applicant-secret")
    expect(serializedEvent).not.toContain("DL-SECRET")
    expect(serializedEvent).not.toContain("body-secret")
  })
})
