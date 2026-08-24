import { createServerFn } from "@tanstack/react-start"

import {
  completeMockAadhaarVerificationSchema,
  startMobileUpdateSchema,
  verifyMobileUpdateOtpSchema,
} from "../validation/mobile-update"

const readMobileUpdateState = createServerFn({ method: "POST" }).handler(
  async () => {
    const { readMobileUpdateState: readState } = await import(
      "../server/mobile-update.server"
    )
    return readState()
  }
)

const startMobileUpdate = createServerFn({ method: "POST" })
  .validator((input: unknown) => startMobileUpdateSchema.parse(input))
  .handler(async ({ data }) => {
    const { startMobileUpdate: start } = await import(
      "../server/mobile-update.server"
    )
    return start(data)
  })

const verifyMobileUpdateOtp = createServerFn({ method: "POST" })
  .validator((input: unknown) => verifyMobileUpdateOtpSchema.parse(input))
  .handler(async ({ data }) => {
    const session = await import("../server/demo-session.server")
    const applicant = await session.requireApplicant()
    const { verifyMobileUpdateOtp: verify } = await import(
      "../server/mobile-update.server"
    )
    const result = await verify(data)
    if (result.kind === "completed" && applicant)
      await session.rotateApplicantSession({ applicantId: applicant.applicantId, authVersion: result.authVersion })
    return result
  })

const completeMockAadhaarVerification = createServerFn({ method: "POST" })
  .validator((input: unknown) => completeMockAadhaarVerificationSchema.parse(input))
  .handler(async ({ data }) => {
    const session = await import("../server/demo-session.server")
    const applicant = await session.requireApplicant()
    const { completeMockAadhaarVerification: complete } = await import(
      "../server/mobile-update.server"
    )
    const result = await complete(data)
    if (result.kind === "completed" && applicant)
      await session.rotateApplicantSession({ applicantId: applicant.applicantId, authVersion: result.authVersion })
    return result
  })

export {
  completeMockAadhaarVerification,
  readMobileUpdateState,
  startMobileUpdate,
  verifyMobileUpdateOtp,
}
