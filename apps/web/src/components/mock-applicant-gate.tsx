import type { ReactNode } from "react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"

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
    return isSignInOpen ? (
      <MockLoginPage
        onOpenChange={setIsSignInOpen}
        open={isSignInOpen}
        returnTo={returnTo}
      />
    ) : (
      <section className="rounded-xl border border-border p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Sign in required</h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Sign in to continue with this service.
        </p>
        <Button
          className="mt-6 h-11"
          onClick={() => setIsSignInOpen(true)}
          type="button"
          variant="solid"
        >
          Sign in to continue
        </Button>
      </section>
    )
  }

  return children
}

export { MockApplicantGate }
