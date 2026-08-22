import { createServerFn } from "@tanstack/react-start"

import {
  operatorApplicationActionSchema,
  operatorApplicationSchema,
} from "../validation/operator"

const getOperatorDashboard = createServerFn({ method: "GET" }).handler(
  async () => {
    const { readOperatorDashboard } = await import("../server/operator.server")
    return readOperatorDashboard()
  }
)

const getOperatorApplication = createServerFn({ method: "GET" })
  .validator((input: unknown) => operatorApplicationSchema.parse(input))
  .handler(async ({ data }) => {
    const { readOperatorApplication } =
      await import("../server/operator.server")
    return readOperatorApplication(data.applicationId)
  })

const runOperatorApplicationAction = createServerFn({ method: "POST" })
  .validator((input: unknown) => operatorApplicationActionSchema.parse(input))
  .handler(async ({ data }) => {
    const { applyOperatorAction } = await import("../server/operator.server")
    return applyOperatorAction(data)
  })

export {
  getOperatorApplication,
  getOperatorDashboard,
  runOperatorApplicationAction,
}
