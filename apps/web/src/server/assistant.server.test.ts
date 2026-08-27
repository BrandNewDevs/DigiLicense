import { beforeEach, describe, expect, it, vi } from "vitest"

import { askAssistant } from "./assistant.server"
import type { AskAssistantInput } from "../validation/assistant"

const mocks = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  requireApplicant: vi.fn(),
}))

vi.mock("./demo-session.server", () => ({
  requireApplicant: mocks.requireApplicant,
}))
vi.mock("./rate-limit.server", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}))

const input: AskAssistantInput = {
  locale: "hi",
  page: "appointment-waitlist",
  question: "मुझे अपॉइंटमेंट क्यों नहीं मिल रहा है?",
  reasonCode: "NO_MATCHING_SLOT",
  service: "appointment-waitlist",
}
const validResponse = {
  answer: "मार्गदर्शन उपलब्ध है।",
  blockedReason: null,
  contextToken: null,
  escalation: null,
  fallbackUsed: false,
  intent: "NO_APPOINTMENT_EXPLANATION",
  sources: [],
  uncertain: false,
}

describe("askAssistant", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("DIGILICENSE_AI_BASE_URL", "http://localhost:8000")
    vi.stubEnv(
      "DIGILICENSE_AI_SERVICE_BEARER_TOKEN",
      "test-server-only-credential"
    )
    vi.stubEnv("NODE_ENV", "test")
    mocks.requireApplicant.mockResolvedValue({
      applicantId: "synthetic-applicant-id",
      authVersion: 1,
    })
    mocks.consumeRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      retryAfterSeconds: 60,
    })
  })

  it("requires applicant authentication before calling the private service", async () => {
    mocks.requireApplicant.mockResolvedValue(null)
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await expect(askAssistant(input)).resolves.toMatchObject({
      kind: "authentication-required",
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects sensitive questions before calling the private service", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await expect(
      askAssistant({
        ...input,
        question: "My application number is DLDEMO20260001",
      })
    ).resolves.toMatchObject({
      kind: "fallback",
      reason: "sensitive-input",
      response: { blockedReason: "PII_DETECTED", fallbackUsed: true },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("does not call the private service after a local rate limit", async () => {
    mocks.consumeRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 120,
    })
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await expect(askAssistant(input)).resolves.toMatchObject({
      kind: "fallback",
      reason: "rate-limited",
      retryAfterSeconds: 120,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("does not add authenticated applicant data to the AI payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(validResponse), {
        headers: { "content-type": "application/json" },
      })
    )

    await expect(askAssistant(input)).resolves.toEqual({
      kind: "answered",
      response: validResponse,
    })
    const requestInit = fetchSpy.mock.calls[0]?.[1]
    if (typeof requestInit?.body !== "string") {
      throw new Error("Expected the AI request body to be a string")
    }
    const body = JSON.stringify(JSON.parse(requestInit.body))
    expect(body).not.toContain("synthetic-applicant-id")
    expect(body).not.toContain("authVersion")
    expect(body).not.toContain("application")
  })

  it("uses a deterministic Hindi fallback and sanitized telemetry on failure", async () => {
    const sensitiveError = new Error(
      "mujhe 9999999999 पर भेजें; bearer test-server-only-credential"
    )
    vi.spyOn(globalThis, "fetch").mockRejectedValue(sensitiveError)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(askAssistant(input)).resolves.toMatchObject({
      kind: "fallback",
      reason: "unavailable",
      response: {
        blockedReason: "PROVIDER_UNAVAILABLE",
        fallbackUsed: true,
      },
    })
    const telemetry = errorSpy.mock.calls
      .map((call) => call.join(" "))
      .join(" ")
    expect(telemetry).not.toContain("9999999999")
    expect(telemetry).not.toContain("test-server-only-credential")
    expect(telemetry).not.toContain(input.question)
  })
})
