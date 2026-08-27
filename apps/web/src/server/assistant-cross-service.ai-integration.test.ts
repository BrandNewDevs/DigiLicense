import { beforeAll, describe, expect, it } from "vitest"

import { requestPrivateAssistant } from "./assistant-client.server"
import type { PrivateAiConfiguration } from "./assistant-config.server"

function readLocalAiFixtureConfiguration(): PrivateAiConfiguration {
  if (process.env.DIGILICENSE_AI_INTEGRATION_TEST !== "true") {
    throw new Error(
      "AI integration tests require DIGILICENSE_AI_INTEGRATION_TEST=true."
    )
  }

  const baseUrl = process.env.DIGILICENSE_AI_BASE_URL
  const bearerToken = process.env.DIGILICENSE_AI_SERVICE_BEARER_TOKEN
  if (!baseUrl || !bearerToken) {
    throw new Error("AI integration tests require the local AI service values.")
  }

  const parsed = new URL(baseUrl)
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.port !== "8000"
  ) {
    throw new Error(
      "AI integration tests may call only the local HTTP fixture on port 8000."
    )
  }

  return { baseUrl: parsed.origin, bearerToken }
}

let configuration: PrivateAiConfiguration

beforeAll(() => {
  configuration = readLocalAiFixtureConfiguration()
})

describe("TanStack server to FastAPI contract", () => {
  it("receives a validated cited answer from the fake provider over HTTP", async () => {
    const result = await requestPrivateAssistant(
      {
        locale: "en",
        page: "appointment-waitlist",
        question: "How does the appointment waitlist work?",
        reasonCode: "WAITLIST_ACTIVE",
        service: "appointment-waitlist",
      },
      configuration,
      "ai-integration-request"
    )

    expect(result).toMatchObject({
      kind: "answered",
      response: {
        blockedReason: null,
        fallbackUsed: false,
        intent: "WAITLIST_EXPLANATION",
        sources: [
          {
            id: "digilicense-prototype-behavior-v1",
            title: "DigiLicense prototype behavior",
          },
        ],
        uncertain: false,
      },
    })
  })

  it("proves the FastAPI perimeter rejects a mismatched credential", async () => {
    const response = await fetch(
      `${configuration.baseUrl}/v1/assistant/messages`,
      {
        body: JSON.stringify({
          locale: "en",
          page: "assistant",
          question: "How does the waitlist work?",
          reasonCode: "NONE",
          service: "appointment-waitlist",
        }),
        headers: {
          Authorization: "Bearer deliberately-wrong-integration-credential",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    )

    expect(response.status).toBe(401)
  })
})
