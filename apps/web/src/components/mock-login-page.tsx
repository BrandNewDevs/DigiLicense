import { ArrowLeft, BadgeCheck } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"

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

const inputClassName =
  "h-12 w-full rounded-xl border border-[#d96b16]/30 bg-white px-4 text-base text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:border-[#d96b16] focus:ring-2 focus:ring-[#d96b16]/20"

function MockLoginPage({ returnTo }: MockLoginPageProps) {
  const navigate = useNavigate()
  const isSignedIn = useMockSession("applicant")
  const login = useServerFn(loginDemoSession)
  const logout = useServerFn(logoutDemoSession)
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [otp, setOtp] = useState<string>(mockCredentials.applicant.otp)
  const destination =
    returnTo === "/" || returnTo?.startsWith("/services")
      ? returnTo
      : "/services"

  return (
    <main
      className="flex min-h-svh items-center justify-center px-5 py-10 text-foreground"
      id="main-content"
    >
      <section
        aria-label="Applicant sign in"
        className="w-full max-w-md rounded-3xl border border-[#d96b16]/20 bg-card p-6 shadow-xl shadow-[#d96b16]/10 sm:p-9"
      >
        <Link
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          to={destination}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
        <h1 className="sr-only">Applicant sign in</h1>

        {isSignedIn ? (
          <section className="mt-6 rounded-2xl border border-[#d96b16]/25 bg-[#fff8f0] p-5">
            <BadgeCheck className="size-8 text-[#d96b16]" aria-hidden="true" />
            <h2 className="mt-4 font-heading text-xl font-semibold tracking-[-0.03em]">
              You are signed in
            </h2>
            <p className="mt-2 leading-6 text-muted-foreground">
              Protected services are unlocked in this browser.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-[#d96b16] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#b9550d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d96b16]"
                to={destination}
              >
                Continue
              </Link>
              <Button
                className="h-11 flex-1 rounded-xl border-[#d96b16]/30 bg-white px-5 text-sm hover:bg-[#fff3e6]"
                onClick={async () => {
                  await logout({ data: { role: "applicant" } })
                  endMockSession("applicant")
                }}
                type="button"
                variant="outline"
              >
                Sign out
              </Button>
            </div>
          </section>
        ) : (
          <form
            className="mt-6 space-y-6"
            onSubmit={async (event) => {
              event.preventDefault()
              const formData = new FormData(event.currentTarget)
              setIsSubmitting(true)

              try {
                const result = await login({
                  data: {
                    role: "applicant",
                    mobileNumber: String(formData.get("mobileNumber")),
                    otp,
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
                  "Sign in is unavailable. Check the server configuration."
                )
              } finally {
                setIsSubmitting(false)
              }
            }}
          >
            <div>
              <label
                className="mb-2 block text-base font-semibold"
                htmlFor="applicant-mobileNumber"
              >
                Mobile number
              </label>
              <input
                autoComplete="off"
                className={inputClassName}
                defaultValue={mockCredentials.applicant.mobileNumber}
                id="applicant-mobileNumber"
                name="mobileNumber"
                required
                type="text"
              />
            </div>

            <div>
              <label
                className="mb-2 block text-base font-semibold"
                htmlFor="applicant-otp"
              >
                One-time passcode
              </label>
              <InputOTP
                autoComplete="one-time-code"
                aria-invalid={Boolean(error)}
                containerClassName="w-full justify-center"
                id="applicant-otp"
                inputMode="numeric"
                maxLength={6}
                onChange={(value) => {
                  setOtp(value)
                  setError(undefined)
                }}
                value={otp}
              >
                <InputOTPGroup>
                  <InputOTPSlot
                    className="size-10 text-base font-semibold sm:size-12 sm:text-lg"
                    index={0}
                  />
                  <InputOTPSlot
                    className="size-10 text-base font-semibold sm:size-12 sm:text-lg"
                    index={1}
                  />
                  <InputOTPSlot
                    className="size-10 text-base font-semibold sm:size-12 sm:text-lg"
                    index={2}
                  />
                  <InputOTPSlot
                    className="size-10 text-base font-semibold sm:size-12 sm:text-lg"
                    index={3}
                  />
                  <InputOTPSlot
                    className="size-10 text-base font-semibold sm:size-12 sm:text-lg"
                    index={4}
                  />
                  <InputOTPSlot
                    className="size-10 text-base font-semibold sm:size-12 sm:text-lg"
                    index={5}
                  />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error ? (
              <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              className="h-12 w-full rounded-xl bg-[#d96b16] text-base font-semibold text-white hover:bg-[#b9550d]"
              disabled={isSubmitting}
              type="submit"
              variant="solid"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        )}

        <p className="mt-8 border-t border-[#d96b16]/15 pt-5 text-center text-sm leading-6 text-muted-foreground">
          This service never contacts government systems. Use the displayed details only.
        </p>
      </section>
    </main>
  )
}

export { MockLoginPage }
