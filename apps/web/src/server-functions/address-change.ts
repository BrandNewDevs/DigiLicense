import { createServerFn } from "@tanstack/react-start"

import {
  saveAddressChangeDraftSchema,
  startAddressChangeOtpSchema,
  submitAddressChangeApplicationSchema,
  verifyAddressChangeOtpSchema,
} from "../validation/address-change"

const readAddressChangeState = createServerFn({ method: "POST" }).handler(
  async () => {
    const { readAddressChangeState: readState } =
      await import("../server/address-change.server")
    return readState()
  }
)

const startAddressChangeOtp = createServerFn({ method: "POST" })
  .validator((input: unknown) => startAddressChangeOtpSchema.parse(input))
  .handler(async ({ data }) => {
    const { startAddressChangeOtp: start } =
      await import("../server/address-change.server")
    return start(data)
  })

const verifyAddressChangeOtp = createServerFn({ method: "POST" })
  .validator((input: unknown) => verifyAddressChangeOtpSchema.parse(input))
  .handler(async ({ data }) => {
    const { verifyAddressChangeOtp: verify } =
      await import("../server/address-change.server")
    return verify(data)
  })

const saveAddressChangeDraft = createServerFn({ method: "POST" })
  .validator((input: unknown) => saveAddressChangeDraftSchema.parse(input))
  .handler(async ({ data }) => {
    const { saveAddressChangeDraft: saveDraft } =
      await import("../server/address-change.server")
    return saveDraft(data)
  })

const submitAddressChangeApplication = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    submitAddressChangeApplicationSchema.parse(input)
  )
  .handler(async ({ data }) => {
    const { submitAddressChangeApplication: submit } =
      await import("../server/address-change.server")
    return submit(data)
  })

export {
  readAddressChangeState,
  saveAddressChangeDraft,
  startAddressChangeOtp,
  submitAddressChangeApplication,
  verifyAddressChangeOtp,
}
