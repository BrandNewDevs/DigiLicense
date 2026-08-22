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

export { applicationLookupSchema }
