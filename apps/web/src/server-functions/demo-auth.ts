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

    const accountIdentifier =
      data.role === "applicant" ? data.mobileNumber : data.username

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

    const { getApplicantSession, getOperatorSession } =
      await import("../server/demo-session.server")

    if (data.role === "applicant") {
      const {
        getCurrentMobileHmacKeyVersion,
        getMobileHashCandidates,
        hashMobileNumber,
        normalizeMobileNumber,
        prisma,
      } = await import(
        "@digilicense/db/server"
      )
      const { getDemoApplicantOtp } = await import(
        "../server/verification-otp.shared"
      )
      const mobileNumber = normalizeMobileNumber(data.mobileNumber)

      if (!mobileNumber || data.otp !== getDemoApplicantOtp()) {
        return {
          ok: false as const,
          message: "The demo credentials were not accepted.",
        }
      }

      const hashCandidates = getMobileHashCandidates(mobileNumber)
      const account = await prisma.applicantAccount.findFirst({
        where: { mobileHmac: { in: hashCandidates.map((candidate) => candidate.hmac) } },
        select: { authVersion: true, id: true, mobileHmac: true },
      })

      if (!account) {
        return {
          ok: false as const,
          message: "The demo credentials were not accepted.",
        }
      }

      const currentMobileHmac = hashMobileNumber(mobileNumber)
      const currentKeyVersion = getCurrentMobileHmacKeyVersion()

      if (account.mobileHmac !== currentMobileHmac) {
        await prisma.applicantAccount.update({
          where: { id: account.id },
          data: {
            mobileHmac: currentMobileHmac,
            mobileHmacKeyVersion: currentKeyVersion,
          },
        })
      }

      const session = await getApplicantSession()
      await session.update({
        applicantId: account.id,
        authVersion: account.authVersion,
        role: "applicant",
      })
      return { ok: true as const }
    }

    const configuredUsername =
      process.env.DEMO_OPERATOR_USERNAME?.trim().toLowerCase()
    const configuredPassword = process.env.DEMO_OPERATOR_PASSWORD

    if (!configuredUsername || !configuredPassword) {
      return {
        ok: false as const,
        message:
          "Operator sign in is unavailable because synthetic operator credentials are not configured.",
      }
    }

    if (
      data.username !== configuredUsername ||
      data.password !== configuredPassword
    ) {
      return {
        ok: false as const,
        message: "The demo credentials were not accepted.",
      }
    }

    const session = await getOperatorSession()
    await session.update({
      operatorId: "demo-operator-001",
      role: "operator",
    })

    return { ok: true as const }
  })

const logoutDemoSession = createServerFn({ method: "POST" })
  .validator((input: unknown) => demoLogoutSchema.parse(input))
  .handler(async ({ data }) => {
    const { getApplicantSession, getOperatorSession } =
      await import("../server/demo-session.server")
    const session =
      data.role === "applicant"
        ? await getApplicantSession()
        : await getOperatorSession()

    await session.clear()
    return { ok: true as const }
  })

export { loginDemoSession, logoutDemoSession }
