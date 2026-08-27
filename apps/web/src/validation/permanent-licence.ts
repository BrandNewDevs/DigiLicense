import { z } from "zod"

import { vehicleClassValues } from "../lib/learner-licence"

const permanentLicenceSubmissionSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    vehicleClass: z.enum(vehicleClassValues),
  })
  .strict()

type PermanentLicenceSubmission = z.infer<
  typeof permanentLicenceSubmissionSchema
>

export { permanentLicenceSubmissionSchema }
export type { PermanentLicenceSubmission }
