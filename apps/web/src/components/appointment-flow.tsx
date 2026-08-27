import { useServerFn } from "@tanstack/react-start"
import { useEffect, useState } from "react"
import type { FormEvent } from "react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  acceptAppointmentOffer,
  leaveAppointmentWaitlist,
  readAppointmentJourney,
  rejectAppointmentOffer,
  saveAppointmentPreferences,
} from "../server-functions/appointment"

const zones = [
  { value: "CENTRAL_DELHI", label: "Central Delhi" },
  { value: "EAST_DELHI", label: "East Delhi" },
  { value: "NORTH_DELHI", label: "North Delhi" },
  { value: "SOUTH_DELHI", label: "South Delhi" },
] as const

type Zone = (typeof zones)[number]["value"]
type Journey = Extract<
  Awaited<ReturnType<typeof readAppointmentJourney>>,
  { kind: "found" }
>

type AppointmentFlowProps = {
  applicationNumber?: string
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
  })
}

function AppointmentFlow({
  applicationNumber: initialNumber = "",
}: AppointmentFlowProps) {
  const readJourney = useServerFn(readAppointmentJourney)
  const savePreferences = useServerFn(saveAppointmentPreferences)
  const leaveWaitlist = useServerFn(leaveAppointmentWaitlist)
  const acceptOffer = useServerFn(acceptAppointmentOffer)
  const rejectOffer = useServerFn(rejectAppointmentOffer)
  const [applicationNumber, setApplicationNumber] = useState(initialNumber)
  const [journey, setJourney] = useState<Journey>()
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedZones, setSelectedZones] = useState<Zone[]>([])
  const [channels, setChannels] = useState<Array<"SMS" | "EMAIL">>(["SMS"])

  async function refresh(reference = applicationNumber) {
    const normalizedReference = reference.trim().toUpperCase()
    if (!normalizedReference) {
      setMessage("Enter your permanent-licence application reference.")
      return
    }
    setIsLoading(true)
    try {
      const response = await readJourney({
        data: { applicationNumber: normalizedReference },
      })
      if (response.kind === "found") {
        setJourney(response)
        setSelectedZones(response.preferences.zones as Zone[])
        setChannels(response.preferences.notificationChannels)
        setMessage("")
      } else {
        setJourney(undefined)
        setMessage(response.message)
      }
    } catch {
      setJourney(undefined)
      setMessage("Appointment service is temporarily unavailable.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!journey?.offer) return
    const refreshOnFocus = () => void refresh()
    const interval = window.setInterval(refreshOnFocus, 60_000)
    window.addEventListener("focus", refreshOnFocus)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", refreshOnFocus)
    }
  }, [journey?.offer, applicationNumber])

  function updateZone(index: number, value: string) {
    setSelectedZones((current) => {
      const next = [...current]
      if (value) next[index] = value as Zone
      else next.splice(index, 1)
      return [...new Set(next)].slice(0, 3)
    })
  }

  function toggleChannel(channel: "SMS" | "EMAIL") {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel]
    )
  }

  async function handlePreferenceSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!journey || selectedZones.length === 0 || channels.length === 0) {
      setMessage("Choose at least one zone and one notification preference.")
      return
    }
    setIsSaving(true)
    try {
      const result = await savePreferences({
        data: {
          applicationNumber: journey.applicationNumber,
          idempotencyKey: crypto.randomUUID(),
          notificationChannels: channels,
          zones: selectedZones,
        },
      })
      if (result.kind === "saved") {
        setMessage("Your appointment preferences were saved.")
        await refresh(journey.applicationNumber)
      } else {
        setMessage(result.message)
      }
    } catch {
      setMessage("Appointment service is temporarily unavailable.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleWaitlistAction(action: "leave" | "accept" | "reject") {
    if (!journey) return
    setIsSaving(true)
    try {
      if (action === "leave") {
        const result = await leaveWaitlist({
          data: {
            applicationNumber: journey.applicationNumber,
            idempotencyKey: crypto.randomUUID(),
          },
        })
        setMessage(
          result.kind === "left"
            ? "You left the appointment waitlist."
            : result.message
        )
      } else if (journey.offer) {
        const respond = action === "accept" ? acceptOffer : rejectOffer
        const result = await respond({
          data: {
            applicationNumber: journey.applicationNumber,
            idempotencyKey: crypto.randomUUID(),
            offerId: journey.offer.id,
          },
        })
        setMessage(
          result.kind === "confirmed"
            ? "Your driving-test appointment is confirmed."
            : result.kind === "rejected"
              ? "The appointment offer was declined."
              : result.message
        )
      }
      await refresh(journey.applicationNumber)
    } catch {
      setMessage("Appointment service is temporarily unavailable.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <h2 className="font-sans text-2xl font-semibold">
        Your driving-test appointment
      </h2>
      <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
        Enter the reference from your permanent-licence application to choose
        appointment preferences or respond to an offer.
      </p>

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          void refresh()
        }}
      >
        <label className="sr-only" htmlFor="appointment-reference">
          Permanent-licence application reference
        </label>
        <input
          className="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-base"
          id="appointment-reference"
          onChange={(event) =>
            setApplicationNumber(event.target.value.toUpperCase())
          }
          placeholder="Application reference"
          value={applicationNumber}
        />
        <Button className="h-11" disabled={isLoading} type="submit">
          {isLoading ? "Checking..." : "Check appointment"}
        </Button>
      </form>

      <p
        aria-live="polite"
        className="mt-4 text-sm text-muted-foreground"
        role="status"
      >
        {message}
      </p>

      {isLoading && !journey ? <AppointmentSkeleton /> : null}
      {journey ? (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">
            Application reference: {journey.applicationNumber}
          </p>
          {journey.confirmedAppointment ? (
            <ConfirmedAppointment journey={journey} />
          ) : journey.offer ? (
            <AppointmentOffer
              disabled={isSaving}
              journey={journey}
              onRespond={handleWaitlistAction}
            />
          ) : (
            <AppointmentPreferences
              channels={channels}
              disabled={isSaving}
              journey={journey}
              onSave={handlePreferenceSave}
              onToggleChannel={toggleChannel}
              onUpdateZone={updateZone}
              selectedZones={selectedZones}
            />
          )}
          {journey.state === "WAITLISTED" || journey.state === "COOLDOWN" ? (
            <Button
              disabled={isSaving}
              onClick={() => void handleWaitlistAction("leave")}
              type="button"
              variant="outline"
            >
              Leave waitlist
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function AppointmentPreferences({
  channels,
  disabled,
  journey,
  onSave,
  onToggleChannel,
  onUpdateZone,
  selectedZones,
}: {
  channels: Array<"SMS" | "EMAIL">
  disabled: boolean
  journey: Journey
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onToggleChannel: (channel: "SMS" | "EMAIL") => void
  onUpdateZone: (index: number, value: string) => void
  selectedZones: Zone[]
}) {
  const waitingCopy =
    journey.state === "WAITLISTED"
      ? "You are on the waitlist. You can update your preferences below."
      : "Choose up to three Delhi zones in order of preference."
  return (
    <form className="space-y-6" onSubmit={(event) => void onSave(event)}>
      <div>
        <h3 className="text-lg font-semibold">Appointment preferences</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {waitingCopy}
        </p>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">Preferred test zones</legend>
        <div className="mt-3 space-y-3">
          {[0, 1, 2].map((index) => (
            <label className="block" key={index}>
              <span className="mb-1.5 block text-sm text-muted-foreground">
                Preference {index + 1}
                {index === 0 ? " (required)" : ""}
              </span>
              <select
                className="h-11 w-full rounded-lg border border-input bg-background px-3"
                disabled={disabled}
                onChange={(event) => onUpdateZone(index, event.target.value)}
                required={index === 0}
                value={selectedZones[index] ?? ""}
              >
                <option value="">Select a zone</option>
                {zones.map((zone) => (
                  <option
                    disabled={
                      selectedZones.includes(zone.value) &&
                      selectedZones[index] !== zone.value
                    }
                    key={zone.value}
                    value={zone.value}
                  >
                    {zone.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">
          Offer notification preference
        </legend>
        <div className="mt-3 flex flex-wrap gap-4">
          {(["SMS", "EMAIL"] as const).map((channel) => (
            <label className="flex min-h-11 items-center gap-2" key={channel}>
              <input
                checked={channels.includes(channel)}
                disabled={disabled}
                onChange={() => onToggleChannel(channel)}
                type="checkbox"
              />
              {channel === "SMS" ? "SMS" : "Email"}
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          DigiLicense records this notification only; no SMS, email, or
          government service is contacted.
        </p>
      </fieldset>
      <Button
        className="h-11 w-full sm:w-auto"
        disabled={disabled}
        type="submit"
      >
        {disabled ? "Saving..." : "Save preferences"}
      </Button>
    </form>
  )
}

function AppointmentOffer({
  disabled,
  journey,
  onRespond,
}: {
  disabled: boolean
  journey: Journey
  onRespond: (action: "accept" | "reject") => Promise<void>
}) {
  const offer = journey.offer
  if (!offer) return null
  const expired = new Date(offer.expiresAt).getTime() <= Date.now()
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
      <p className="text-sm font-semibold text-primary">
        Appointment offer available
      </p>
      <h3 className="mt-2 text-xl font-semibold">
        {zones.find((zone) => zone.value === offer.slot.zone)?.label ??
          offer.slot.zone}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        <time dateTime={offer.slot.startsAt}>
          {formatDateTime(offer.slot.startsAt)}
        </time>{" "}
        to{" "}
        <time dateTime={offer.slot.endsAt}>
          {formatDateTime(offer.slot.endsAt)}
        </time>
      </p>
      <p className="mt-4 text-sm">
        Respond by{" "}
        <time dateTime={offer.expiresAt}>
          {formatDateTime(offer.expiresAt)}
        </time>
        .
      </p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        DigiLicense records this notification only; no SMS, email, or government
        service is contacted.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button
          disabled={disabled || expired}
          onClick={() => void onRespond("accept")}
          type="button"
        >
          Accept appointment
        </Button>
        <Button
          disabled={disabled || expired}
          onClick={() => void onRespond("reject")}
          type="button"
          variant="outline"
        >
          Decline offer
        </Button>
      </div>
      {expired ? (
        <p className="mt-3 text-sm text-muted-foreground">
          This offer has expired. Checking for the latest appointment state.
        </p>
      ) : null}
    </div>
  )
}

function ConfirmedAppointment({ journey }: { journey: Journey }) {
  const appointment = journey.confirmedAppointment
  if (!appointment) return null
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
      <p className="text-sm font-semibold text-primary">
        Appointment confirmed
      </p>
      <h3 className="mt-2 text-xl font-semibold">
        {zones.find((zone) => zone.value === appointment.zone)?.label ??
          appointment.zone}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        <time dateTime={appointment.startsAt}>
          {formatDateTime(appointment.startsAt)}
        </time>{" "}
        to{" "}
        <time dateTime={appointment.endsAt}>
          {formatDateTime(appointment.endsAt)}
        </time>
      </p>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Bring the documents listed with your application and arrive before your
        appointment time. DigiLicense recorded this appointment only; no
        government service was contacted.
      </p>
    </div>
  )
}

function AppointmentSkeleton() {
  return (
    <div aria-busy="true" className="mt-6 space-y-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

export { AppointmentFlow }
