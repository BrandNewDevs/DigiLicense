import { createServerFn } from "@tanstack/react-start"

import {
  leaveAppointmentWaitlistSchema,
  respondToAppointmentOfferSchema,
  saveAppointmentPreferencesSchema,
} from "../validation/appointment"

const readAppointmentJourney = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    leaveAppointmentWaitlistSchema
      .pick({ applicationNumber: true })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { readAppointmentJourney: read } =
      await import("../server/appointment.server")
    return read(data.applicationNumber)
  })

const saveAppointmentPreferences = createServerFn({ method: "POST" })
  .validator((input: unknown) => saveAppointmentPreferencesSchema.parse(input))
  .handler(async ({ data }) => {
    const { saveAppointmentPreferences: save } =
      await import("../server/appointment.server")
    return save(data)
  })

const leaveAppointmentWaitlist = createServerFn({ method: "POST" })
  .validator((input: unknown) => leaveAppointmentWaitlistSchema.parse(input))
  .handler(async ({ data }) => {
    const { leaveAppointmentWaitlist: leave } =
      await import("../server/appointment.server")
    return leave(data)
  })

const acceptAppointmentOffer = createServerFn({ method: "POST" })
  .validator((input: unknown) => respondToAppointmentOfferSchema.parse(input))
  .handler(async ({ data }) => {
    const { acceptAppointmentOffer: accept } =
      await import("../server/appointment.server")
    return accept(data)
  })

const rejectAppointmentOffer = createServerFn({ method: "POST" })
  .validator((input: unknown) => respondToAppointmentOfferSchema.parse(input))
  .handler(async ({ data }) => {
    const { rejectAppointmentOffer: reject } =
      await import("../server/appointment.server")
    return reject(data)
  })

export {
  acceptAppointmentOffer,
  leaveAppointmentWaitlist,
  readAppointmentJourney,
  rejectAppointmentOffer,
  saveAppointmentPreferences,
}
