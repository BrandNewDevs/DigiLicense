import { Link, useNavigate } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { X } from "lucide-react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"

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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-labelledby="applicant-sign-in-title">
        <DialogClose
          aria-label="Close sign in"
          className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X aria-hidden="true" className="size-5" />
        </DialogClose>

        <DialogHeader className="pr-10">
          <DialogTitle id="applicant-sign-in-title">Sign in</DialogTitle>
          <DialogDescription>
            Enter the displayed mobile number and passcode to continue your
            licence journey.
          </DialogDescription>
        </DialogHeader>

        {isSignedIn ? (
          <section className="mt-7 rounded-lg bg-muted p-5">
            <h2 className="text-xl font-semibold">You are signed in</h2>
            <p className="mt-2 leading-6 text-muted-foreground">
              Your applicant services are available in this browser.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                to={destination}
              >
                Continue
              </Link>
              <Button
                className="h-11 flex-1 rounded-lg px-4 text-sm"
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
                className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <Button
              className="h-11 w-full rounded-lg text-base"
              disabled={isSubmitting}
              type="submit"
              variant="solid"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        )}

        <p className="mt-7 rounded-lg bg-muted px-4 py-3 text-sm leading-5 text-muted-foreground">
          This service never contacts government systems. Use the displayed
          details only.
        </p>
      </DialogContent>
    </Dialog>
  )
}

export { MockLoginPage }
