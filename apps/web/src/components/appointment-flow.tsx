import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { CalendarCheck, Clock, MapPin } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useAssistantPublicContextOverride } from "../lib/assistant-public-context"

import {
  acceptAppointmentOffer,
  leaveAppointmentWaitlist,
  readAppointmentJourney,
  rejectAppointmentOffer,
  saveAppointmentPreferences,
} from "../server-functions/appointment"

type AppointmentJourney = {
  applicationNumber: string
  confirmedAppointment: {
    confirmedAt: string
    endsAt: string
    startsAt: string
    zone: string
  } | null
  kind: "found"
  offer: {
    expiresAt: string
    id: string
    ranking: {
      breakdown: {
        preferencePoints: number
        urgencyPoints: number
        waitTimePoints: number
      } | null
      policyVersion: string
      score: number
    }
    slot: { endsAt: string; startsAt: string; zone: string }
  } | null
  preferences: { notificationChannels: Array<"SMS" | "EMAIL">; zones: string[] }
  state:
    | "CONFIRMED"
    | "COOLDOWN"
    | "OFFERED"
    | "PREFERENCES_REQUIRED"
    | "WAITLISTED"
    | "LEFT"
}

type FailureResult = {
  kind: string
  message: string
  retryAfterSeconds?: number
}

type Phase =
  | "authentication-required"
  | "confirmation"
  | "cooldown"
  | "left"
  | "loading"
  | "offer"
  | "preferences"
  | "unavailable"
  | "waitlisted"

const zoneLabels: Record<string, string> = {
  CENTRAL_DELHI: "Central Delhi",
  EAST_DELHI: "East Delhi",
  NORTH_DELHI: "North Delhi",
  SOUTH_DELHI: "South Delhi",
}

const zoneOptions = [
  { value: "CENTRAL_DELHI", label: "Central Delhi" },
  { value: "EAST_DELHI", label: "East Delhi" },
  { value: "NORTH_DELHI", label: "North Delhi" },
  { value: "SOUTH_DELHI", label: "South Delhi" },
]

const channelOptions = [
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "Email" },
]

function formatDateTime(isoDateTime: string): string {
  return new Date(isoDateTime).toLocaleString("en-IN", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatTime(isoDateTime: string): string {
  return new Date(isoDateTime).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function createIdempotencyKey(): string | null {
  if (typeof crypto === "undefined") return null

  if ("randomUUID" in crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function AppointmentFlow({
  applicationNumber,
}: {
  applicationNumber: string | undefined
}) {
  const loadJourney = useServerFn(readAppointmentJourney)
  const savePreferences = useServerFn(saveAppointmentPreferences)
  const leaveWaitlist = useServerFn(leaveAppointmentWaitlist)
  const acceptOffer = useServerFn(acceptAppointmentOffer)
  const rejectOffer = useServerFn(rejectAppointmentOffer)

  const [phase, setPhase] = useState<Phase>("loading")
  const [journey, setJourney] = useState<AppointmentJourney | null>(null)
  const [failure, setFailure] = useState<FailureResult | null>(null)
  const [selectedZones, setSelectedZones] = useState<string[]>([])
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["SMS"])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditingPreferences, setIsEditingPreferences] = useState(false)
  const [actionMessage, setActionMessage] = useState("")
  useAssistantPublicContextOverride({
    page:
      phase === "offer"
        ? "appointment-offer"
        : phase === "waitlisted" || phase === "cooldown"
          ? "appointment-waitlist"
          : "appointment-booking",
    reasonCode:
      phase === "offer"
        ? "OFFER_PENDING"
        : phase === "waitlisted"
          ? "WAITLIST_ACTIVE"
          : phase === "cooldown"
            ? "OFFER_EXPIRED"
            : phase === "preferences"
              ? "PREPARATION_REQUIRED"
              : "NONE",
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await loadJourney({ data: { applicationNumber } })
        if (cancelled) return

        if (result.kind === "found") {
          setJourney(result)
          mapStateToPhase(result.state)
          return
        }

        if (result.kind === "authentication-required") {
          setPhase("authentication-required")
          return
        }

        setFailure({ kind: result.kind, message: result.message })
        setPhase("unavailable")
      } catch {
        if (!cancelled) setPhase("unavailable")
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [applicationNumber, loadJourney])

  useEffect(() => {
    if (!journey?.offer) return

    const ref = journey.applicationNumber

    async function refreshOnFocus() {
      try {
        const result = await loadJourney({ data: { applicationNumber: ref } })
        if (result.kind === "found") {
          setJourney(result)
          mapStateToPhase(result.state)
        }
      } catch {
        // ignore refresh errors
      }
    }

    const interval = window.setInterval(refreshOnFocus, 60_000)
    window.addEventListener("focus", refreshOnFocus)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", refreshOnFocus)
    }
  }, [journey?.offer, journey?.applicationNumber, loadJourney])

  function mapStateToPhase(state: AppointmentJourney["state"]) {
    switch (state) {
      case "CONFIRMED":
        setPhase("confirmation")
        break
      case "COOLDOWN":
        setPhase("cooldown")
        break
      case "OFFERED":
        setPhase("offer")
        break
      case "PREFERENCES_REQUIRED":
        setPhase("preferences")
        break
      case "WAITLISTED":
        setPhase("waitlisted")
        break
      case "LEFT":
        setPhase("left")
        break
    }
  }

  async function handleSavePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!journey) {
      setActionMessage("Your appointment journey is still loading. Try again.")
      return
    }

    if (selectedZones.length === 0 || selectedChannels.length === 0) {
      setActionMessage("Select at least one zone and one notification channel.")
      return
    }

    const key = createIdempotencyKey()
    if (!key) {
      setActionMessage(
        "This browser cannot submit securely. Update your browser or use HTTPS."
      )
      return
    }

    setIsSubmitting(true)
    setActionMessage("")

    try {
      const result = await savePreferences({
        data: {
          applicationNumber: journey.applicationNumber,
          idempotencyKey: key,
          notificationChannels: selectedChannels as Array<"SMS" | "EMAIL">,
          zones: selectedZones as Array<
            "CENTRAL_DELHI" | "EAST_DELHI" | "NORTH_DELHI" | "SOUTH_DELHI"
          >,
        },
      })

      if (result.kind === "saved") {
        setIsEditingPreferences(false)
        setActionMessage(
          isEditingPreferences
            ? "Preferences updated. Your waitlist time has not changed."
            : "Preferences saved. You are now on the waitlist."
        )
        const refreshed = await loadJourney({
          data: { applicationNumber: journey.applicationNumber },
        })
        if (refreshed.kind === "found") {
          setJourney(refreshed)
          mapStateToPhase(refreshed.state)
        }
      } else {
        setActionMessage(result.message)
      }
    } catch {
      setActionMessage("Could not save preferences. Try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleLeaveWaitlist() {
    if (!journey) return

    const key = createIdempotencyKey()
    if (!key) return

    setIsSubmitting(true)
    setActionMessage("")

    try {
      const result = await leaveWaitlist({
        data: {
          applicationNumber: journey.applicationNumber,
          idempotencyKey: key,
        },
      })

      if (result.kind === "left") {
        setPhase("left")
        setActionMessage("You have left the waitlist.")
      } else {
        setActionMessage(result.message)
      }
    } catch {
      setActionMessage("Could not leave the waitlist. Try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAcceptOffer() {
    if (!journey?.offer) return

    const key = createIdempotencyKey()
    if (!key) return

    setIsSubmitting(true)
    setActionMessage("")

    try {
      const result = await acceptOffer({
        data: {
          applicationNumber: journey.applicationNumber,
          idempotencyKey: key,
          offerId: journey.offer.id,
        },
      })

      if (result.kind === "confirmed") {
        setPhase("confirmation")
        const refreshed = await loadJourney({
          data: { applicationNumber: journey.applicationNumber },
        })
        if (refreshed.kind === "found") {
          setJourney(refreshed)
          mapStateToPhase(refreshed.state)
        }
      } else {
        setActionMessage(result.message)
      }
    } catch {
      setActionMessage("Could not accept the offer. Try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRejectOffer() {
    if (!journey?.offer) return

    const key = createIdempotencyKey()
    if (!key) return

    setIsSubmitting(true)
    setActionMessage("")

    try {
      const result = await rejectOffer({
        data: {
          applicationNumber: journey.applicationNumber,
          idempotencyKey: key,
          offerId: journey.offer.id,
        },
      })

      if (result.kind === "rejected") {
        setActionMessage("Offer declined. You remain on the waitlist.")
        const refreshed = await loadJourney({
          data: { applicationNumber: journey.applicationNumber },
        })
        if (refreshed.kind === "found") {
          setJourney(refreshed)
          mapStateToPhase(refreshed.state)
        }
      } else {
        setActionMessage(result.message)
      }
    } catch {
      setActionMessage("Could not decline the offer. Try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  function openPreferenceEditor() {
    setSelectedZones(journey?.preferences.zones ?? [])
    setSelectedChannels(
      journey?.preferences.notificationChannels.length
        ? journey.preferences.notificationChannels
        : ["SMS"]
    )
    setActionMessage("")
    setIsEditingPreferences(true)
    setPhase("preferences")
  }

  function toggleZone(zone: string) {
    setSelectedZones((current) =>
      current.includes(zone)
        ? current.filter((z) => z !== zone)
        : current.length < 3
          ? [...current, zone]
          : current
    )
  }

  function toggleChannel(channel: string) {
    setSelectedChannels((current) =>
      current.includes(channel)
        ? current.filter((c) => c !== channel)
        : current.length < 2
          ? [...current, channel]
          : current
    )
  }

  if (phase === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label="Loading appointment status"
        className="rounded-xl border border-border p-6 sm:p-8"
      >
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-4 h-4 w-full max-w-xl" />
        <Skeleton className="mt-8 h-12 w-full" />
        <Skeleton className="mt-3 h-12 w-full" />
      </section>
    )
  }

  if (phase === "authentication-required") {
    return (
      <section className="rounded-xl border border-border p-6 sm:p-8">
        <h2 className="font-sans text-2xl font-medium">Sign in required</h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Sign in as an applicant to manage your driving-test appointment.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-foreground px-5 text-base font-medium text-foreground"
          search={{ returnTo: "/services/appointments" }}
          to="/applicant/login"
        >
          Go to sign in
        </Link>
      </section>
    )
  }

  if (phase === "unavailable") {
    const isUnavailable = !failure || failure.kind === "unavailable"
    return (
      <section className="rounded-xl border border-border p-6 sm:p-8">
        <h2 className="font-sans text-2xl font-medium">
          {isUnavailable ? "Service unavailable" : "Appointment not available"}
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          {failure?.message ??
            "The appointment service could not be loaded. Reload the page to try again."}
        </p>
        {!isUnavailable ? (
          <Link
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-foreground px-5 text-base font-medium text-foreground"
            params={{ serviceId: "permanent-licence" }}
            to="/services/$serviceId"
          >
            Check permanent-licence application
          </Link>
        ) : null}
      </section>
    )
  }

  if (phase === "confirmation" && journey?.confirmedAppointment) {
    const appt = journey.confirmedAppointment
    return (
      <section className="rounded-xl border border-border p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <CalendarCheck aria-hidden="true" className="size-6 text-primary" />
          <h2 className="font-sans text-2xl font-medium">
            Appointment confirmed
          </h2>
        </div>
        <dl className="mt-6 space-y-4 rounded-2xl border border-border p-5">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Application number
            </dt>
            <dd className="mt-1 font-mono text-lg font-medium">
              {journey.applicationNumber}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <MapPin
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <dt className="sr-only">Zone</dt>
            <dd>{zoneLabels[appt.zone] ?? appt.zone}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Clock
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <dt className="sr-only">Date and time</dt>
            <dd>
              <time dateTime={appt.startsAt}>
                {formatDateTime(appt.startsAt)}
              </time>
              {" – "}
              <time dateTime={appt.endsAt}>{formatTime(appt.endsAt)}</time>
            </dd>
          </div>
        </dl>
        <section
          aria-labelledby="appointment-checklist"
          className="mt-6 rounded-2xl bg-muted p-5"
        >
          <h3 className="font-semibold" id="appointment-checklist">
            Before the driving test
          </h3>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
            <li>Keep this DigiLicense appointment reference available.</li>
            <li>Review the vehicle class recorded in your application.</li>
            <li>
              Check the test location and arrival instructions before you
              travel.
            </li>
          </ul>
        </section>
        <section
          aria-labelledby="appointment-next-step"
          className="mt-6 rounded-2xl border border-border p-5"
        >
          <h3 className="font-semibold" id="appointment-next-step">
            Your next step
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Attend the driving test at the confirmed time and zone. DigiLicense
            does not record the driving-test outcome after this appointment.
          </p>
          <Link
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-foreground px-5 text-sm font-medium text-foreground"
            to="/dashboard"
          >
            Return to dashboard
          </Link>
        </section>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          This appointment was recorded by DigiLicense only. No government
          service was contacted and no official booking exists.
        </p>
      </section>
    )
  }

  if (phase === "cooldown") {
    return (
      <section className="rounded-xl border border-border p-6 sm:p-8">
        <h2 className="font-sans text-2xl font-medium">
          Appointment offer expired
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Your previous offer was not accepted in time. You remain on the
          waitlist and will be contacted when another slot opens.
        </p>
        <dl className="mt-6 space-y-4 rounded-2xl border border-border p-5">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Application number
            </dt>
            <dd className="mt-1 font-mono text-lg font-medium">
              {journey?.applicationNumber}
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          You can change preferences while you wait. This does not change when
          you joined the waitlist.
        </p>
        <Button className="mt-6" onClick={openPreferenceEditor} type="button">
          Edit preferences
        </Button>
        {actionMessage ? (
          <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
            {actionMessage}
          </p>
        ) : null}
      </section>
    )
  }

  if (phase === "left") {
    return (
      <section className="rounded-xl border border-border p-6 sm:p-8">
        <h2 className="font-sans text-2xl font-medium">
          You left the waitlist
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          You are no longer on the waitlist for a driving-test appointment. If
          you need an appointment later, you can rejoin.
        </p>
        {actionMessage ? (
          <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
            {actionMessage}
          </p>
        ) : null}
        <Button className="mt-6" onClick={openPreferenceEditor} type="button">
          Choose preferences and rejoin
        </Button>
      </section>
    )
  }

  if (phase === "offer" && journey?.offer) {
    const offer = journey.offer
    return (
      <section className="rounded-xl border border-border p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <CalendarCheck aria-hidden="true" className="size-6 text-primary" />
          <h2 className="font-sans text-2xl font-medium">
            A slot is available
          </h2>
        </div>
        <p className="mt-3 leading-7 text-muted-foreground">
          Accept or decline this offer. If you decline, you stay on the
          waitlist. The offer expires at{" "}
          <time dateTime={offer.expiresAt}>
            {formatDateTime(offer.expiresAt)}
          </time>
          .
        </p>
        <dl className="mt-6 space-y-4 rounded-2xl border border-border p-5">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Application number
            </dt>
            <dd className="mt-1 font-mono text-lg font-medium">
              {journey.applicationNumber}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <MapPin
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <dt className="sr-only">Zone</dt>
            <dd>{zoneLabels[offer.slot.zone] ?? offer.slot.zone}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Clock
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <dt className="sr-only">Date and time</dt>
            <dd>
              <time dateTime={offer.slot.startsAt}>
                {formatDateTime(offer.slot.startsAt)}
              </time>
              {" – "}
              <time dateTime={offer.slot.endsAt}>
                {formatTime(offer.slot.endsAt)}
              </time>
            </dd>
          </div>
          {offer.ranking.breakdown ? (
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Ranking score
              </dt>
              <dd className="mt-1">
                {offer.ranking.score} (policy {offer.ranking.policyVersion})
              </dd>
            </div>
          ) : null}
        </dl>
        {actionMessage ? (
          <p aria-live="polite" className="mt-4 text-sm text-destructive">
            {actionMessage}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            disabled={isSubmitting}
            onClick={handleAcceptOffer}
            type="button"
          >
            {isSubmitting ? "Processing..." : "Accept appointment"}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={handleRejectOffer}
            type="button"
            variant="outline"
          >
            Decline
          </Button>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          This offer was generated by DigiLicense only. No government service
          was contacted.
        </p>
      </section>
    )
  }

  if (phase === "waitlisted") {
    return (
      <section className="rounded-xl border border-border p-6 sm:p-8">
        <h2 className="font-sans text-2xl font-medium">
          You are on the waitlist
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          When a slot matching your preferences opens, you will receive an
          offer.
        </p>
        <dl className="mt-6 space-y-4 rounded-2xl border border-border p-5">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Application number
            </dt>
            <dd className="mt-1 font-mono text-lg font-medium">
              {journey?.applicationNumber}
            </dd>
          </div>
          {journey && journey.preferences.zones.length > 0 ? (
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Preferred zones
              </dt>
              <dd className="mt-1">
                {journey.preferences.zones
                  .map((z) => zoneLabels[z] ?? z)
                  .join(", ")}
              </dd>
            </div>
          ) : null}
          {journey && journey.preferences.notificationChannels.length > 0 ? (
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Notification channels
              </dt>
              <dd className="mt-1">
                {journey.preferences.notificationChannels.join(", ")}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          You can change preferences while you wait. This does not change when
          you joined the waitlist.
        </p>
        {actionMessage ? (
          <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
            {actionMessage}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={openPreferenceEditor} type="button">
            Edit preferences
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={handleLeaveWaitlist}
            type="button"
            variant="outline"
          >
            {isSubmitting ? "Processing..." : "Leave waitlist"}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border p-6 sm:p-8">
      <h2 className="font-sans text-2xl font-medium">
        {isEditingPreferences
          ? "Edit your appointment preferences"
          : "Set your appointment preferences"}
      </h2>
      <p className="mt-3 leading-7 text-muted-foreground">
        Choose up to three Delhi test zones and how you would like to be
        notified when a slot opens.
        {isEditingPreferences
          ? " Changing these choices does not change your waitlist time."
          : ""}
      </p>
      <form className="mt-7" onSubmit={handleSavePreferences}>
        <fieldset>
          <legend className="text-sm font-medium">Test zones</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {zoneOptions.map((zone) => (
              <label
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-4 text-base has-checked:border-ring ${
                  selectedZones.includes(zone.value)
                    ? "border-ring bg-accent"
                    : "border-input"
                }`}
                key={zone.value}
              >
                <input
                  checked={selectedZones.includes(zone.value)}
                  onChange={() => toggleZone(zone.value)}
                  type="checkbox"
                  value={zone.value}
                />
                {zone.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium">Notification channels</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {channelOptions.map((channel) => (
              <label
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-4 text-base has-checked:border-ring ${
                  selectedChannels.includes(channel.value)
                    ? "border-ring bg-accent"
                    : "border-input"
                }`}
                key={channel.value}
              >
                <input
                  checked={selectedChannels.includes(channel.value)}
                  onChange={() => toggleChannel(channel.value)}
                  type="checkbox"
                  value={channel.value}
                />
                {channel.label}
              </label>
            ))}
          </div>
        </fieldset>

        {actionMessage ? (
          <p aria-live="polite" className="mt-4 text-sm text-destructive">
            {actionMessage}
          </p>
        ) : null}

        <Button className="mt-6" disabled={isSubmitting} type="submit">
          {isSubmitting
            ? "Saving..."
            : isEditingPreferences
              ? "Save preference changes"
              : "Save preferences and join waitlist"}
        </Button>
      </form>
      <p className="mt-5 text-sm leading-6 text-muted-foreground">
        Waitlist allocation is handled entirely within DigiLicense. No
        government service is contacted.
      </p>
    </section>
  )
}

export { AppointmentFlow }
