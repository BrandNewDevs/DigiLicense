import { createServerFn } from "@tanstack/react-start"

import {
  demoCredentialsSchema,
  demoLogoutSchema,
} from "../validation/demo-auth"

const loginDemoSession = createServerFn({ method: "POST" })
  .validator((input: unknown) => demoCredentialsSchema.parse(input))
  .handler(async ({ data }) => {
    const { getApplicantSession, getOperatorSession } =
      await import("../server/demo-session.server")

    if (data.role === "applicant") {
      if (data.mobileNumber !== "9000000001" || data.otp !== "123456") {
        return {
          ok: false as const,
          message: "The demo credentials were not accepted.",
        }
      }

      const session = await getApplicantSession()
      await session.update({
        applicantId: "demo-applicant-001",
        role: "applicant",
      })
      return { ok: true as const }
    }

    const expectedUsername =
      process.env.DEMO_OPERATOR_USERNAME?.trim().toLowerCase() ??
      "operator.demo"
    const expectedPassword = process.env.DEMO_OPERATOR_PASSWORD ?? "demo-only"

    if (
      data.username !== expectedUsername ||
      data.password !== expectedPassword
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
