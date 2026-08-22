import { ArrowLeft, BadgeCheck, ShieldAlert } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"
import { SiteFooter } from "@workspace/ui/components/site-footer"
import { SiteHeader } from "@workspace/ui/components/site-header"

import {
  endMockSession,
  mockCredentials,
  startMockSession,
  useMockSession,
} from "../lib/mock-auth"
import type { MockRole } from "../lib/mock-auth"
import {
  loginDemoSession,
  logoutDemoSession,
} from "../server-functions/demo-auth"

type MockLoginPageProps = {
  returnTo?: string
  role: MockRole
}

const roleContent = {
  applicant: {
    eyebrow: "Applicant access",
    title: "Sign in as the demo applicant",
    description:
      "Use the fixed mobile number and OTP below. No message is sent and no identity is checked.",
    fields: [
      {
        autoComplete: "off",
        defaultValue: mockCredentials.applicant.mobileNumber,
        label: "Synthetic mobile number",
        name: "mobileNumber",
        type: "text",
      },
      {
        autoComplete: "one-time-code",
        defaultValue: mockCredentials.applicant.otp,
        label: "Demo OTP",
        name: "otp",
        type: "text",
      },
    ],
    submitLabel: "Start mock applicant session",
  },
  operator: {
    eyebrow: "Operator access",
    title: "Sign in as the demo operator",
    description:
      "Use the fixed credentials below. They identify only the synthetic operator in this prototype.",
    fields: [
      {
        autoComplete: "off",
        defaultValue: mockCredentials.operator.username,
        label: "Synthetic username",
        name: "username",
        type: "text",
      },
      {
        autoComplete: "new-password",
        defaultValue: mockCredentials.operator.password,
        label: "Demo password",
        name: "password",
        type: "password",
      },
    ],
    submitLabel: "Start mock operator session",
  },
} as const

function MockLoginPage({ returnTo, role }: MockLoginPageProps) {
  const navigate = useNavigate()
  const content = roleContent[role]
  const isSignedIn = useMockSession(role)
  const login = useServerFn(loginDemoSession)
  const logout = useServerFn(logoutDemoSession)
  const isApplicant = role === "applicant"
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const destination =
    isApplicant && (returnTo === "/" || returnTo?.startsWith("/services"))
      ? returnTo
      : "/services"

  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader
        brand={isApplicant ? "DigiLicense" : "DigiLicense Operator"}
        brandHref={isApplicant ? "/" : "/operator/login"}
        brandLabel={isApplicant ? "DigiLicense home" : "Operator sign in"}
        linkComponent={Link}
        navigation={
          isApplicant ? [{ href: "/services", label: "Services" }] : []
        }
      />

      <main
        className="mx-auto grid min-h-[calc(100svh-64px)] max-w-[1100px] gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-10 lg:py-12"
        id="main-content"
      >
        <div>
          {isApplicant ? (
            <Link
              className="inline-flex min-h-11 items-center gap-2 text-muted-foreground underline"
              to={destination}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Link>
          ) : null}
          <p
            className={`${isApplicant ? "mt-8" : "mt-0"} text-base font-medium text-muted-foreground`}
          >
            {content.eyebrow}
          </p>
          <h1 className="mt-4 font-heading text-4xl font-medium tracking-[-0.06em] sm:text-6xl">
            {content.title}
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
            {content.description}
          </p>
          <div className="mt-8 flex gap-3 rounded-2xl bg-muted p-4">
            <ShieldAlert className="mt-1 size-5 shrink-0" aria-hidden="true" />
            <p className="text-sm leading-6 text-muted-foreground">
              The server creates a short-lived, role-bound demo session. It
              isolates prototype routes but does not verify a real person.
            </p>
          </div>
        </div>

        {isSignedIn ? (
          <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
            <BadgeCheck className="size-10" aria-hidden="true" />
            <p className="mt-6 text-sm font-medium text-muted-foreground">
              Mock session active
            </p>
            <h2 className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]">
              Signed in as the demo {role}
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              {isApplicant
                ? "Protected service demos are now unlocked in this browser."
                : "The operator session is isolated from the applicant session. Operator tools are not part of this task yet."}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {isApplicant ? (
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground hover:bg-primary/80"
                  to={destination}
                >
                  Continue to services
                </Link>
              ) : (
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground hover:bg-primary/80"
                  to="/operator"
                >
                  Continue to operator dashboard
                </Link>
              )}
              <Button
                className="h-11 px-5 text-base"
                onClick={async () => {
                  await logout({ data: { role } })
                  endMockSession(role)
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
            className="rounded-3xl border border-border bg-card p-6 sm:p-8"
            onSubmit={async (event) => {
              event.preventDefault()
              const formData = new FormData(event.currentTarget)
              const values = Object.fromEntries(formData.entries())
              setIsSubmitting(true)

              try {
                const result = await login({
                  data:
                    role === "applicant"
                      ? {
                          role,
                          mobileNumber: String(values.mobileNumber),
                          otp: String(values.otp),
                        }
                      : {
                          role,
                          username: String(values.username),
                          password: String(values.password),
                        },
                })

                if (!result.ok) {
                  setError(result.message)
                  return
                }

                setError(undefined)
                startMockSession(role)
                await navigate({ to: isApplicant ? destination : "/operator" })
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
              {content.fields.map((field) => (
                <div key={field.name}>
                  <label
                    className="mb-2 block text-sm font-medium"
                    htmlFor={`${role}-${field.name}`}
                  >
                    {field.label}
                  </label>
                  <input
                    autoComplete={field.autoComplete}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                    defaultValue={field.defaultValue}
                    id={`${role}-${field.name}`}
                    name={field.name}
                    required
                    type={field.type}
                  />
                </div>
              ))}
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
              {isSubmitting ? "Signing in..." : content.submitLabel}
            </Button>
          </form>
        )}
      </main>

      <SiteFooter title="DigiLicense">
        <p>
          {isApplicant
            ? "This sign-in is simulated. DigiLicense does not connect to a government identity, licence, or OTP system."
            : "This operator sign-in is simulated and does not connect to a government or staff identity system."}
        </p>
      </SiteFooter>
    </div>
  )
}

export { MockLoginPage }
