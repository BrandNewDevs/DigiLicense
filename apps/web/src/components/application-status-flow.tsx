import { useState } from "react"
import type { FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { ClipboardCheck, Search } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import {
  lookupApplicationStatus,
  markApplicationNotificationRead,
} from "../server-functions/application-status"
import { applicationLookupSchema } from "../validation/application-status"

type StatusResult = {
  application: {
    applicationNumber: string
    nextAction: string
    service: string
    status: { code: string; label: string }
  }
  blockingReason: { code: string; message: string } | null
  deadline: { kind: "EXPECTED_REVIEW_BY"; at: string; overdue: boolean } | null
  documents: {
    items: Array<{ id: string; status: string; type: string }>
  }
  history: {
    items: Array<{
      createdAt: string
      description: string
      id: string
      title: string
    }>
  }
  notifications: {
    items: Array<{
      createdAt: string
      id: string
      message: string
      title: string
    }>
    unreadCount: number
  }
}

const inputClassName =
  "h-11 w-full rounded-lg border border-input px-3 text-base sm:max-w-md"

function ApplicationStatusFlow() {
  const lookupStatus = useServerFn(lookupApplicationStatus)
  const markNotificationRead = useServerFn(markApplicationNotificationRead)
  const [applicationNumber, setApplicationNumber] = useState("")
  const [result, setResult] = useState<StatusResult>()
  const [message, setMessage] = useState("")
  const [notificationMessage, setNotificationMessage] = useState("")
  const [authenticationRequired, setAuthenticationRequired] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = applicationLookupSchema.safeParse({ applicationNumber })
    if (!parsed.success) {
      setResult(undefined)
      setAuthenticationRequired(false)
      setMessage("Enter a valid application reference to continue.")
      return
    }

    setIsSubmitting(true)
    setResult(undefined)
    setAuthenticationRequired(false)
    setMessage("")
    setNotificationMessage("")
    try {
      const response = await lookupStatus({ data: parsed.data })
      if (response.kind === "found") {
        setResult(response)
        return
      }
      if (response.kind === "authentication-required") {
        setAuthenticationRequired(true)
      }
      setMessage(response.message)
    } catch {
      setMessage("Application tracking is temporarily unavailable.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    if (!result) return

    setNotificationMessage("")

    try {
      const response = await markNotificationRead({
        data: {
          applicationNumber: result.application.applicationNumber,
          notificationId,
        },
      })
      if (response.kind !== "success") {
        setNotificationMessage(
          response.kind === "rate-limited"
            ? response.message
            : "The notification could not be updated."
        )
        return
      }
      setResult((current) => {
        if (!current) return current

        const itemWasUnread = current.notifications.items.some(
          (notification) => notification.id === notificationId
        )
        if (!itemWasUnread) return current

        return {
          ...current,
          notifications: {
            ...current.notifications,
            items: current.notifications.items.filter(
              (notification) => notification.id !== notificationId
            ),
            unreadCount: Math.max(0, current.notifications.unreadCount - 1),
          },
        }
      })
      setNotificationMessage("Notification marked as read.")
    } catch {
      setNotificationMessage("The notification could not be updated.")
    }
  }

  return (
    <section className="rounded-xl border border-border p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <Search aria-hidden="true" className="size-6 text-primary" />
        <h2 className="font-sans text-2xl font-medium">
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
              className="size-5 text-primary"
            />
            <h3
              className="font-sans text-xl font-medium"
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
              <dd className="mt-1">{result.application.service}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1">{result.application.status.label}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Next action
              </dt>
              <dd className="mt-1">{result.application.nextAction}</dd>
            </div>
          </dl>
          {result.blockingReason ? (
            <p className="mt-5 rounded-lg bg-muted p-3 text-sm leading-6">
              {result.blockingReason.message}
            </p>
          ) : null}
          {result.deadline ? (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Expected update by{" "}
              <time dateTime={result.deadline.at}>
                {new Date(result.deadline.at).toLocaleString()}
              </time>
              {result.deadline.overdue
                ? ". This update is taking longer than expected."
                : "."}
            </p>
          ) : null}
          <StatusHistory items={result.history.items} />
          <StatusDocuments items={result.documents.items} />
          <StatusNotifications
            items={result.notifications.items}
            onMarkRead={handleMarkNotificationRead}
            statusMessage={notificationMessage}
            unreadCount={result.notifications.unreadCount}
          />
        </section>
      ) : null}

      {authenticationRequired ? (
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

function StatusHistory({ items }: { items: StatusResult["history"]["items"] }) {
  return (
    <section className="mt-6">
      <h4 className="font-medium">Application history</h4>
      <ol className="mt-3 space-y-3 text-sm">
        {items.map((event) => (
          <li key={event.id}>
            <p className="font-medium">{event.title}</p>
            <p className="text-muted-foreground">{event.description}</p>
            <time className="text-muted-foreground" dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
    </section>
  )
}

function StatusDocuments({
  items,
}: {
  items: StatusResult["documents"]["items"]
}) {
  return (
    <section className="mt-6">
      <h4 className="font-medium">Documents</h4>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((document) => (
          <li key={document.id}>
            {document.type.replaceAll("_", " ").toLowerCase()}:{" "}
            {document.status.replaceAll("_", " ").toLowerCase()}
          </li>
        ))}
      </ul>
    </section>
  )
}

function StatusNotifications({
  items,
  onMarkRead,
  statusMessage,
  unreadCount,
}: {
  items: StatusResult["notifications"]["items"]
  onMarkRead: (notificationId: string) => void
  statusMessage: string
  unreadCount: number
}) {
  return (
    <section className="mt-6">
      <h4 className="font-medium">Unread notifications ({unreadCount})</h4>
      <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">
        {statusMessage}
      </p>
      <ul className="mt-3 space-y-3 text-sm">
        {items.map((notification) => (
          <li key={notification.id}>
            <p className="font-medium">{notification.title}</p>
            <p className="text-muted-foreground">{notification.message}</p>
            <Button
              className="mt-2"
              onClick={() => onMarkRead(notification.id)}
              size="sm"
              type="button"
              variant="outline"
            >
              Mark as read
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export { ApplicationStatusFlow }
