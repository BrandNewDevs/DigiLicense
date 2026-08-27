import { z } from "zod"

const renewalReadSchema = z.object({}).strict()
const renewalSubmissionSchema = z
  .object({
    declarationAccepted: z.literal(true),
    idempotencyKey: z.string().uuid(),
    licenceRecordId: z.string().cuid(),
    reason: z.enum(["EXPIRING_SOON", "RECENTLY_EXPIRED"]),
  })
  .strict()

type RenewalSubmission = z.infer<typeof renewalSubmissionSchema>

export { renewalReadSchema, renewalSubmissionSchema }
export type { RenewalSubmission }
