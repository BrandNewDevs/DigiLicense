import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { FileText, MapPin, ShieldCheck } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import {
  addressChangeLocalityValues,
  mockAddressProofLabels,
  mockAddressProofValues,
} from "../lib/address-change"
import type {
  AddressChangeReadResult,
  AddressChangeStartOtpResult,
  AddressChangeSubmitResult,
  AddressChangeVerifyOtpResult,
} from "../server/address-change.server"
import {
  readAddressChangeState,
  saveAddressChangeDraft,
  startAddressChangeOtp,
  submitAddressChangeApplication,
  verifyAddressChangeOtp,
} from "../server-functions/address-change"

type Locality = (typeof addressChangeLocalityValues)[number]
type ProofType = (typeof mockAddressProofValues)[number]

type FormValues = {
  addressLine1: string
  addressLine2: string
  locality: "" | Locality
  pincode: string
  proofType: "" | ProofType
}

type Verification = NonNullable<
  Extract<AddressChangeReadResult, { kind: "ready" }>["activeVerification"]
>

type Phase =
  | "active"
  | "authentication-required"
  | "form"
  | "loading"
  | "otp"
  | "ready"
  | "submitted"
  | "unavailable"

const emptyValues: FormValues = {
  addressLine1: "",
  addressLine2: "",
  locality: "",
  pincode: "",
  proofType: "",
}

const inputClassName =
  "h-11 w-full rounded-lg border border-input px-3 text-base"

function createIdempotencyKey(): string | null {
  if (typeof crypto === "undefined") return null
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null
}

function formatDate(isoDateTime: string): string {
  const date = new Date(isoDateTime)
  if (Number.isNaN(date.getTime())) return "soon"
  return date.toLocaleString("en-IN", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  })
}

function AddressChangeFlow() {
  const loadState = useServerFn(readAddressChangeState)
  const startOtp = useServerFn(startAddressChangeOtp)
  const verifyOtp = useServerFn(verifyAddressChangeOtp)
  const saveDraft = useServerFn(saveAddressChangeDraft)
  const submitApplication = useServerFn(submitAddressChangeApplication)

  const [phase, setPhase] = useState<Phase>("loading")
  const [licences, setLicences] = useState<
    Extract<AddressChangeReadResult, { kind: "ready" }>["licences"]
  >([])
  const [licenceRecordId, setLicenceRecordId] = useState("")
  const [currentMobileLastFour, setCurrentMobileLastFour] = useState("")
  const [verification, setVerification] = useState<Verification | null>(null)
  const [otp, setOtp] = useState("")
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [declarationAccepted, setDeclarationAccepted] = useState(false)
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savedAt, setSavedAt] = useState("")
  const [applicationNumber, setApplicationNumber] = useState("")
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await loadState()
        if (cancelled) return
        if (result.kind !== "ready") {
          setMessage(result.message)
          setPhase(
            result.kind === "authentication-required"
              ? result.kind
              : "unavailable"
          )
          return
        }

        setLicences(result.licences)
        const firstLicence = result.licences.at(0)
        setLicenceRecordId(
          result.activeVerification?.licenceRecordId ?? firstLicence?.id ?? ""
        )
        setCurrentMobileLastFour(result.currentMobileLastFour)
        setValues((current) => ({ ...current, ...result.draft?.payload }))
        setVerification(result.activeVerification)

        if (result.activeApplication) {
          setApplicationNumber(result.activeApplication.applicationNumber)
          setMessage(result.activeApplication.nextAction)
          setPhase("active")
        } else if (result.activeVerification?.status === "OTP_VERIFIED") {
          setPhase("form")
        } else if (result.activeVerification) {
          setPhase("otp")
        } else {
          setPhase("ready")
        }
      } catch {
        if (!cancelled) {
          setMessage(
            "Address change is temporarily unavailable. Try again shortly."
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
    if (
      phase === "active" ||
      phase === "submitted" ||
      phase === "unavailable"
    ) {
      headingRef.current?.focus()
    }
  }, [phase])

  function showResult(
    result:
      | Exclude<AddressChangeStartOtpResult, { kind: "started" }>
      | Exclude<AddressChangeVerifyOtpResult, { kind: "verified" }>
      | Exclude<AddressChangeSubmitResult, { kind: "submitted" }>
  ) {
    setMessage(result.message)
    if (result.kind === "authentication-required")
      setPhase("authentication-required")
    if (
      result.kind === "verification-expired" ||
      result.kind === "verification-cancelled" ||
      result.kind === "verification-consumed" ||
      result.kind === "verification-not-found" ||
      result.kind === "otp-locked"
    ) {
      setVerification(null)
      setOtp("")
      setPhase("ready")
    }
  }

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const idempotencyKey = createIdempotencyKey()
    if (!idempotencyKey || !licenceRecordId) {
      setMessage("Choose a licence record before starting verification.")
      return
    }

    setIsSubmitting(true)
    setMessage("")
    try {
      const result = await startOtp({
        data: { idempotencyKey, licenceRecordId },
      })
      if (result.kind === "started") {
        setCurrentMobileLastFour(result.currentMobileLastFour)
        setVerification({
          expiresAt: result.expiresAt,
          id: result.verificationId,
          licenceRecordId,
          status: "OTP_PENDING",
        })
        setPhase("otp")
      } else {
        showResult(result)
      }
    } catch {
      setMessage(
        "Address verification is temporarily unavailable. Try again shortly."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const idempotencyKey = createIdempotencyKey()
    if (!idempotencyKey || !verification) return

    setIsSubmitting(true)
    setMessage("")
    try {
      const result = await verifyOtp({
        data: { idempotencyKey, otp, verificationId: verification.id },
      })
      if (result.kind === "verified") {
        setVerification((current) =>
          current
            ? {
                ...current,
                expiresAt: result.expiresAt,
                licenceRecordId: result.licenceRecordId,
                status: "OTP_VERIFIED",
              }
            : null
        )
        setPhase("form")
      } else {
        showResult(result)
      }
    } catch {
      setMessage(
        "OTP verification is temporarily unavailable. Try again shortly."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function payload() {
    return {
      addressLine1: values.addressLine1.trim(),
      ...(values.addressLine2.trim()
        ? { addressLine2: values.addressLine2.trim() }
        : {}),
      locality: values.locality,
      pincode: values.pincode.trim(),
      proofType: values.proofType,
    }
  }

  async function handleSaveDraft() {
    if (!verification) return
    setIsSubmitting(true)
    setMessage("")
    try {
      const result = await saveDraft({
        data: { payload: payload(), verificationId: verification.id },
      })
      if (result.kind === "saved") {
        setSavedAt(result.savedAt)
      } else {
        showResult(result)
      }
    } catch {
      setMessage("The draft could not be saved right now.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const idempotencyKey = createIdempotencyKey()
    if (!verification || !idempotencyKey) return
    if (!declarationAccepted) {
      setMessage("Accept the declaration before submitting.")
      return
    }

    setIsSubmitting(true)
    setMessage("")
    try {
      const result = await submitApplication({
        data: {
          declarationAccepted: true,
          idempotencyKey,
          verificationId: verification.id,
          ...payload(),
        },
      })
      if (result.kind === "submitted") {
        setApplicationNumber(result.applicationNumber)
        setPhase("submitted")
      } else {
        showResult(result)
      }
    } catch {
      setMessage(
        "The address-change application could not be submitted. Try again shortly."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (phase === "loading") {
    return (
      <p
        className="rounded-3xl border border-border p-6 text-muted-foreground"
        role="status"
      >
        Loading your address-change request...
      </p>
    )
  }

  if (phase === "authentication-required") {
    return (
      <section className="rounded-3xl border border-border p-6 sm:p-8">
        <h2
          className="font-heading text-2xl font-medium"
          ref={headingRef}
          tabIndex={-1}
        >
          Sign in required
        </h2>
        <p className="mt-3 text-muted-foreground">{message}</p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-foreground px-5 font-medium"
          search={{ returnTo: "/services/change-address" }}
          to="/applicant/login"
        >
          Go to sign in
        </Link>
      </section>
    )
  }

  if (phase === "unavailable") {
    return (
      <section className="rounded-3xl border border-border p-6 sm:p-8">
        <h2
          className="font-heading text-2xl font-medium"
          ref={headingRef}
          tabIndex={-1}
        >
          Address change unavailable
        </h2>
        <p className="mt-3 text-muted-foreground">{message}</p>
      </section>
    )
  }

  if (phase === "active" || phase === "submitted") {
    const submitted = phase === "submitted"
    return (
      <section
        aria-live="polite"
        className="rounded-3xl border border-border p-6 sm:p-8"
      >
        <p className="text-sm font-medium text-muted-foreground">
          {submitted ? "Submission complete" : "Application in progress"}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <FileText aria-hidden="true" className="size-6 text-[#d96b16]" />
          <h2
            className="font-heading text-2xl font-medium"
            ref={headingRef}
            tabIndex={-1}
          >
            {submitted
              ? "Address-change application received"
              : "You already have an address-change application"}
          </h2>
        </div>
        <dl className="mt-6 rounded-2xl border border-border p-5">
          <dt className="text-sm text-muted-foreground">Reference number</dt>
          <dd className="mt-1 font-mono text-lg font-medium">
            {applicationNumber}
          </dd>
          <dt className="mt-5 text-sm text-muted-foreground">Next action</dt>
          <dd className="mt-1">
            {submitted
              ? "Wait for DigiLicense to review the address proof."
              : message}
          </dd>
        </dl>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          This record is held by DigiLicense only. No government service or real
          document was contacted.
        </p>
      </section>
    )
  }

  if (phase === "otp" && verification) {
    return (
      <form
        className="rounded-3xl border border-border p-6 sm:p-8"
        onSubmit={handleVerify}
      >
        <p className="text-sm font-medium text-muted-foreground">
          Mobile verification
        </p>
        <h2 className="mt-2 font-heading text-2xl font-medium">
          Confirm the mobile number ending in {currentMobileLastFour}
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          No SMS is sent. Enter the configured six-digit OTP. This request
          expires {formatDate(verification.expiresAt)}.
        </p>
        <label
          className="mt-6 block text-sm font-medium"
          htmlFor="address-change-otp"
        >
          OTP
        </label>
        <input
          autoComplete="one-time-code"
          className={`${inputClassName} mt-2 sm:max-w-sm`}
          id="address-change-otp"
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
          {isSubmitting ? "Verifying..." : "Verify OTP"}
        </Button>
      </form>
    )
  }

  if (phase === "ready") {
    return (
      <form
        className="rounded-3xl border border-border p-6 sm:p-8"
        onSubmit={handleStart}
      >
        <p className="text-sm font-medium text-muted-foreground">
          Address verification
        </p>
        <div className="mt-2 flex items-center gap-3">
          <ShieldCheck aria-hidden="true" className="size-6 text-[#d96b16]" />
          <h2 className="font-heading text-2xl font-medium">
            Verify before changing an address
          </h2>
        </div>
        <p className="mt-3 leading-7 text-muted-foreground">
          We verify the current mobile number ending in {currentMobileLastFour}.
          No message is sent to a real phone.
        </p>
        <label
          className="mt-6 block text-sm font-medium"
          htmlFor="address-change-licence"
        >
          Licence record
        </label>
        <select
          className={`${inputClassName} mt-2`}
          id="address-change-licence"
          onChange={(event) => setLicenceRecordId(event.target.value)}
          required
          value={licenceRecordId}
        >
          {licences.map((licence) => (
            <option key={licence.id} value={licence.id}>
              {licence.licenceNumber}
            </option>
          ))}
        </select>
        <p aria-live="polite" className="mt-4 text-sm text-destructive">
          {message}
        </p>
        <Button
          className="mt-5"
          disabled={isSubmitting || licences.length === 0}
          type="submit"
        >
          {isSubmitting ? "Starting..." : "Start verification"}
        </Button>
      </form>
    )
  }

  return (
    <form
      className="rounded-3xl border border-border p-6 sm:p-8"
      onSubmit={handleSubmit}
    >
      <p className="text-sm font-medium text-muted-foreground">
        Address details
      </p>
      <div className="mt-2 flex items-center gap-3">
        <MapPin aria-hidden="true" className="size-6 text-[#d96b16]" />
        <h2 className="font-heading text-2xl font-medium">
          Enter the new Delhi address
        </h2>
      </div>
      <p className="mt-3 leading-7 text-muted-foreground">
        Use the details provided for this DigiLicense journey only. Saving keeps
        a verified request.
      </p>
      <div className="mt-7 space-y-5">
        <div>
          <label
            className="mb-2 block text-sm font-medium"
            htmlFor="address-line-1"
          >
            Address line 1
          </label>
          <input
            className={inputClassName}
            id="address-line-1"
            maxLength={120}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                addressLine1: event.target.value,
              }))
            }
            required
            value={values.addressLine1}
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-medium"
            htmlFor="address-line-2"
          >
            Address line 2, optional
          </label>
          <input
            className={inputClassName}
            id="address-line-2"
            maxLength={120}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                addressLine2: event.target.value,
              }))
            }
            value={values.addressLine2}
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-medium"
            htmlFor="address-locality"
          >
            Locality
          </label>
          <select
            className={inputClassName}
            id="address-locality"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                locality: event.target.value as FormValues["locality"],
              }))
            }
            required
            value={values.locality}
          >
            <option value="">Select a locality</option>
            {addressChangeLocalityValues.map((locality) => (
              <option key={locality} value={locality}>
                {locality.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-medium"
            htmlFor="address-pincode"
          >
            Delhi PIN code
          </label>
          <input
            className={inputClassName}
            id="address-pincode"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                pincode: event.target.value,
              }))
            }
            pattern="110[0-9]{3}"
            required
            value={values.pincode}
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-medium"
            htmlFor="address-proof"
          >
            Address proof
          </label>
          <select
            className={inputClassName}
            id="address-proof"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                proofType: event.target.value as FormValues["proofType"],
              }))
            }
            required
            value={values.proofType}
          >
            <option value="">Select a proof</option>
            {mockAddressProofValues.map((proof) => (
              <option key={proof} value={proof}>
                {mockAddressProofLabels[proof]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="mt-6 flex items-start gap-3 rounded-xl border border-border p-4">
        <input
          checked={declarationAccepted}
          className="mt-1 size-5"
          onChange={(event) => setDeclarationAccepted(event.target.checked)}
          type="checkbox"
        />
        <span className="leading-6">
          I confirm these details are for this request. DigiLicense records the
          application only and does not contact a government service.
        </span>
      </label>
      {savedAt ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Draft saved {formatDate(savedAt)}.
        </p>
      ) : null}
      <p aria-live="polite" className="mt-4 text-sm text-destructive">
        {message}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          className="h-11 flex-1"
          disabled={isSubmitting || !declarationAccepted}
          type="submit"
        >
          {isSubmitting ? "Submitting..." : "Submit application"}
        </Button>
        <Button
          className="h-11"
          disabled={isSubmitting}
          onClick={() => void handleSaveDraft()}
          type="button"
          variant="outline"
        >
          Save draft
        </Button>
      </div>
    </form>
  )
}

export { AddressChangeFlow }
