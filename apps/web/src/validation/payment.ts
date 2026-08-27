import { z } from "zod"

const feeServiceValues = [
  "learner-licence",
  "permanent-licence",
  "address-change",
  "renewal",
  "replacement",
] as const

const applicationNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{6,32}$/)
const idempotencyKeySchema = z.string().uuid()

const feeQuoteSchema = z.object({ service: z.enum(feeServiceValues) }).strict()
const applicationPaymentReadSchema = z
  .object({ applicationNumber: applicationNumberSchema })
  .strict()
const startApplicationPaymentSchema = z
  .object({
    applicationNumber: applicationNumberSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
const resolveApplicationPaymentSchema = z
  .object({
    applicationNumber: applicationNumberSchema,
    idempotencyKey: idempotencyKeySchema,
    outcome: z.enum(["SUCCESS", "FAILURE"]),
    paymentId: z.string().cuid(),
  })
  .strict()

type FeeQuoteInput = z.infer<typeof feeQuoteSchema>
type StartApplicationPaymentInput = z.infer<
  typeof startApplicationPaymentSchema
>
type ResolveApplicationPaymentInput = z.infer<
  typeof resolveApplicationPaymentSchema
>

export {
  applicationPaymentReadSchema,
  feeQuoteSchema,
  resolveApplicationPaymentSchema,
  startApplicationPaymentSchema,
}
export type {
  FeeQuoteInput,
  ResolveApplicationPaymentInput,
  StartApplicationPaymentInput,
}
