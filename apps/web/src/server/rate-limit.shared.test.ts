import { describe, expect, it } from "vitest"

import {
  buildBucketKey,
  getRetryAfterSeconds,
  getWindowStart,
  hashIdentity,
  rateLimitRules,
} from "./rate-limit.shared"

describe("rate limit rules", () => {
  it("keeps login account attempts tightly bounded", () => {
    expect(rateLimitRules["login-account"].limit).toBeLessThanOrEqual(10)
  })
})

describe("getWindowStart", () => {
  it("buckets timestamps into fixed windows", () => {
    const windowMs = 60_000
    const insideWindow = getWindowStart(
      new Date("2026-08-23T00:00:41.500Z"),
      windowMs
    )

    expect(insideWindow.toISOString()).toBe("2026-08-23T00:00:00.000Z")
  })

  it("returns the same bucket for timestamps in one window", () => {
    const windowMs = 5 * 60_000

    expect(getWindowStart(new Date(1_000), windowMs)).toEqual(
      getWindowStart(new Date(windowMs - 1), windowMs)
    )
    expect(getWindowStart(new Date(0), windowMs)).not.toEqual(
      getWindowStart(new Date(windowMs), windowMs)
    )
  })
})

describe("hashIdentity and buildBucketKey", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(hashIdentity("p", "  Value ")).toBe(hashIdentity("p", "value"))
  })

  it("separates purposes so keys cannot be correlated across rules", () => {
    expect(hashIdentity("a", "value")).not.toBe(hashIdentity("b", "value"))
  })

  it("produces deterministic hex keys namespaced by rule", () => {
    const key = buildBucketKey("login-account", "applicant:9000000001")

    expect(key).toMatch(/^login-account:[0-9a-f]{64}$/)
    expect(key).toBe(buildBucketKey("login-account", "Applicant:9000000001 "))
    expect(key).not.toBe(buildBucketKey("login-ip", "applicant:9000000001"))
  })
})

describe("getRetryAfterSeconds", () => {
  it("rounds up to at least one second until the window ends", () => {
    const windowStart = new Date(60_000)

    expect(getRetryAfterSeconds(new Date(61_500), windowStart, 60_000)).toBe(59)
    expect(getRetryAfterSeconds(new Date(119_001), windowStart, 60_000)).toBe(1)
    expect(getRetryAfterSeconds(new Date(120_000), windowStart, 60_000)).toBe(1)
  })
})
