import { z } from "zod"

const replacementReadSchema = z.object({}).strict()
const replacementSubmissionSchema = z
  .object({
    declarationAccepted: z.literal(true),
    idempotencyKey: z.string().uuid(),
    licenceRecordId: z.string().cuid(),
    reason: z.enum(["LOST", "DAMAGED", "UNREADABLE"]),
  })
  .strict()

type ReplacementSubmission = z.infer<typeof replacementSubmissionSchema>

export { replacementReadSchema, replacementSubmissionSchema }
export type { ReplacementSubmission }
