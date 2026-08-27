import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { CalendarCheck, Clock, MapPin } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

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

function AppointmentFlow() {
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
  const [actionMessage, setActionMessage] = useState("")

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await loadJourney()
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
  }, [loadJourney])

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
          applicationNumber: journey?.applicationNumber ?? "",
          idempotencyKey: key,
          notificationChannels: selectedChannels as Array<"SMS" | "EMAIL">,
          zones: selectedZones as Array<
            | "CENTRAL_DELHI"
            | "EAST_DELHI"
            | "NORTH_DELHI"
            | "SOUTH_DELHI"
          >,
        },
      })

      if (result.kind === "saved") {
        setActionMessage("Preferences saved. You are now on the waitlist.")
        const refreshed = await loadJourney()
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
    const key = createIdempotencyKey()
    if (!key) return

    setIsSubmitting(true)
    setActionMessage("")

    try {
      const result = await leaveWaitlist({
        data: {
          applicationNumber: journey?.applicationNumber ?? "",
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
        const refreshed = await loadJourney()
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
        const refreshed = await loadJourney()
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
    return (
      <section className="rounded-xl border border-border p-6 sm:p-8">
        <h2 className="font-sans text-2xl font-medium">
          Service unavailable
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          {failure?.message ??
            "The appointment service could not be loaded. Reload the page to try again."}
        </p>
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
            <MapPin aria-hidden="true" className="size-4 text-muted-foreground" />
            <dt className="sr-only">Zone</dt>
            <dd>{zoneLabels[appt.zone] ?? appt.zone}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Clock aria-hidden="true" className="size-4 text-muted-foreground" />
            <dt className="sr-only">Date and time</dt>
            <dd>
              <time dateTime={appt.startsAt}>
                {new Date(appt.startsAt).toLocaleString()}
              </time>
              {" – "}
              <time dateTime={appt.endsAt}>
                {new Date(appt.endsAt).toLocaleTimeString()}
              </time>
            </dd>
          </div>
        </dl>
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
            {new Date(offer.expiresAt).toLocaleString()}
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
            <MapPin aria-hidden="true" className="size-4 text-muted-foreground" />
            <dt className="sr-only">Zone</dt>
            <dd>{zoneLabels[offer.slot.zone] ?? offer.slot.zone}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Clock aria-hidden="true" className="size-4 text-muted-foreground" />
            <dt className="sr-only">Date and time</dt>
            <dd>
              <time dateTime={offer.slot.startsAt}>
                {new Date(offer.slot.startsAt).toLocaleString()}
              </time>
              {" – "}
              <time dateTime={offer.slot.endsAt}>
                {new Date(offer.slot.endsAt).toLocaleTimeString()}
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
        <h2 className="font-sans text-2xl font-medium">You are on the waitlist</h2>
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
        {actionMessage ? (
          <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
            {actionMessage}
          </p>
        ) : null}
        <Button
          className="mt-6"
          disabled={isSubmitting}
          onClick={handleLeaveWaitlist}
          type="button"
          variant="outline"
        >
          {isSubmitting ? "Processing..." : "Leave waitlist"}
        </Button>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border p-6 sm:p-8">
      <h2 className="font-sans text-2xl font-medium">
        Set your appointment preferences
      </h2>
      <p className="mt-3 leading-7 text-muted-foreground">
        Choose up to three Delhi test zones and how you would like to be
        notified when a slot opens.
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
          {isSubmitting ? "Saving..." : "Save preferences and join waitlist"}
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
