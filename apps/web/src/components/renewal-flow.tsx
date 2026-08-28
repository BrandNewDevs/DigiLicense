import { useEffect, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import type { RenewalReadResult } from "../server/renewal.server"
import {
  readApplicationPayment,
  resolveApplicationPayment,
  startApplicationPayment,
} from "../server-functions/payment"
import {
  readRenewalState,
  submitRenewalApplication,
} from "../server-functions/renewal"

type ReadyState = Extract<RenewalReadResult, { kind: "ready" }>
type Reason = "EXPIRING_SOON" | "RECENTLY_EXPIRED"
type Phase = "active" | "form" | "loading" | "payment" | "unavailable"

function createIdempotencyKey(): string | null {
  if (
    typeof crypto === "undefined" ||
    typeof crypto.randomUUID !== "function"
  ) {
    return null
  }
  return crypto.randomUUID()
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatAmount(amountPaise: number): string {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amountPaise / 100)
}

function RenewalFlow() {
  const loadState = useServerFn(readRenewalState)
  const submitRenewal = useServerFn(submitRenewalApplication)
  const readPayment = useServerFn(readApplicationPayment)
  const startPayment = useServerFn(startApplicationPayment)
  const resolvePayment = useServerFn(resolveApplicationPayment)
  const [phase, setPhase] = useState<Phase>("loading")
  const [state, setState] = useState<ReadyState | null>(null)
  const [licenceRecordId, setLicenceRecordId] = useState("")
  const [reason, setReason] = useState<Reason>("EXPIRING_SOON")
  const [applicationNumber, setApplicationNumber] = useState("")
  const [payment, setPayment] =
    useState<
      Extract<
        Awaited<ReturnType<typeof readApplicationPayment>>,
        { kind: "found" }
      >["payment"]
    >(null)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

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
        setState(result)
        setLicenceRecordId(
          result.licences.length > 0 ? result.licences[0].id : ""
        )
        if (result.activeApplication) {
          setApplicationNumber(result.activeApplication.applicationNumber)
          setMessage(result.activeApplication.nextAction)
          setPhase("active")
        } else {
          setPhase("form")
        }
      } catch {
        if (!cancelled) {
          setMessage(
            "Licence renewal is temporarily unavailable. Try again shortly."
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

  async function openPayment(reference: string) {
    setSubmitting(true)
    try {
      const result = await readPayment({
        data: { applicationNumber: reference },
      })
      if (result.kind === "found") {
        setPayment(result.payment)
        setPhase("payment")
      } else {
        setMessage(result.message)
        setPhase("unavailable")
      }
    } catch {
      setMessage(
        "Payment service is temporarily unavailable. Try again shortly."
      )
      setPhase("unavailable")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const idempotencyKey = createIdempotencyKey()
    if (!idempotencyKey || !licenceRecordId) {
      setMessage(
        "Choose a licence record and use a browser that supports secure requests."
      )
      return
    }
    setSubmitting(true)
    setMessage("")
    try {
      const result = await submitRenewal({
        data: {
          declarationAccepted: true,
          idempotencyKey,
          licenceRecordId,
          reason,
        },
      })
      if (result.kind === "submitted") {
        setApplicationNumber(result.applicationNumber)
        await openPayment(result.applicationNumber)
      } else {
        setMessage(result.message)
      }
    } catch {
      setMessage(
        "The renewal application could not be submitted. Try again shortly."
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStartPayment() {
    const idempotencyKey = createIdempotencyKey()
    if (!idempotencyKey) return
    setSubmitting(true)
    try {
      const result = await startPayment({
        data: { applicationNumber, idempotencyKey },
      })
      if (result.kind === "started" || result.kind === "already-paid") {
        setPayment(result.payment)
      } else if ("message" in result) {
        setMessage(result.message)
      }
    } catch {
      setMessage(
        "Payment service is temporarily unavailable. Try again shortly."
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOutcome(outcome: "SUCCESS" | "FAILURE") {
    if (!payment) return
    const idempotencyKey = createIdempotencyKey()
    if (!idempotencyKey) return
    setSubmitting(true)
    try {
      const result = await resolvePayment({
        data: {
          applicationNumber,
          idempotencyKey,
          outcome,
          paymentId: payment.id,
        },
      })
      if (result.kind === "paid" || result.kind === "failed") {
        setPayment(result.payment)
        setMessage(
          result.kind === "paid"
            ? "Your renewal has been recorded by DigiLicense only. No government service or payment provider was contacted."
            : "The payment was not completed. You can start another payment attempt."
        )
      } else if ("message" in result) {
        setMessage(result.message)
      }
    } catch {
      setMessage(
        "Payment service is temporarily unavailable. Try again shortly."
      )
    } finally {
      setSubmitting(false)
    }
  }

  const selectedLicence = state?.licences.find(
    (licence) => licence.id === licenceRecordId
  )
  const canSubmit = selectedLicence?.eligibility.kind === "eligible"

  if (phase === "loading") {
    return (
      <section
        aria-busy="true"
        className="rounded-xl border border-border p-6 sm:p-8"
      >
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-8 h-11 w-full" />
      </section>
    )
  }
  if (phase === "unavailable") {
    return <StateCard detail={message} title="Licence renewal unavailable" />
  }
  if (phase === "active") {
    return (
      <StateCard
        detail={`${message} Reference: ${applicationNumber}.`}
        title="Your renewal is in progress"
        action={
          <Button
            disabled={submitting}
            onClick={() => void openPayment(applicationNumber)}
          >
            Continue to fee step
          </Button>
        }
      />
    )
  }
  if (phase === "payment") {
    return (
      <section
        aria-live="polite"
        className="rounded-xl border border-border bg-card p-6 sm:p-8"
      >
        <h2 className="font-sans text-2xl font-semibold">
          Record the fee outcome
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Reference: {applicationNumber}. {payment?.disclosure}
        </p>
        {!payment ? (
          <Button
            className="mt-6"
            disabled={submitting}
            onClick={() => void handleStartPayment()}
          >
            {submitting ? "Starting..." : "Start payment"}
          </Button>
        ) : payment.status === "PENDING" ? (
          <div className="mt-6 rounded-xl bg-muted p-5">
            <p className="text-sm text-muted-foreground">Amount due</p>
            <p className="mt-1 text-3xl font-semibold">
              {formatAmount(payment.amountPaise)}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Fee code {payment.catalogueCode}, schedule{" "}
              {payment.catalogueVersion}.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button
                disabled={submitting}
                onClick={() => void handleOutcome("SUCCESS")}
              >
                Record payment
              </Button>
              <Button
                disabled={submitting}
                onClick={() => void handleOutcome("FAILURE")}
                variant="outline"
              >
                Record unsuccessful payment
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl bg-muted p-5">
            <p className="font-semibold">
              {payment.status === "PAID"
                ? "Renewal recorded"
                : "Payment not completed"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {message || payment.disclosure}
            </p>
            {payment.status !== "PAID" ? (
              <Button
                className="mt-5"
                disabled={submitting}
                onClick={() => void handleStartPayment()}
                variant="outline"
              >
                Try payment again
              </Button>
            ) : null}
          </div>
        )}
        {message && payment?.status === "PENDING" ? (
          <p className="mt-4 text-sm text-destructive">{message}</p>
        ) : null}
      </section>
    )
  }

  return (
    <form
      className="rounded-xl border border-border bg-card p-6 sm:p-8"
      onSubmit={handleSubmit}
    >
      <h2 className="font-sans text-2xl font-semibold">
        Check your renewal window
      </h2>
      <p className="mt-3 leading-7 text-muted-foreground">
        Choose a licence record. Renewal opens 12 months before expiry and
        closes 12 months after expiry.
      </p>
      {state?.licences.length ? (
        <>
          <label
            className="mt-6 block text-sm font-semibold"
            htmlFor="renewal-licence"
          >
            Licence record
          </label>
          <select
            className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
            id="renewal-licence"
            onChange={(event) => setLicenceRecordId(event.target.value)}
            value={licenceRecordId}
          >
            {state.licences.map((licence) => (
              <option key={licence.id} value={licence.id}>
                {licence.licenceNumber}, valid until{" "}
                {formatDate(licence.validUntil)}
              </option>
            ))}
          </select>
          {selectedLicence ? (
            <div className="mt-5 rounded-xl bg-muted p-4 text-sm leading-6 text-muted-foreground">
              {selectedLicence.eligibility.kind === "eligible"
                ? `You can renew this licence now. The window closes ${formatDate(selectedLicence.eligibility.closesAt)}.`
                : selectedLicence.eligibility.kind === "not-open"
                  ? `Renewal opens ${formatDate(selectedLicence.eligibility.opensAt)}.`
                  : `The renewal window closed ${formatDate(selectedLicence.eligibility.closesAt)}.`}
            </div>
          ) : null}
          <label
            className="mt-5 block text-sm font-semibold"
            htmlFor="renewal-reason"
          >
            Renewal reason
          </label>
          <select
            className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
            id="renewal-reason"
            onChange={(event) => setReason(event.target.value as Reason)}
            value={reason}
          >
            <option value="EXPIRING_SOON">Licence expires soon</option>
            <option value="RECENTLY_EXPIRED">Licence recently expired</option>
          </select>
          <label className="mt-6 flex items-start gap-3 rounded-xl border border-border p-4">
            <input className="mt-1 size-5" required type="checkbox" />
            <span className="text-sm leading-6">
              I confirm this renewal is for my DigiLicense record. No government
              service is contacted.
            </span>
          </label>
          <p aria-live="polite" className="mt-4 text-sm text-destructive">
            {message}
          </p>
          <Button
            className="mt-5 h-11 w-full"
            disabled={submitting || !canSubmit}
            type="submit"
          >
            {submitting ? "Submitting..." : "Continue to fee"}
          </Button>
        </>
      ) : (
        <p className="mt-6 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          No licence record is available for this account.
        </p>
      )}
    </form>
  )
}

function StateCard({
  action,
  detail,
  title,
}: {
  action?: ReactNode
  detail: string
  title: string
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <h2 className="font-sans text-2xl font-semibold">{title}</h2>
      <p className="mt-3 leading-7 text-muted-foreground">{detail}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  )
}

export { RenewalFlow }
