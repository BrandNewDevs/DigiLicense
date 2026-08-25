import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"

import { endMockSession, useMockSession } from "../lib/mock-auth"
import { logoutDemoSession } from "../server-functions/demo-auth"

type MockApplicantGateProps = {
  children: ReactNode
  returnTo: string
}

function MockApplicantGate({ children, returnTo }: MockApplicantGateProps) {
  const isSignedIn = useMockSession("applicant")
  const logout = useServerFn(logoutDemoSession)

  if (!isSignedIn) {
    return (
      <section
        className="rounded-3xl border border-border p-6 sm:p-8"
        aria-labelledby="mock-sign-in-title"
      >
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border">
        </div>
        <p className="mt-6 text-sm font-medium text-muted-foreground">
          Sign in required
        </p>
        <h2
          className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]"
          id="mock-sign-in-title"
        >
          Continue as the applicant
        </h2>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          This service does not verify a real identity. Continue to the
          applicant sign-in route and use the displayed credentials.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-foreground px-5 text-base font-medium text-foreground"
          search={{ returnTo }}
          to="/applicant/login"
        >
          Go to sign in
        </Link>
      </section>
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-medium">Applicant active</p>
            <p className="text-sm text-muted-foreground">
              Applicant 001
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="h-9"
          onClick={async () => {
            await logout({ data: { role: "applicant" } })
            endMockSession("applicant")
          }}
          type="button"
        >
          End session
        </Button>
      </div>
      {children}
    </div>
  )
}

export { MockApplicantGate }
