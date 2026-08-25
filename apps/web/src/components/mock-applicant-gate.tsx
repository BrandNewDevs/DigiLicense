import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { useMockSession } from "../lib/mock-auth"

type MockApplicantGateProps = {
  children: ReactNode
  returnTo: string
}

function MockApplicantGate({ children, returnTo }: MockApplicantGateProps) {
  const isSignedIn = useMockSession("applicant")
  if (!isSignedIn) {
    return (
      <section
        className="rounded-3xl border border-border p-6 sm:p-8"
        aria-labelledby="mock-sign-in-title"
      >
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border"></div>
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

  return children
}

export { MockApplicantGate }
