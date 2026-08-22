import { createFileRoute } from "@tanstack/react-router"

import { MockLoginPage } from "../components/mock-login-page"

export const Route = createFileRoute("/operator/login")({
  component: OperatorLoginPage,
})

function OperatorLoginPage() {
  return <MockLoginPage role="operator" />
}
