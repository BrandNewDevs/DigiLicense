import { z } from "zod"

import {
  addressChangeLocalityValues,
  mockAddressProofValues,
} from "../lib/address-change"

const idempotencyKeySchema = z.string().uuid()
const identifierSchema = z.string().cuid()
const addressLineSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(
    /^[\p{L}\p{N}][\p{L}\p{N}\s,.'’/#()-]*$/u,
    "Use letters, numbers, and standard address punctuation only."
  )
const localitySchema = z.enum(addressChangeLocalityValues)
const pincodeSchema = z
  .string()
  .trim()
  .regex(/^110\d{3}$/)
const proofTypeSchema = z.enum(mockAddressProofValues)

const addressChangeDraftPayloadSchema = z
  .object({
    addressLine1: addressLineSchema.optional(),
    addressLine2: addressLineSchema.optional(),
    locality: localitySchema.optional(),
    pincode: pincodeSchema.optional(),
    proofType: proofTypeSchema.optional(),
  })
  .strict()

const startAddressChangeOtpSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    licenceRecordId: identifierSchema,
  })
  .strict()

const verifyAddressChangeOtpSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
    verificationId: identifierSchema,
  })
  .strict()

const saveAddressChangeDraftSchema = z
  .object({
    payload: addressChangeDraftPayloadSchema,
    verificationId: identifierSchema,
  })
  .strict()

const submitAddressChangeApplicationSchema = addressChangeDraftPayloadSchema
  .extend({
    declarationAccepted: z.literal(true),
    idempotencyKey: idempotencyKeySchema,
    verificationId: identifierSchema,
  })
  .superRefine((data, ctx) => {
    for (const field of [
      "addressLine1",
      "locality",
      "pincode",
      "proofType",
    ] as const) {
      if (data[field] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "This field is required before submission.",
          path: [field],
        })
      }
    }
  })

type AddressChangeDraftPayload = z.infer<typeof addressChangeDraftPayloadSchema>
type AddressChangeSubmission = z.infer<
  typeof submitAddressChangeApplicationSchema
>

export {
  addressChangeDraftPayloadSchema,
  saveAddressChangeDraftSchema,
  startAddressChangeOtpSchema,
  submitAddressChangeApplicationSchema,
  verifyAddressChangeOtpSchema,
}
export type { AddressChangeDraftPayload, AddressChangeSubmission }
