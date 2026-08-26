import { z } from "zod"

const assistantLocales = ["en", "hi"] as const
const assistantServices = [
  "learner-licence",
  "learner-test",
  "permanent-driving-licence",
  "renewal",
  "duplicate-replacement",
  "change-address",
  "mobile-update",
  "application-status",
  "fees-payment",
  "appointment-waitlist",
] as const
const assistantPages = [
  "dashboard",
  "guided-application",
  "learner-test",
  "eligibility",
  "application-status",
  "payment",
  "appointment-booking",
  "appointment-waitlist",
  "appointment-offer",
  "preparation-checklist",
  "simulation-disclosure",
  "assistant",
] as const
const assistantReasonCodes = [
  "NONE",
  "ACTION_LOCKED",
  "WAITING_PERIOD_ACTIVE",
  "LEARNER_LICENCE_EXPIRED",
  "NO_MATCHING_SLOT",
  "WAITLIST_ACTIVE",
  "OFFER_PENDING",
  "OFFER_EXPIRED",
  "SIMULATED_ACTION",
  "PREPARATION_REQUIRED",
] as const

// This is deliberately the exact public request contract of the private AI
// service. It rejects application data and browser-only context before a
// server dependency call is considered.
const askAssistantSchema = z
  .object({
    contextToken: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9._-]+$/)
      .optional(),
    locale: z.enum(assistantLocales),
    page: z.enum(assistantPages),
    question: z.string().trim().min(1).max(500),
    reasonCode: z.enum(assistantReasonCodes),
    service: z.enum(assistantServices),
  })
  .strict()

type AskAssistantInput = z.infer<typeof askAssistantSchema>

export {
  askAssistantSchema,
  assistantLocales,
  assistantPages,
  assistantReasonCodes,
  assistantServices,
}
export type { AskAssistantInput }
