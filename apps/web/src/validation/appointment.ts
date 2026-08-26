import { z } from "zod"

const appointmentZoneValues = [
  "CENTRAL_DELHI",
  "EAST_DELHI",
  "NORTH_DELHI",
  "SOUTH_DELHI",
] as const
const appointmentNotificationChannelValues = ["SMS", "EMAIL"] as const

const idempotencyKeySchema = z.string().uuid()
const applicationNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{6,32}$/)
const appointmentOfferIdSchema = z.string().cuid()

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

const saveAppointmentPreferencesSchema = z
  .object({
    applicationNumber: applicationNumberSchema,
    idempotencyKey: idempotencyKeySchema,
    notificationChannels: z
      .array(z.enum(appointmentNotificationChannelValues))
      .min(1)
      .max(2),
    zones: z.array(z.enum(appointmentZoneValues)).min(1).max(3),
  })
  .strict()
  .superRefine((input, context) => {
    if (hasDuplicates(input.zones)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose each Delhi zone only once.",
        path: ["zones"],
      })
    }
    if (hasDuplicates(input.notificationChannels)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose each notification channel only once.",
        path: ["notificationChannels"],
      })
    }
  })

const leaveAppointmentWaitlistSchema = z
  .object({
    applicationNumber: applicationNumberSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()

const respondToAppointmentOfferSchema = z
  .object({
    applicationNumber: applicationNumberSchema,
    idempotencyKey: idempotencyKeySchema,
    offerId: appointmentOfferIdSchema,
  })
  .strict()

type SaveAppointmentPreferencesInput = z.infer<
  typeof saveAppointmentPreferencesSchema
>
type LeaveAppointmentWaitlistInput = z.infer<
  typeof leaveAppointmentWaitlistSchema
>
type RespondToAppointmentOfferInput = z.infer<
  typeof respondToAppointmentOfferSchema
>

export {
  leaveAppointmentWaitlistSchema,
  respondToAppointmentOfferSchema,
  saveAppointmentPreferencesSchema,
}
export type {
  LeaveAppointmentWaitlistInput,
  RespondToAppointmentOfferInput,
  SaveAppointmentPreferencesInput,
}
