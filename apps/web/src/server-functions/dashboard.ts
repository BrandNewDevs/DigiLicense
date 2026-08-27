import { createServerFn } from "@tanstack/react-start"

const readApplicantDashboard = createServerFn({ method: "POST" }).handler(
  async () => {
    const { readApplicantDashboard: read } =
      await import("../server/dashboard.server")
    return read()
  }
)

export { readApplicantDashboard }
