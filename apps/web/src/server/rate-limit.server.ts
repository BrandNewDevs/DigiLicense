import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { getRequestIP } from "@tanstack/react-start/server"

import { prisma } from "./db.server"
import { recordDependencyFailure } from "./logger.server"
import {
  buildBucketKey,
  getRetryAfterSeconds,
  getWindowStart,
  rateLimitRules,
} from "./rate-limit.shared"
import type { RateLimitRuleName } from "./rate-limit.shared"

type ConsumeRateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

// X-Forwarded-For is only trusted when the deployment explicitly declares a
// proxy that replaces (never appends) client-supplied header values. Without
// that guarantee, attackers could rotate the header to bypass the per-IP
// bucket, so the direct connection address is used instead.
function getRateLimitClientIp(): string {
  const trustProxyHeaders =
    process.env.DIGILICENSE_TRUST_PROXY_HEADERS === "true"

  return (
    (trustProxyHeaders
      ? getRequestIP({ xForwardedFor: true })
      : getRequestIP()) ?? "unknown"
  )
}

async function consumeRateLimit(
  ruleName: RateLimitRuleName,
  identity: string
): Promise<ConsumeRateLimitResult> {
  const rule = rateLimitRules[ruleName]
  const now = new Date()
  const windowStart = getWindowStart(now, rule.windowMs)
  const bucketKey = buildBucketKey(ruleName, identity)

  // Single atomic upsert-increment: concurrent instances share the same row
  // through the (bucketKey, windowStart) unique constraint, so no two
  // requests can read the same count.
  const rows = await prisma.$queryRaw<Array<{ hits: number }>>`
    INSERT INTO "RateLimitWindow" ("id", "bucketKey", "windowStart", "hits")
    VALUES (${randomUUID()}, ${bucketKey}, ${windowStart}, 1)
    ON CONFLICT ("bucketKey", "windowStart")
    DO UPDATE SET "hits" = "RateLimitWindow"."hits" + 1
    RETURNING "hits"
  `

  const hits = rows[0]?.hits ?? 1

  const result = {
    allowed: hits <= rule.limit,
    remaining: Math.max(0, rule.limit - hits),
    retryAfterSeconds: getRetryAfterSeconds(now, windowStart, rule.windowMs),
  }

  // Best-effort retention: sampled, bounded to rows older than one day, and
  // isolated from the decision above so a failed cleanup can never fail
  // sign-in or an operator action after the upsert has succeeded.
  if (Math.random() < 0.01) {
    try {
      await prisma.$executeRaw`
        DELETE FROM "RateLimitWindow"
        WHERE "windowStart" < ${new Date(now.getTime() - 24 * 60 * 60_000)}
      `
    } catch (error) {
      recordDependencyFailure(error, {
        dependency: "postgres",
        operation: "rate_limit_retention_cleanup",
      })
    }
  }

  return result
}

export {
  consumeRateLimit,
  getRateLimitClientIp,
}
export type { ConsumeRateLimitResult }
