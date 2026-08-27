import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { scheduleMobileUpdateExpiry } from "../lib/mobile-update-expiry"
import type {
  MobileUpdateReadResult,
  MobileUpdateStartResult,
  MobileUpdateVerificationResult,
} from "../server/mobile-update.server"
import {
  completeMockAadhaarVerification,
  readMobileUpdateState,
  startMobileUpdate,
  verifyMobileUpdateOtp,
} from "../server-functions/mobile-update"

type ActiveRequest = Extract<
  MobileUpdateReadResult,
  { kind: "ready" }
>["activeRequest"]

type Phase =
  | "aadhaar"
  | "completed"
  | "loading"
  | "otp"
  | "ready"
  | "unavailable"

const inputClassName =
  "h-11 w-full rounded-lg border border-input px-3 text-base sm:max-w-sm"

function createIdempotencyKey(): string | null {
  if (typeof crypto === "undefined") return null

  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function getExpiryLabel(expiresAt: string): string {
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return "soon"

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function MobileUpdateFlow() {
  const loadState = useServerFn(readMobileUpdateState)
  const startUpdate = useServerFn(startMobileUpdate)
  const verifyOtp = useServerFn(verifyMobileUpdateOtp)
  const completeAadhaar = useServerFn(completeMockAadhaarVerification)

  const [phase, setPhase] = useState<Phase>("loading")
  const [activeRequest, setActiveRequest] = useState<ActiveRequest>(null)
  const [currentMobileLastFour, setCurrentMobileLastFour] = useState("")
  const [targetMobileNumber, setTargetMobileNumber] = useState("9000000004")
  const [method, setMethod] = useState<"MOCK_AADHAAR" | "OTP">("OTP")
  const [issuedOtp, setIssuedOtp] = useState("")
  const [otp, setOtp] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await loadState()
        if (cancelled) return

        if (result.kind !== "ready") {
          setMessage(result.message)
          setPhase("unavailable")
          return
        }

        setCurrentMobileLastFour(result.currentMobileLastFour)
        setActiveRequest(result.activeRequest)
        if (result.activeRequest?.method === "OTP") {
          setMessage(
            "Your verification is still open. Request a new one-time code to continue."
          )
          setPhase("ready")
        } else {
          setPhase(
            result.activeRequest?.method === "MOCK_AADHAAR"
              ? "aadhaar"
              : "ready"
          )
        }
      } catch {
        if (!cancelled) {
          setMessage(
            "Mobile update is temporarily unavailable. Try again shortly."
          )
          setPhase("unavailable")
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [loadState])

  useEffect(() => {
    if (phase === "completed" || phase === "unavailable")
      headingRef.current?.focus()
  }, [phase])

  useEffect(() => {
    if (!activeRequest) return

    return scheduleMobileUpdateExpiry(activeRequest.expiresAt, () => {
      setActiveRequest(null)
      setOtp("")
      setMessage("This verification request has expired. Start a new one.")
      setPhase("ready")
    })
  }, [activeRequest])

  function setRequestFromStart(
    result: Extract<MobileUpdateStartResult, { kind: "started" }>
  ) {
    setIssuedOtp(result.syntheticOtp ?? "")
    const request = {
      expiresAt: result.expiresAt,
      id: result.requestId,
      method: result.nextStep === "OTP_REQUIRED" ? "OTP" : "MOCK_AADHAAR",
      targetMobileLastFour: result.targetMobileLastFour,
    } as const
    setActiveRequest(request)
    setMessage("")
    setPhase(request.method === "OTP" ? "otp" : "aadhaar")
  }

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const idempotencyKey = createIdempotencyKey()

    if (!idempotencyKey) {
      setMessage(
        "This browser cannot start the secure prototype workflow. Update your browser and try again."
      )
      return
    }

    setIsSubmitting(true)
    setMessage("")
    try {
      const result = await startUpdate({
        data: { idempotencyKey, method, targetMobileNumber },
      })
      if (result.kind === "started") {
        setRequestFromStart(result)
      } else {
        setMessage(result.message)
      }
    } catch {
      setMessage("Mobile update is temporarily unavailable. Try again shortly.")
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleVerificationResult(result: MobileUpdateVerificationResult) {
    if (result.kind === "completed") {
      setCurrentMobileLastFour(result.mobileLastFour)
      setActiveRequest(null)
      setMessage(
        "Your synthetic mobile number was updated. Your sign-in was refreshed."
      )
      setPhase("completed")
      return
    }

    setMessage(result.message)
    if (
      result.kind === "request-expired" ||
      result.kind === "otp-locked" ||
      result.kind === "aadhaar-failed"
    ) {
      setActiveRequest(null)
      setPhase("ready")
    }
  }

  async function handleOtpVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeRequest) return

    const idempotencyKey = createIdempotencyKey()
    if (!idempotencyKey) {
      setMessage(
        "This browser cannot verify the secure prototype workflow. Update your browser and try again."
      )
      return
    }

    setIsSubmitting(true)
    setMessage("")
    try {
      handleVerificationResult(
        await verifyOtp({
          data: { idempotencyKey, otp, requestId: activeRequest.id },
        })
      )
    } catch {
      setMessage(
        "OTP verification is temporarily unavailable. Try again shortly."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAadhaarVerification(
    mockAssertion: "MOCK_AADHAAR_FAIL" | "MOCK_AADHAAR_PASS"
  ) {
    if (!activeRequest) return

    const idempotencyKey = createIdempotencyKey()
    if (!idempotencyKey) {
      setMessage(
        "This browser cannot complete the secure prototype workflow. Update your browser and try again."
      )
      return
    }

    setIsSubmitting(true)
    setMessage("")
    try {
      handleVerificationResult(
        await completeAadhaar({
          data: { idempotencyKey, mockAssertion, requestId: activeRequest.id },
        })
      )
    } catch {
      setMessage(
        "Mock Aadhaar verification is temporarily unavailable. Try again shortly."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (phase === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label="Loading mobile-update request"
        className="rounded-lg border bg-card p-6"
      >
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-4 h-4 w-full max-w-lg" />
        <Skeleton className="mt-8 h-11 w-full max-w-md" />
      </section>
    )
  }

  if (phase === "unavailable") {
    return (
      <section
        aria-live="polite"
        className="rounded-xl border border-border p-6"
      >
        <h2
          className="font-sans text-2xl font-medium"
          ref={headingRef}
          tabIndex={-1}
        >
          Mobile update unavailable
        </h2>
        <p className="mt-3 text-muted-foreground">{message}</p>
      </section>
    )
  }

  if (phase === "completed") {
    return (
      <section
        aria-live="polite"
        className="rounded-xl border border-border p-6"
      >
        <h2
          className="font-sans text-2xl font-medium"
          ref={headingRef}
          tabIndex={-1}
        >
          Mobile number updated
        </h2>
        <p className="mt-3 text-muted-foreground">
          {message} The current synthetic number ends in {currentMobileLastFour}
          .
        </p>
        <Button
          className="mt-6"
          onClick={() => {
            setMessage("")
            setPhase("ready")
          }}
          type="button"
        >
          Update another number
        </Button>
      </section>
    )
  }

  if (phase === "otp" && activeRequest) {
    return (
      <form
        className="rounded-xl border border-border p-6"
        onSubmit={handleOtpVerification}
      >
        <p className="text-sm text-muted-foreground">
          Synthetic OTP verification
        </p>
        <h2 className="mt-2 font-sans text-2xl font-medium">
          Confirm the number ending in {activeRequest.targetMobileLastFour}
        </h2>
        <p className="mt-3 text-muted-foreground">
          No SMS is sent. DigiLicense generated this one-time code for this
          request: <strong>{issuedOtp}</strong>. This request expires at{" "}
          {getExpiryLabel(activeRequest.expiresAt)}.
        </p>
        <label
          className="mt-6 block text-sm font-medium"
          htmlFor="mobile-update-otp"
        >
          Synthetic OTP
        </label>
        <input
          autoComplete="one-time-code"
          className={`${inputClassName} mt-2`}
          id="mobile-update-otp"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) => setOtp(event.target.value)}
          pattern="[0-9]{6}"
          required
          value={otp}
        />
        <p aria-live="polite" className="mt-4 text-sm text-destructive">
          {message}
        </p>
        <Button className="mt-5" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Verifying…" : "Verify OTP"}
        </Button>
      </form>
    )
  }

  if (phase === "aadhaar" && activeRequest) {
    return (
      <section
        aria-live="polite"
        className="rounded-xl border border-border p-6"
      >
        <p className="text-sm text-muted-foreground">
          Mock Aadhaar verification
        </p>
        <h2 className="mt-2 font-sans text-2xl font-medium">
          Confirm the number ending in {activeRequest.targetMobileLastFour}
        </h2>
        <p className="mt-3 text-muted-foreground">
          This is a simulation. Do not enter an Aadhaar number, biometric, or
          any real identity information. The request expires at{" "}
          {getExpiryLabel(activeRequest.expiresAt)}.
        </p>
        <p aria-live="polite" className="mt-4 text-sm text-destructive">
          {message}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            disabled={isSubmitting}
            onClick={() => void handleAadhaarVerification("MOCK_AADHAAR_PASS")}
            type="button"
          >
            {isSubmitting ? "Verifying…" : "Pass mock verification"}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={() => void handleAadhaarVerification("MOCK_AADHAAR_FAIL")}
            type="button"
            variant="outline"
          >
            Simulate failure
          </Button>
        </div>
      </section>
    )
  }

  return (
    <form
      className="rounded-xl border border-border p-6"
      onSubmit={handleStart}
    >
      <p className="text-sm text-muted-foreground">Synthetic contact update</p>
      <h2 className="mt-2 font-sans text-2xl font-medium">
        Update your mobile number
      </h2>
      <p className="mt-3 text-muted-foreground">
        Current synthetic number ends in {currentMobileLastFour}. Do not enter a
        real mobile number or Aadhaar information.
      </p>
      <label
        className="mt-6 block text-sm font-medium"
        htmlFor="target-mobile-number"
      >
        New synthetic mobile number
      </label>
      <input
        className={`${inputClassName} mt-2`}
        id="target-mobile-number"
        inputMode="numeric"
        maxLength={10}
        onChange={(event) => setTargetMobileNumber(event.target.value)}
        pattern="90000000[0-9]{2}"
        required
        value={targetMobileNumber}
      />
      <p className="mt-2 text-sm text-muted-foreground">
        Use the reserved prototype range: 90000000xx.
      </p>
      <label
        className="mt-5 block text-sm font-medium"
        htmlFor="verification-method"
      >
        Verification method
      </label>
      <select
        className={`${inputClassName} mt-2`}
        id="verification-method"
        onChange={(event) =>
          setMethod(event.target.value as "MOCK_AADHAAR" | "OTP")
        }
        value={method}
      >
        <option value="OTP">Synthetic OTP</option>
        <option value="MOCK_AADHAAR">Mock Aadhaar verification</option>
      </select>
      <p aria-live="polite" className="mt-4 text-sm text-destructive">
        {message}
      </p>
      <Button className="mt-5" disabled={isSubmitting} type="submit">
        {isSubmitting
          ? "Starting…"
          : activeRequest?.method === "OTP"
            ? "Get a new one-time code"
            : "Start verification"}
      </Button>
    </form>
  )
}

export { MobileUpdateFlow }
