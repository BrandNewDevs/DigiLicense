import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

const applicationLookupSchema = z.object({
  applicationNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(8)
    .max(32)
    .regex(/^[A-Z0-9-]+$/),
})

const lookupApplicationStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => applicationLookupSchema.parse(input))
  .handler(async ({ data }) => {
    const { lookupAuthorizedApplicationStatus } =
      await import("../server/application-status.server")

    return lookupAuthorizedApplicationStatus(data.applicationNumber)
  })

export { lookupApplicationStatus }
