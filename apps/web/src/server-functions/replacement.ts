import { createServerFn } from "@tanstack/react-start"

import {
  replacementReadSchema,
  replacementSubmissionSchema,
} from "../validation/replacement"

const readReplacementState = createServerFn({ method: "POST" })
  .validator((input: unknown) => replacementReadSchema.parse(input))
  .handler(async () => {
    const { readReplacementState: readState } =
      await import("../server/replacement.server")
    return readState()
  })

const submitReplacementApplication = createServerFn({ method: "POST" })
  .validator((input: unknown) => replacementSubmissionSchema.parse(input))
  .handler(async ({ data }) => {
    const { submitReplacementApplication: submit } =
      await import("../server/replacement.server")
    return submit(data)
  })

export { readReplacementState, submitReplacementApplication }
