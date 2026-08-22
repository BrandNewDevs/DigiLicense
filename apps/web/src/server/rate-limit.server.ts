import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"

import { prisma } from "./db.server"
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

  if (Math.random() < 0.01) {
    await prisma.$executeRaw`
      DELETE FROM "RateLimitWindow"
      WHERE "windowStart" < ${new Date(now.getTime() - 24 * 60 * 60_000)}
    `
  }

  return {
    allowed: hits <= rule.limit,
    remaining: Math.max(0, rule.limit - hits),
    retryAfterSeconds: getRetryAfterSeconds(now, windowStart, rule.windowMs),
  }
}

export { consumeRateLimit }
