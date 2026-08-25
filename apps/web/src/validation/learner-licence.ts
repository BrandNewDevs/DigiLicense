import { z } from "zod"

import {
  addressProofValues,
  calculateCompletedYears,
  delhiZoneValues,
  getVehicleClass,
  identityProofValues,
  isValidIsoCalendarDate,
  vehicleClassValues,
} from "../lib/learner-licence"

// Synthetic applicant detail. Names stay bounded and restricted to letters so
// unbounded free text never reaches workflow records.
const fullNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L}][\p{L}\s.'’-]*$/u, "Enter a name using letters only.")

const isoDateSchema = z
  .string()
  .refine(isValidIsoCalendarDate, "Enter a real calendar date.")

const vehicleClassSchema = z.enum(vehicleClassValues)
const delhiZoneSchema = z.enum(delhiZoneValues)
const identityProofSchema = z.enum(identityProofValues)
const addressProofSchema = z.enum(addressProofValues)

// Draft payloads accept any subset of valid fields so partial progress can be
// persisted. Cross-field eligibility is deliberately deferred to submission.
const learnerLicenceDraftPayloadSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    dateOfBirth: isoDateSchema.optional(),
    vehicleClass: vehicleClassSchema.optional(),
    zone: delhiZoneSchema.optional(),
    identityProofType: identityProofSchema.optional(),
    addressProofType: addressProofSchema.optional(),
  })
  .strict()

const learnerLicenceSubmissionSchema = learnerLicenceDraftPayloadSchema
  .extend({
    declarationAccepted: z.literal(true),
  })
  .superRefine((data, ctx) => {
    const requiredFields = [
      "fullName",
      "dateOfBirth",
      "vehicleClass",
      "zone",
      "identityProofType",
      "addressProofType",
    ] as const

    for (const field of requiredFields) {
      if (data[field] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "This field is required before submission.",
        })
      }
    }

    if (
      data.dateOfBirth === undefined ||
      data.vehicleClass === undefined ||
      !isValidIsoCalendarDate(data.dateOfBirth)
    ) {
      return
    }

    // Eligibility is recomputed here on the server clock at the API boundary;
    // client-side checks are convenience only.
    const completedYears = calculateCompletedYears(data.dateOfBirth, new Date())
    const minimumAge = getVehicleClass(data.vehicleClass)?.minimumAgeYears

    if (completedYears === undefined || minimumAge === undefined) return

    if (completedYears < minimumAge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateOfBirth"],
        message: `The selected vehicle class requires a minimum age of ${minimumAge}.`,
      })
    }
  })

type LearnerLicenceDraftPayload = z.infer<
  typeof learnerLicenceDraftPayloadSchema
>

type LearnerLicenceSubmission = z.infer<typeof learnerLicenceSubmissionSchema>

export { learnerLicenceDraftPayloadSchema, learnerLicenceSubmissionSchema }
export type {
  LearnerLicenceDraftPayload,
  LearnerLicenceSubmission,
}
