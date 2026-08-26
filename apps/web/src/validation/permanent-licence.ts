import { z } from "zod"

const permanentLicenceSubmissionSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    vehicleClass: z.enum([
      "MOTORCYCLE_WITHOUT_GEAR",
      "MOTORCYCLE_WITH_GEAR",
      "LIGHT_MOTOR_VEHICLE",
    ]),
  })
  .strict()

type PermanentLicenceSubmission = z.infer<
  typeof permanentLicenceSubmissionSchema
>

export { permanentLicenceSubmissionSchema }
export type { PermanentLicenceSubmission }
