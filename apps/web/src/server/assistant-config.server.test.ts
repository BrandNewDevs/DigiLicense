import { describe, expect, it } from "vitest"

import { readPrivateAiConfiguration } from "./assistant-config.server"

const credential = "a".repeat(32)

describe("private AI service configuration", () => {
  it("returns null when local development deliberately has no AI service", () => {
    expect(readPrivateAiConfiguration({ NODE_ENV: "development" })).toBeNull()
  })

  it("requires both private service values in production", () => {
    expect(() =>
      readPrivateAiConfiguration({ NODE_ENV: "production" })
    ).toThrow("DIGILICENSE_AI_BASE_URL")
  })

  it("requires HTTPS for a production private service", () => {
    expect(() =>
      readPrivateAiConfiguration({
        DIGILICENSE_AI_BASE_URL: "http://ai.internal",
        DIGILICENSE_AI_SERVICE_BEARER_TOKEN: credential,
        NODE_ENV: "production",
      })
    ).toThrow("DIGILICENSE_AI_BASE_URL must use HTTPS in production.")
  })

  it("rejects credentials, paths, and query strings in the configured URL", () => {
    for (const baseUrl of [
      "https://token@ai.internal",
      "https://ai.internal/assistant",
      "https://ai.internal?debug=true",
    ]) {
      expect(() =>
        readPrivateAiConfiguration({
          DIGILICENSE_AI_BASE_URL: baseUrl,
          DIGILICENSE_AI_SERVICE_BEARER_TOKEN: credential,
          NODE_ENV: "production",
        })
      ).toThrow()
    }
  })

  it("keeps the credential server-side while returning a canonical URL", () => {
    expect(
      readPrivateAiConfiguration({
        DIGILICENSE_AI_BASE_URL: "https://ai.internal",
        DIGILICENSE_AI_SERVICE_BEARER_TOKEN: credential,
        NODE_ENV: "production",
      })
    ).toEqual({ baseUrl: "https://ai.internal", bearerToken: credential })
  })

  it.each(["https://ai.internal/", "https://ai.internal:443"])(
    "accepts an origin-equivalent configured URL: %s",
    (baseUrl) => {
      expect(
        readPrivateAiConfiguration({
          DIGILICENSE_AI_BASE_URL: baseUrl,
          DIGILICENSE_AI_SERVICE_BEARER_TOKEN: credential,
          NODE_ENV: "production",
        })
      ).toEqual({ baseUrl: "https://ai.internal", bearerToken: credential })
    }
  )
})
