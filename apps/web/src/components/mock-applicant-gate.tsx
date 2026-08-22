import { LogIn, ShieldCheck } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import { Button } from "@workspace/ui/components/button"

import { endMockSession, useMockSession } from "../lib/mock-auth"

type MockApplicantGateProps = {
  children: ReactNode
  returnTo: string
}

function MockApplicantGate({ children, returnTo }: MockApplicantGateProps) {
  const isSignedIn = useMockSession("applicant")

  if (!isSignedIn) {
    return (
      <section
        className="rounded-3xl border border-border bg-card p-6 sm:p-8"
        aria-labelledby="mock-sign-in-title"
      >
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
          <LogIn className="size-5" aria-hidden="true" />
        </div>
        <p className="mt-6 text-sm font-medium text-muted-foreground">
          Mock authentication required
        </p>
        <h2
          className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]"
          id="mock-sign-in-title"
        >
          Continue as the demo applicant
        </h2>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          This prototype does not verify a real identity. Continue to the
          applicant sign-in route and use the displayed synthetic credentials.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground hover:bg-primary/80"
          search={{ returnTo }}
          to="/applicant/login"
        >
          Go to mock sign in
        </Link>
      </section>
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Mock applicant active</p>
            <p className="text-sm text-muted-foreground">
              Demo Applicant 001, synthetic data only
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="h-9"
          onClick={() => endMockSession("applicant")}
          type="button"
        >
          End mock session
        </Button>
      </div>
      {children}
    </div>
  )
}

export { MockApplicantGate }
