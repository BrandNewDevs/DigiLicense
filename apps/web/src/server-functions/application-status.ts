import { createServerFn } from "@tanstack/react-start"

import { applicationLookupSchema } from "../validation/application-status"

const lookupApplicationStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => applicationLookupSchema.parse(input))
  .handler(async ({ data }) => {
    const { lookupAuthorizedApplicationStatus } =
      await import("../server/application-status.server")

    return lookupAuthorizedApplicationStatus(data.applicationNumber)
  })

export { lookupApplicationStatus }
