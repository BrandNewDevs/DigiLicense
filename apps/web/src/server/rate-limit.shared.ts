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
  // Test submissions grade a full attempt each time, so the budget stays
  // tight; genuine retests after a failed result still fit comfortably.
  "learner-test": { limit: 5, windowMs: 15 * 60_000 },
  "login-ip": { limit: 30, windowMs: 15 * 60_000 },
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
