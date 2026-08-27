import { createServerFn } from "@tanstack/react-start"

import {
  renewalReadSchema,
  renewalSubmissionSchema,
} from "../validation/renewal"

const readRenewalState = createServerFn({ method: "POST" })
  .validator((input: unknown) => renewalReadSchema.parse(input))
  .handler(async () => {
    const { readRenewalState: readState } =
      await import("../server/renewal.server")
    return readState()
  })

const submitRenewalApplication = createServerFn({ method: "POST" })
  .validator((input: unknown) => renewalSubmissionSchema.parse(input))
  .handler(async ({ data }) => {
    const { submitRenewalApplication: submit } =
      await import("../server/renewal.server")
    return submit(data)
  })

export { readRenewalState, submitRenewalApplication }
