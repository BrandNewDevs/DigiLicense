import { createServerFn } from "@tanstack/react-start"

import type { ConsumeRateLimitResult } from "../server/rate-limit.server"
import {
  demoCredentialsSchema,
  demoLogoutSchema,
} from "../validation/demo-auth"

const loginDemoSession = createServerFn({ method: "POST" })
  .validator((input: unknown) => demoCredentialsSchema.parse(input))
  .handler(async ({ data }) => {
    const { consumeRateLimit, getRateLimitClientIp } = await import(
      "../server/rate-limit.server"
    )
    const { recordDependencyFailure } = await import("../server/logger.server")

    let ipLimit: ConsumeRateLimitResult

    try {
      ipLimit = await consumeRateLimit("login-ip", getRateLimitClientIp())
    } catch (error) {
      recordDependencyFailure(error, {
        dependency: "postgres",
        operation: "rate_limit_login_ip",
      })

      return {
        ok: false as const,
        message: "Sign in is temporarily unavailable. Please try again later.",
      }
    }

    if (!ipLimit.allowed) {
      return {
        ok: false as const,
        message:
          "Too many sign-in attempts from this network. Please try again later.",
      }
    }

    const accountIdentifier = data.mobileNumber

    let accountLimit: ConsumeRateLimitResult

    try {
      accountLimit = await consumeRateLimit(
        "login-account",
        `${data.role}:${accountIdentifier}`
      )
    } catch (error) {
      recordDependencyFailure(error, {
        dependency: "postgres",
        operation: "rate_limit_login_account",
      })

      return {
        ok: false as const,
        message: "Sign in is temporarily unavailable. Please try again later.",
      }
    }

    if (!accountLimit.allowed) {
      return {
        ok: false as const,
        message:
          "Too many attempts for these credentials. Please try again in a few minutes.",
      }
    }

    const { getApplicantSession } = await import(
      "../server/demo-session.server"
    )

    if (data.mobileNumber !== "9000000001" || data.otp !== "123456") {
      return {
        ok: false as const,
        message: "The credentials were not accepted.",
      }
    }

    const session = await getApplicantSession()
    await session.update({
      applicantId: "demo-applicant-001",
      role: "applicant",
    })

    return { ok: true as const }
  })

const logoutDemoSession = createServerFn({ method: "POST" })
  .validator((input: unknown) => demoLogoutSchema.parse(input))
  .handler(async () => {
    const { getApplicantSession } = await import(
      "../server/demo-session.server"
    )
    const session = await getApplicantSession()

    await session.clear()
    return { ok: true as const }
  })

export { loginDemoSession, logoutDemoSession }
