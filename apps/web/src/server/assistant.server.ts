import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import type { AskAssistantInput } from "../validation/assistant"
import { readPrivateAiConfiguration } from "./assistant-config.server"
import { requestPrivateAssistant } from "./assistant-client.server"
import type {
  AssistantDependencyFailureReason,
  AssistantResponse,
} from "./assistant-client.server"
import { requireApplicant } from "./demo-session.server"
import { recordDependencyFailure } from "./logger.server"
import { consumeRateLimit } from "./rate-limit.server"

type AssistantFallbackReason =
  | "configuration"
  | AssistantDependencyFailureReason
  | "rate-limited"
type AskAssistantResult =
  | { kind: "answered"; response: AssistantResponse }
  | {
      kind: "authentication-required"
      message: string
    }
  | {
      kind: "fallback"
      reason: AssistantFallbackReason
      response: AssistantResponse
      retryAfterSeconds?: number
    }

const fallbackMessages = {
  en: {
    configuration:
      "Guidance is not available right now. Please review the information on this page and try again. DigiLicense cannot contact a government service.",
    malformed:
      "Guidance could not be checked safely right now. Please review the information on this page and try again. DigiLicense cannot contact a government service.",
    "rate-limited":
      "Guidance has been requested too often. Please wait before trying again. DigiLicense cannot contact a government service.",
    timeout:
      "Guidance is taking longer than expected. Please review the information on this page and try again. DigiLicense cannot contact a government service.",
    unavailable:
      "Guidance is temporarily unavailable. Please review the information on this page and try again. DigiLicense cannot contact a government service.",
  },
  hi: {
    configuration:
      "मार्गदर्शन अभी उपलब्ध नहीं है। इस पेज की जानकारी देखें और फिर प्रयास करें। DigiLicense किसी सरकारी सेवा से संपर्क नहीं कर सकता।",
    malformed:
      "मार्गदर्शन को अभी सुरक्षित रूप से जाँचा नहीं जा सका। इस पेज की जानकारी देखें और फिर प्रयास करें। DigiLicense किसी सरकारी सेवा से संपर्क नहीं कर सकता।",
    "rate-limited":
      "मार्गदर्शन के लिए बहुत अधिक अनुरोध किए गए हैं। फिर प्रयास करने से पहले प्रतीक्षा करें। DigiLicense किसी सरकारी सेवा से संपर्क नहीं कर सकता।",
    timeout:
      "मार्गदर्शन में अपेक्षा से अधिक समय लग रहा है। इस पेज की जानकारी देखें और फिर प्रयास करें। DigiLicense किसी सरकारी सेवा से संपर्क नहीं कर सकता।",
    unavailable:
      "मार्गदर्शन अस्थायी रूप से उपलब्ध नहीं है। इस पेज की जानकारी देखें और फिर प्रयास करें। DigiLicense किसी सरकारी सेवा से संपर्क नहीं कर सकता।",
  },
} as const

function fallbackResponse(
  locale: AskAssistantInput["locale"],
  reason: AssistantFallbackReason
): AssistantResponse {
  return {
    answer: fallbackMessages[locale][reason],
    blockedReason:
      reason === "rate-limited" ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
    contextToken: null,
    escalation: {
      code: "REVIEW_PUBLIC_GUIDANCE",
      message:
        locale === "hi"
          ? "इस पेज की जानकारी देखें और बाद में फिर प्रयास करें।"
          : "Review the information on this page and try again later.",
    },
    fallbackUsed: true,
    intent: "UNSUPPORTED_QUESTION",
    sources: [],
    uncertain: true,
  }
}

async function askAssistant(
  input: AskAssistantInput
): Promise<AskAssistantResult> {
  let applicant: Awaited<ReturnType<typeof requireApplicant>>
  try {
    applicant = await requireApplicant()
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "assistant_authentication",
    })
    return {
      kind: "fallback",
      reason: "unavailable",
      response: fallbackResponse(input.locale, "unavailable"),
    }
  }
  if (!applicant) {
    return {
      kind: "authentication-required",
      message: "Sign in as an applicant to ask for guidance.",
    }
  }

  let rate
  try {
    rate = await consumeRateLimit("assistant-question", applicant.applicantId)
  } catch (error) {
    recordDependencyFailure(error, {
      dependency: "postgres",
      operation: "assistant_rate_limit",
    })
    return {
      kind: "fallback",
      reason: "unavailable",
      response: fallbackResponse(input.locale, "unavailable"),
    }
  }
  if (!rate.allowed) {
    return {
      kind: "fallback",
      reason: "rate-limited",
      response: fallbackResponse(input.locale, "rate-limited"),
      retryAfterSeconds: rate.retryAfterSeconds,
    }
  }

  const correlationId = randomUUID()
  let configuration
  try {
    configuration = readPrivateAiConfiguration()
  } catch (error) {
    recordDependencyFailure(
      error,
      { dependency: "ai-service", operation: "assistant_configuration" },
      correlationId
    )
    return {
      kind: "fallback",
      reason: "configuration",
      response: fallbackResponse(input.locale, "configuration"),
    }
  }
  if (!configuration) {
    return {
      kind: "fallback",
      reason: "configuration",
      response: fallbackResponse(input.locale, "configuration"),
    }
  }

  const result = await requestPrivateAssistant(
    input,
    configuration,
    correlationId
  )
  if (result.kind === "answered") return result

  recordDependencyFailure(
    new Error(`assistant_${result.reason}`),
    { dependency: "ai-service", operation: `assistant_${result.reason}` },
    correlationId
  )
  return {
    kind: "fallback",
    reason: result.reason,
    response: fallbackResponse(input.locale, result.reason),
  }
}

export { askAssistant, fallbackResponse }
export type { AskAssistantResult }
