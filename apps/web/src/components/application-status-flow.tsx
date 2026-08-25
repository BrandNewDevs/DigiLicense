import { useState } from "react"
import type { FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { ClipboardCheck, Search } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { lookupApplicationStatus } from "../server-functions/application-status"
import { applicationLookupSchema } from "../validation/application-status"

type StatusResult = {
  nextAction: string
  service: string
  status: string
}

const inputClassName =
  "h-11 w-full rounded-lg border border-input px-3 text-base sm:max-w-md"

function ApplicationStatusFlow() {
  const lookupStatus = useServerFn(lookupApplicationStatus)
  const [applicationNumber, setApplicationNumber] = useState("")
  const [result, setResult] = useState<StatusResult>()
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = applicationLookupSchema.safeParse({ applicationNumber })

    if (!parsed.success) {
      setResult(undefined)
      setMessage("Enter a valid application reference to continue.")
      return
    }

    setIsSubmitting(true)
    setResult(undefined)
    setMessage("")
    try {
      const response = await lookupStatus({ data: parsed.data })
      if (response.kind === "found") {
        setResult({
          nextAction: response.nextAction,
          service: response.service,
          status: response.status,
        })
        return
      }

      setMessage(response.message)
    } catch {
      setMessage("Application tracking is temporarily unavailable.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="rounded-3xl border border-border p-6 sm:p-8">
      <p className="text-sm font-medium text-muted-foreground">
        Application tracking
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Search aria-hidden="true" className="size-6 text-[#d96b16]" />
        <h2 className="font-heading text-2xl font-medium tracking-[-0.04em]">
          Check the current application status
        </h2>
      </div>
      <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
        Enter an application reference created for your signed-in account.
        DigiLicense only shows records owned by that account.
      </p>

      <form className="mt-7" onSubmit={handleSubmit}>
        <label
          className="block text-sm font-medium"
          htmlFor="application-number"
        >
          Application reference
        </label>
        <input
          autoCapitalize="characters"
          autoComplete="off"
          className={`${inputClassName} mt-2 font-mono`}
          id="application-number"
          maxLength={32}
          onChange={(event) =>
            setApplicationNumber(event.target.value.toUpperCase())
          }
          pattern="[A-Za-z0-9-]+"
          placeholder="DLDEMO20260001"
          required
          value={applicationNumber}
        />
        <p aria-live="polite" className="mt-3 text-sm text-destructive">
          {message}
        </p>
        <Button className="mt-5" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Checking..." : "Check status"}
        </Button>
      </form>

      {result ? (
        <section
          aria-live="polite"
          aria-labelledby="application-status-result"
          className="mt-7 rounded-2xl border border-border p-5"
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck
              aria-hidden="true"
              className="size-5 text-[#d96b16]"
            />
            <h3
              className="font-heading text-xl font-medium"
              id="application-status-result"
            >
              Current status
            </h3>
          </div>
          <dl className="mt-5 space-y-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Service
              </dt>
              <dd className="mt-1">{result.service}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1">{result.status}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Next action
              </dt>
              <dd className="mt-1">{result.nextAction}</dd>
            </div>
          </dl>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            This view shows the current status only. Application history,
            deadlines, and notifications are not available here yet.
          </p>
        </section>
      ) : null}

      {message.includes("Sign in") ? (
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-foreground px-5 font-medium"
          search={{ returnTo: "/services/track-application" }}
          to="/applicant/login"
        >
          Go to sign in
        </Link>
      ) : null}
    </section>
  )
}

export { ApplicationStatusFlow }
