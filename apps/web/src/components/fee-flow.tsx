import { useState } from "react"
import type { FormEvent } from "react"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"

import { getFeeQuote } from "../server-functions/payment"

type FeeService =
  | "address-change"
  | "learner-licence"
  | "permanent-licence"
  | "renewal"
  | "replacement"

const serviceOptions: Array<{ label: string; value: FeeService }> = [
  { label: "Learner's licence", value: "learner-licence" },
  { label: "Permanent driving licence", value: "permanent-licence" },
  { label: "Driving-licence renewal", value: "renewal" },
  { label: "Duplicate or replacement licence", value: "replacement" },
  { label: "Address change", value: "address-change" },
]

function formatAmount(amountPaise: number): string {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amountPaise / 100)
}

function FeeFlow() {
  const quoteFee = useServerFn(getFeeQuote)
  const [service, setService] = useState<FeeService>("renewal")
  const [result, setResult] = useState<
    Awaited<ReturnType<typeof getFeeQuote>> | undefined
  >()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setResult(undefined)
    try {
      setResult(await quoteFee({ data: { service } }))
    } catch {
      setResult({
        kind: "unavailable",
        message: "Fee information is temporarily unavailable.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <h2 className="font-sans text-2xl font-semibold">Fee estimate</h2>
      <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
        Choose a service to see the current DigiLicense fee record. You do not
        need to sign in or enter any personal details.
      </p>
      <form className="mt-7" onSubmit={handleSubmit}>
        <label
          className="mb-2 block text-sm font-semibold"
          htmlFor="fee-service"
        >
          Service
        </label>
        <select
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base sm:max-w-md"
          id="fee-service"
          onChange={(event) => setService(event.target.value as FeeService)}
          value={service}
        >
          {serviceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button className="mt-5 h-11" disabled={loading} type="submit">
          {loading ? "Checking..." : "Show fee"}
        </Button>
      </form>
      {result?.kind === "found" ? (
        <div aria-live="polite" className="mt-7 rounded-xl bg-muted p-5">
          <p className="text-sm font-medium text-muted-foreground">
            Amount due
          </p>
          <p className="mt-1 text-3xl font-semibold">
            {formatAmount(result.amountPaise)}
          </p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Fee code {result.catalogueCode}, schedule {result.catalogueVersion}.{" "}
            {result.disclosure}
          </p>
        </div>
      ) : null}
      {result && result.kind !== "found" ? (
        <p aria-live="polite" className="mt-5 text-sm text-destructive">
          {result.message}
        </p>
      ) : null}
    </section>
  )
}

export { FeeFlow }
