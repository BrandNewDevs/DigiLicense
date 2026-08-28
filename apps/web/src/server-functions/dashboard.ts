import { createServerFn } from "@tanstack/react-start"

const resetWalkthroughAppointment = createServerFn({ method: "POST" }).handler(
  async () => {
    const { resetWalkthroughAppointment: reset } =
      await import("../server/dashboard.server")
    return reset()
  }
)

const readApplicantDashboard = createServerFn({ method: "POST" }).handler(
  async () => {
    const { readApplicantDashboard: read } =
      await import("../server/dashboard.server")
    return read()
  }
)

export { readApplicantDashboard, resetWalkthroughAppointment }
