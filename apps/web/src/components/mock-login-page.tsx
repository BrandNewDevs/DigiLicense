import { Link, useNavigate } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { X } from "lucide-react"
import { Dialog } from "@base-ui/react/dialog"
import { useState } from "react"

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
  onOpenChange: (open: boolean) => void
  open: boolean
  returnTo?: string
}

const inputClassName =
  "h-13 w-full rounded-2xl border border-black/15 bg-white px-4 text-lg text-foreground outline-none placeholder:text-muted-foreground focus:border-black/30 focus:ring-2 focus:ring-black/15"

function MockLoginPage({ onOpenChange, open, returnTo }: MockLoginPageProps) {
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
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
          <Dialog.Popup
            aria-labelledby="applicant-sign-in-title"
            className="relative my-auto w-full max-w-[30rem] rounded-[2rem] border border-black/10 bg-white p-5 shadow-2xl shadow-black/20 transition-[opacity,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:p-8"
          >
            <Dialog.Close
              aria-label="Close sign in"
              className="absolute top-4 right-4 inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>

            <header className="pr-10">
              <h1
                className="font-heading text-3xl leading-9 font-semibold tracking-[-0.04em] sm:text-4xl sm:leading-11"
                id="applicant-sign-in-title"
              >
                Sign in to{" "}
                <span className="text-[#d96b16] italic">continue.</span>
              </h1>
              <p className="mt-3 text-base leading-6 text-muted-foreground">
                Enter the displayed mobile number and passcode to continue your
                licence journey.
              </p>
            </header>

            {isSignedIn ? (
              <section className="mt-7 rounded-2xl bg-[#fff3e6] p-5">
                <h2 className="font-heading text-2xl font-semibold tracking-[-0.03em]">
                  You are signed in
                </h2>
                <p className="mt-2 leading-6 text-muted-foreground">
                  Your applicant services are available in this browser.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link
                    className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-black px-5 text-sm font-semibold text-white transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                    to={destination}
                  >
                    Continue
                  </Link>
                  <Button
                    className="h-12 flex-1 rounded-full border-black/15 bg-white px-5 text-sm hover:bg-black/5"
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
                className="mt-7 space-y-6"
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
                    onOpenChange(false)
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
                    className="mb-2 block text-sm font-semibold"
                    htmlFor="applicant-mobileNumber"
                  >
                    Mobile number
                  </label>
                  <input
                    autoComplete="off"
                    className={inputClassName}
                    defaultValue={mockCredentials.applicant.mobileNumber}
                    id="applicant-mobileNumber"
                    inputMode="numeric"
                    name="mobileNumber"
                    required
                    type="tel"
                  />
                </div>

                <div>
                  <label
                    className="mb-2 block text-sm font-semibold"
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
                      {[0, 1, 2, 3, 4, 5].map((index) => (
                        <InputOTPSlot
                          className="size-11 text-lg font-semibold sm:size-12"
                          index={index}
                          key={index}
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                {error ? (
                  <p
                    className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}

                <Button
                  className="h-13 w-full rounded-full bg-black text-base font-semibold text-white hover:bg-black/80"
                  disabled={isSubmitting}
                  type="submit"
                  variant="solid"
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            )}

            <p className="mt-7 rounded-2xl bg-black/5 px-4 py-3 text-sm leading-5 text-muted-foreground">
              This service never contacts government systems. Use the displayed
              details only.
            </p>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { MockLoginPage }
