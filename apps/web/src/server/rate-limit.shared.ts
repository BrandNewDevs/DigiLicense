import { createHash } from "node:crypto"

type RateLimitRule = {
  limit: number
  windowMs: number
}

// Login attempts are counted before credentials are checked so failures act
// as a cooldown. Application submissions are expensive, state-changing writes, so each
// applicant gets a small hourly-style budget.
const rateLimitRules = {
  "application-draft": { limit: 30, windowMs: 15 * 60_000 },
  "application-submit": { limit: 5, windowMs: 15 * 60_000 },
  "application-status-lookup": { limit: 30, windowMs: 15 * 60_000 },
  "applicant-dashboard-read": { limit: 30, windowMs: 15 * 60_000 },
  "walkthrough-reset": { limit: 5, windowMs: 15 * 60_000 },
  "application-notification-read": { limit: 30, windowMs: 15 * 60_000 },
  "application-payment-read": { limit: 30, windowMs: 15 * 60_000 },
  "application-payment-resolve": { limit: 5, windowMs: 15 * 60_000 },
  "application-payment-start": { limit: 5, windowMs: 15 * 60_000 },
  // Guidance questions reach a bounded external dependency after server-side
  // validation, so keep a tighter per-applicant budget than ordinary reads.
  "assistant-question": { limit: 10, windowMs: 15 * 60_000 },
  "fee-quote-public": { limit: 60, windowMs: 15 * 60_000 },
  // A frontend polls an active 30-minute offer once each minute and may also
  // refetch after a response or restored browser focus. The limit leaves that
  // normal, authenticated path headroom without making reads unbounded.
  "appointment-journey-read": { limit: 60, windowMs: 15 * 60_000 },
  "appointment-offer-response": { limit: 5, windowMs: 10 * 60_000 },
  "appointment-preferences": { limit: 10, windowMs: 15 * 60_000 },
  "appointment-waitlist-leave": { limit: 5, windowMs: 15 * 60_000 },
  "address-change-otp-start": { limit: 3, windowMs: 15 * 60_000 },
  "address-change-otp-verify": { limit: 5, windowMs: 10 * 60_000 },
  // Test submissions grade a full attempt each time, so the budget stays
  // tight; genuine retests after a failed result still fit comfortably.
  "learner-test": { limit: 5, windowMs: 15 * 60_000 },
  "mobile-update-aadhaar-verify": { limit: 3, windowMs: 10 * 60_000 },
  "mobile-update-otp-verify": { limit: 5, windowMs: 10 * 60_000 },
  "mobile-update-start": { limit: 3, windowMs: 15 * 60_000 },
  "renewal-read": { limit: 30, windowMs: 15 * 60_000 },
  "renewal-submit": { limit: 5, windowMs: 15 * 60_000 },
  "replacement-read": { limit: 30, windowMs: 15 * 60_000 },
  "replacement-submit": { limit: 5, windowMs: 15 * 60_000 },
  "login-ip": { limit: 30, windowMs: 15 * 60_000 },
  // Session hydration runs on page load and must not consume the stricter
  // login-attempt budget. It still has a bounded per-IP allowance.
  "session-read-ip": { limit: 120, windowMs: 15 * 60_000 },
  "login-account": { limit: 5, windowMs: 5 * 60_000 },
} as const

type RateLimitRuleName = keyof typeof rateLimitRules

function getWindowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs)
}

function getRetryAfterSeconds(
  now: Date,
  windowStart: Date,
  windowMs: number
): number {
  const windowEnd = windowStart.getTime() + windowMs
  return Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1000))
}

function hashIdentity(purpose: string, value: string): string {
  return createHash("sha256")
    .update(`${purpose}:${value.trim().toLowerCase()}`)
    .digest("hex")
}

function buildBucketKey(ruleName: RateLimitRuleName, identity: string): string {
  return `${ruleName}:${hashIdentity(ruleName, identity)}`
}

export {
  buildBucketKey,
  getRetryAfterSeconds,
  getWindowStart,
  hashIdentity,
  rateLimitRules,
}
export type { RateLimitRule, RateLimitRuleName }
