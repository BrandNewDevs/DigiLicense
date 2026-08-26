import { createServerFn } from "@tanstack/react-start"

import {
  applicationLookupSchema,
  markApplicationNotificationReadSchema,
} from "../validation/application-status"

const lookupApplicationStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => applicationLookupSchema.parse(input))
  .handler(async ({ data }) => {
    const { lookupAuthorizedApplicationStatus } =
      await import("../server/application-status.server")

    return lookupAuthorizedApplicationStatus(data.applicationNumber)
  })

const markApplicationNotificationRead = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    markApplicationNotificationReadSchema.parse(input)
  )
  .handler(async ({ data }) => {
    const { markApplicationNotificationRead: markRead } =
      await import("../server/application-status.server")

    return markRead(data)
  })

export { lookupApplicationStatus, markApplicationNotificationRead }
