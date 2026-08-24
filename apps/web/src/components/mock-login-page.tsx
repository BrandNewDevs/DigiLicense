import { ArrowLeft, BadgeCheck, ShieldAlert } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"

import { ApplicantHeader } from "./applicant-header"
import {
  endMockSession,
  mockCredentials,
  startMockSession,
  useMockSession,
} from "../lib/mock-auth"
import {
  loginDemoSession,
  logoutDemoSession,
} from "../server-functions/demo-auth"

type MockLoginPageProps = {
  returnTo?: string
}

function MockLoginPage({ returnTo }: MockLoginPageProps) {
  const navigate = useNavigate()
  const isSignedIn = useMockSession("applicant")
  const login = useServerFn(loginDemoSession)
  const logout = useServerFn(logoutDemoSession)
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const destination =
    returnTo === "/" || returnTo?.startsWith("/services")
      ? returnTo
      : "/services"

  return (
    <div className="min-h-svh text-foreground">
      <ApplicantHeader
        navigation={[
          { href: "/#about", label: "About" },
          { href: "/services", label: "Services" },
          { href: "/#how-it-works", label: "How it works" },
        ]}
        returnTo={destination}
      />

      <main
        className="mx-auto grid min-h-[calc(100svh-64px)] max-w-[1100px] gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-10 lg:py-12"
        id="main-content"
      >
        <div>
          <Link
            className="inline-flex min-h-11 items-center gap-2 text-muted-foreground underline"
            to={destination}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Link>
          <p className="mt-8 text-base font-medium text-muted-foreground">
            Applicant access
          </p>
          <h1 className="mt-4 font-heading text-4xl font-medium tracking-[-0.06em] sm:text-6xl">
            Sign in as the demo applicant
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
            Use the fixed mobile number and OTP below. No message is sent and no
            identity is checked.
          </p>
          <div className="mt-8 flex gap-3 rounded-2xl border border-border p-4">
            <ShieldAlert className="mt-1 size-5 shrink-0" aria-hidden="true" />
            <p className="text-sm leading-6 text-muted-foreground">
              The server creates a short-lived demo session. It protects
              applicant routes but does not verify a real person.
            </p>
          </div>
        </div>

        {isSignedIn ? (
          <section className="rounded-3xl border border-border p-6 sm:p-8">
            <BadgeCheck className="size-10" aria-hidden="true" />
            <p className="mt-6 text-sm font-medium text-muted-foreground">
              Mock session active
            </p>
            <h2 className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]">
              Signed in as the demo applicant
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Protected service demos are now unlocked in this browser.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-foreground px-5 text-base font-medium text-foreground"
                to={destination}
              >
                Continue to services
              </Link>
              <Button
                className="h-11 px-5 text-base"
                onClick={async () => {
                  await logout({ data: { role: "applicant" } })
                  endMockSession("applicant")
                }}
                type="button"
                variant="outline"
              >
                End mock session
              </Button>
            </div>
          </section>
        ) : (
          <form
            className="rounded-3xl border border-border p-6 sm:p-8"
            onSubmit={async (event) => {
              event.preventDefault()
              const formData = new FormData(event.currentTarget)
              setIsSubmitting(true)

              try {
                const result = await login({
                  data: {
                    role: "applicant",
                    mobileNumber: String(formData.get("mobileNumber")),
                    otp: String(formData.get("otp")),
                  },
                })

                if (!result.ok) {
                  setError(result.message)
                  return
                }

                setError(undefined)
                startMockSession("applicant")
                await navigate({ to: destination })
              } catch {
                setError(
                  "Mock sign in is unavailable. Check the server configuration."
                )
              } finally {
                setIsSubmitting(false)
              }
            }}
          >
            <p className="text-sm font-medium text-muted-foreground">
              Synthetic credentials are prefilled
            </p>
            <div className="mt-6 space-y-5">
              <div>
                <label
                  className="mb-2 block text-sm font-medium"
                  htmlFor="applicant-mobileNumber"
                >
                  Synthetic mobile number
                </label>
                <input
                  autoComplete="off"
                  className="h-11 w-full rounded-lg border border-input px-3 text-base"
                  defaultValue={mockCredentials.applicant.mobileNumber}
                  id="applicant-mobileNumber"
                  name="mobileNumber"
                  required
                  type="text"
                />
              </div>
              <div>
                <label
                  className="mb-2 block text-sm font-medium"
                  htmlFor="applicant-otp"
                >
                  Demo OTP
                </label>
                <input
                  autoComplete="one-time-code"
                  className="h-11 w-full rounded-lg border border-input px-3 text-base"
                  defaultValue={mockCredentials.applicant.otp}
                  id="applicant-otp"
                  name="otp"
                  required
                  type="text"
                />
              </div>
            </div>
            {error ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              className="mt-7 h-11 w-full text-base"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Signing in..." : "Start mock applicant session"}
            </Button>
          </form>
        )}
      </main>
    </div>
  )
}

export { MockLoginPage }
