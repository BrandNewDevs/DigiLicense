import type { ReactNode } from "react"
import { useState } from "react"

import { useMockSession } from "../lib/mock-auth"
import { MockLoginPage } from "./mock-login-page"

type MockApplicantGateProps = {
  children: ReactNode
  returnTo: string
}

function MockApplicantGate({ children, returnTo }: MockApplicantGateProps) {
  const isSignedIn = useMockSession("applicant")
  const [isSignInOpen, setIsSignInOpen] = useState(true)

  if (!isSignedIn) {
    return (
      <MockLoginPage
        onOpenChange={setIsSignInOpen}
        open={isSignInOpen}
        returnTo={returnTo}
      />
    )
  }

  return children
}

export { MockApplicantGate }
