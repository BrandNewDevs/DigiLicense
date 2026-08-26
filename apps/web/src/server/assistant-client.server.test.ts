import { describe, expect, it } from "vitest"

import {
  requestPrivateAssistant,
  toPublicAiPayload,
} from "./assistant-client.server"
import type { PrivateAiConfiguration } from "./assistant-config.server"
import type { AskAssistantInput } from "../validation/assistant"

const configuration: PrivateAiConfiguration = {
  baseUrl: "https://ai.internal",
  bearerToken: "server-only-credential",
}
const input: AskAssistantInput = {
  locale: "en",
  page: "appointment-waitlist",
  question: "Why is there no matching appointment?",
  reasonCode: "NO_MATCHING_SLOT",
  service: "appointment-waitlist",
}
const validResponse = {
  answer:
    "DigiLicense will record a matching appointment offer when one is available.",
  blockedReason: null,
  contextToken: null,
  escalation: null,
  fallbackUsed: false,
  intent: "NO_APPOINTMENT_EXPLANATION",
  sources: [
    {
      id: "digilicense-prototype-behavior-v1",
      title: "DigiLicense prototype behavior",
      url: "https://digilicense.invalid/prototype/assistant-behavior",
    },
  ],
  uncertain: false,
}

describe("private AI client", () => {
  it("forwards only the allowlisted public body and a correlation ID", async () => {
    let requestUrl = ""
    let requestInit: RequestInit | undefined
    const fetchImplementation: typeof fetch = async (url, init) => {
      requestUrl = url.toString()
      requestInit = init
      return new Response(JSON.stringify(validResponse), {
        headers: { "content-type": "application/json" },
      })
    }

    const result = await requestPrivateAssistant(
      input,
      configuration,
      "request-123",
      { fetchImplementation }
    )

    expect(result).toEqual({ kind: "answered", response: validResponse })
    expect(requestUrl).toBe("https://ai.internal/v1/assistant/messages")
    expect(requestInit?.method).toBe("POST")
    expect(requestInit?.cache).toBe("no-store")
    expect(requestInit?.credentials).toBe("omit")
    expect(requestInit?.redirect).toBe("error")
    expect(requestInit?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer server-only-credential",
      "Content-Type": "application/json",
      "X-Request-ID": "request-123",
    })
    if (typeof requestInit?.body !== "string") {
      throw new Error("Expected the AI request body to be a string")
    }
    expect(JSON.parse(requestInit.body)).toEqual(input)
    expect(JSON.stringify(requestInit.body)).not.toContain("applicant")
    expect(JSON.stringify(requestInit.body)).not.toContain("session")
  })

  it("omits an absent context token instead of inventing browser state", () => {
    expect(toPublicAiPayload(input)).toEqual(input)
  })

  it("returns a malformed outcome for an invalid service response", async () => {
    const fetchImplementation: typeof fetch = async () =>
      new Response(JSON.stringify({ answer: "missing required fields" }), {
        headers: { "content-type": "application/json" },
      })

    await expect(
      requestPrivateAssistant(input, configuration, "request-124", {
        fetchImplementation,
      })
    ).resolves.toEqual({ kind: "failed", reason: "malformed" })
  })

  it("maps a service rate limit without reading an error body", async () => {
    const fetchImplementation: typeof fetch = async () =>
      new Response("ignored", { status: 429 })

    await expect(
      requestPrivateAssistant(input, configuration, "request-125", {
        fetchImplementation,
      })
    ).resolves.toEqual({ kind: "failed", reason: "rate-limited" })
  })

  it("aborts a dependency request at its bounded deadline", async () => {
    let aborted = false
    const fetchImplementation: typeof fetch = async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            aborted = true
            reject(new DOMException("aborted", "AbortError"))
          },
          { once: true }
        )
      })

    await expect(
      requestPrivateAssistant(input, configuration, "request-126", {
        fetchImplementation,
        timeoutMs: 5,
      })
    ).resolves.toEqual({ kind: "failed", reason: "timeout" })
    expect(aborted).toBe(true)
  })
})
