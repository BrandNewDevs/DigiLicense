import { createServerFn } from "@tanstack/react-start"

import { permanentLicenceSubmissionSchema } from "../validation/permanent-licence"

const advanceWalkthroughWaitingPeriod = createServerFn({
  method: "POST",
}).handler(async () => {
  const { advanceWalkthroughWaitingPeriod: advance } =
    await import("../server/permanent-licence.server")
  return advance()
})

const readPermanentLicenceState = createServerFn({ method: "POST" }).handler(
  async () => {
    const { readPermanentLicenceState: readState } =
      await import("../server/permanent-licence.server")
    return readState()
  }
)

const submitPermanentLicenceApplication = createServerFn({ method: "POST" })
  .validator((input: unknown) => permanentLicenceSubmissionSchema.parse(input))
  .handler(async ({ data }) => {
    const { submitPermanentLicenceApplication: submitApplication } =
      await import("../server/permanent-licence.server")
    return submitApplication(data)
  })

export {
  advanceWalkthroughWaitingPeriod,
  readPermanentLicenceState,
  submitPermanentLicenceApplication,
}
