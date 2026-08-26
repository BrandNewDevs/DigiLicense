import { z } from "zod"

const permanentLicenceSubmissionSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    vehicleClass: z.enum([
      "MOTORCYCLE_WITHOUT_GEAR",
      "MOTORCYCLE_WITH_GEAR",
      "CAR",
    ]),
  })
  .strict()

type PermanentLicenceSubmission = z.infer<
  typeof permanentLicenceSubmissionSchema
>

export { permanentLicenceSubmissionSchema }
export type { PermanentLicenceSubmission }
