import "@tanstack/react-start/server-only"

import { z } from "zod"

import type { PrivateAiConfiguration } from "./assistant-config.server"
import type { AskAssistantInput } from "../validation/assistant"

const assistantRequestTimeoutMs = 8_000

const canonicalIntents = [
  "CURRENT_STEP_EXPLANATION",
  "LOCKED_ACTION_EXPLANATION",
  "WAITING_PERIOD_EXPLANATION",
  "LEARNER_LICENCE_EXPIRY_EXPLANATION",
  "NO_APPOINTMENT_EXPLANATION",
  "WAITLIST_EXPLANATION",
  "OFFER_EXPIRY_EXPLANATION",
  "MOCK_VS_REAL_EXPLANATION",
  "PREPARATION_CHECKLIST_EXPLANATION",
  "UNSUPPORTED_QUESTION",
] as const
const blockedReasons = [
  "PII_DETECTED",
  "UNSUPPORTED",
  "LOW_CONFIDENCE",
  "NO_EVIDENCE",
  "RETRIEVAL_UNAVAILABLE",
  "RETRIEVAL_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "INVALID_OUTPUT",
  "RATE_LIMITED",
  "INTERNAL_SAFETY_FAILURE",
] as const
const escalationCodes = [
  "REVIEW_PUBLIC_GUIDANCE",
  "CONTACT_PROTOTYPE_SUPPORT",
] as const

const assistantResponseSchema = z
  .object({
    answer: z.string().min(1).max(1200),
    blockedReason: z.enum(blockedReasons).nullable(),
    contextToken: z.string().min(1).max(1024).nullable(),
    escalation: z
      .object({
        code: z.enum(escalationCodes),
        message: z.string().min(1).max(300),
      })
      .strict()
      .nullable(),
    fallbackUsed: z.boolean(),
    intent: z.enum(canonicalIntents),
    sources: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            title: z.string().min(1).max(200),
          })
          .strict()
      )
      .max(3),
    uncertain: z.boolean(),
  })
  .strict()

type AssistantResponse = z.infer<typeof assistantResponseSchema>
type AssistantDependencyFailureReason =
  | "malformed"
  | "rate-limited"
  | "timeout"
  | "unavailable"
type PrivateAssistantCallResult =
  | { kind: "answered"; response: AssistantResponse }
  | { kind: "failed"; reason: AssistantDependencyFailureReason }
type FetchImplementation = typeof fetch

function toPublicAiPayload(input: AskAssistantInput): Record<string, string> {
  return {
    ...(input.contextToken ? { contextToken: input.contextToken } : {}),
    locale: input.locale,
    page: input.page,
    question: input.question,
    reasonCode: input.reasonCode,
    service: input.service,
  }
}

async function requestPrivateAssistant(
  input: AskAssistantInput,
  configuration: PrivateAiConfiguration,
  correlationId: string,
  options: {
    fetchImplementation?: FetchImplementation
    timeoutMs?: number
  } = {}
): Promise<PrivateAssistantCallResult> {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? assistantRequestTimeoutMs
  )
  const fetchImplementation = options.fetchImplementation ?? fetch

  try {
    const response = await fetchImplementation(
      `${configuration.baseUrl}/v1/assistant/messages`,
      {
        body: JSON.stringify(toPublicAiPayload(input)),
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${configuration.bearerToken}`,
          "Content-Type": "application/json",
          "X-Request-ID": correlationId,
        },
        method: "POST",
        redirect: "error",
        signal: controller.signal,
      }
    )
    if (response.status === 429)
      return { kind: "failed", reason: "rate-limited" }
    if (!response.ok) return { kind: "failed", reason: "unavailable" }
    if (!response.headers.get("content-type")?.includes("application/json")) {
      return { kind: "failed", reason: "malformed" }
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      return { kind: "failed", reason: "malformed" }
    }
    const parsed = assistantResponseSchema.safeParse(body)
    return parsed.success
      ? { kind: "answered", response: parsed.data }
      : { kind: "failed", reason: "malformed" }
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      return { kind: "failed", reason: "timeout" }
    }
    return { kind: "failed", reason: "unavailable" }
  } finally {
    clearTimeout(timeout)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

export {
  assistantRequestTimeoutMs,
  assistantResponseSchema,
  requestPrivateAssistant,
  toPublicAiPayload,
}
export type {
  AssistantDependencyFailureReason,
  AssistantResponse,
  PrivateAssistantCallResult,
}
