import "@tanstack/react-start/server-only"

type PrivateAiConfiguration = {
  baseUrl: string
  bearerToken: string
}

type PrivateAiEnvironment = {
  DIGILICENSE_AI_BASE_URL?: string
  DIGILICENSE_AI_SERVICE_BEARER_TOKEN?: string
  NODE_ENV?: string
}

function readPrivateAiConfiguration(
  environment: PrivateAiEnvironment = process.env
): PrivateAiConfiguration | null {
  const baseUrl = environment.DIGILICENSE_AI_BASE_URL?.trim()
  const bearerToken = environment.DIGILICENSE_AI_SERVICE_BEARER_TOKEN?.trim()
  const production = environment.NODE_ENV === "production"

  if (!baseUrl && !bearerToken) {
    if (production) {
      throw new Error(
        "DIGILICENSE_AI_BASE_URL and DIGILICENSE_AI_SERVICE_BEARER_TOKEN are required in production."
      )
    }
    return null
  }

  if (!baseUrl || !bearerToken) {
    throw new Error(
      "DIGILICENSE_AI_BASE_URL and DIGILICENSE_AI_SERVICE_BEARER_TOKEN must be configured together."
    )
  }

  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new Error(
      "DIGILICENSE_AI_BASE_URL must be an absolute HTTP(S) origin."
    )
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(
      "DIGILICENSE_AI_BASE_URL must contain only an HTTP(S) scheme, host, and optional port."
    )
  }

  if (production && parsed.protocol !== "https:") {
    throw new Error("DIGILICENSE_AI_BASE_URL must use HTTPS in production.")
  }

  if (production && bearerToken.length < 32) {
    throw new Error(
      "DIGILICENSE_AI_SERVICE_BEARER_TOKEN must contain at least 32 characters in production."
    )
  }

  return { baseUrl: parsed.origin, bearerToken }
}

export { readPrivateAiConfiguration }
export type { PrivateAiConfiguration, PrivateAiEnvironment }
