import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { MockLoginPage } from "../components/mock-login-page"

const applicantLoginSearchSchema = z.object({
  returnTo: z
    .string()
    .regex(/^\/(?:services(?:\/[a-z0-9-]+)?)?$/)
    .catch("/services"),
})

export const Route = createFileRoute("/applicant/login")({
  component: ApplicantLoginPage,
  validateSearch: (search) => applicantLoginSearchSchema.parse(search),
})

function ApplicantLoginPage() {
  const { returnTo } = Route.useSearch()

  return <MockLoginPage returnTo={returnTo} />
}
