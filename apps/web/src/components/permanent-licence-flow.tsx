import { useForm } from "@tanstack/react-form"
import { useServerFn } from "@tanstack/react-start"
import { useEffect, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import {
  readPermanentLicenceState,
  submitPermanentLicenceApplication,
} from "../server-functions/permanent-licence"

type PermanentState =
  | Awaited<ReturnType<typeof readPermanentLicenceState>>
  | Awaited<ReturnType<typeof submitPermanentLicenceApplication>>

const vehicleClasses = [
  { value: "MOTORCYCLE_WITHOUT_GEAR", label: "Motorcycle without gear" },
  { value: "MOTORCYCLE_WITH_GEAR", label: "Motorcycle with gear" },
  { value: "LIGHT_MOTOR_VEHICLE", label: "Car" },
] as const

function PermanentLicenceFlow() {
  const readState = useServerFn(readPermanentLicenceState)
  const submit = useServerFn(submitPermanentLicenceApplication)
  const [state, setState] = useState<PermanentState>()
  const idempotencyKeyRef = useRef(crypto.randomUUID())
  const form = useForm({
    defaultValues: {
      vehicleClass:
        "LIGHT_MOTOR_VEHICLE" as (typeof vehicleClasses)[number]["value"],
    },
    onSubmit: async ({ value }) => {
      const result = await submit({
        data: {
          idempotencyKey: idempotencyKeyRef.current,
          vehicleClass: value.vehicleClass,
        },
      })
      setState(result)
    },
  })

  useEffect(() => {
    void readState({ data: undefined }).then((result) => {
      setState(result)
      if (result.kind === "eligible") {
        form.reset({ vehicleClass: result.vehicleClass })
      }
    })
  }, [form, readState])

  if (!state)
    return <p className="text-muted-foreground">Checking your eligibility...</p>

  if (state.kind === "eligible") {
    return (
      <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
        <p className="text-sm font-semibold text-[#b9550d]">
          You can apply now
        </p>
        <h2 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em]">
          Continue to your driving test
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Your learner's test was passed and the waiting period ended on{" "}
          {new Date(state.eligibleOn).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          .
        </p>
        <form
          className="mt-7 space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="vehicleClass">
            {(field) => (
              <div>
                <label
                  className="mb-2 block text-sm font-semibold"
                  htmlFor="permanent-vehicle-class"
                >
                  Vehicle class
                </label>
                <select
                  className="h-12 w-full rounded-xl border border-border bg-background px-3"
                  id="permanent-vehicle-class"
                  onChange={(event) =>
                    field.handleChange(
                      event.target
                        .value as (typeof vehicleClasses)[number]["value"]
                    )
                  }
                  value={field.state.value}
                >
                  {vehicleClasses.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>
          <form.Subscribe selector={(formState) => formState.isSubmitting}>
            {(isSubmitting) => (
              <Button
                className="h-12 w-full rounded-full bg-black text-white hover:bg-black/80"
                disabled={isSubmitting}
                type="submit"
                variant="solid"
              >
                {isSubmitting ? "Submitting..." : "Submit application"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </section>
    )
  }

  if (state.kind === "waiting-period") {
    return (
      <StateCard
        title="Your application opens soon"
        detail={`${state.message} Eligible on ${new Date(state.eligibleOn).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`}
      />
    )
  }
  if (state.kind === "active-application" || state.kind === "submitted") {
    const detail =
      state.kind === "active-application"
        ? state.nextAction
        : "Your application is ready for driving-test appointment preferences."
    return (
      <StateCard
        title="Permanent-licence application in progress"
        detail={`${detail} Reference: ${state.applicationNumber}.`}
      />
    )
  }
  return (
    <StateCard
      title="Permanent-licence application unavailable"
      detail={state.message}
    />
  )
}

function StateCard({ detail, title }: { detail: string; title: string }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
      <h2 className="font-heading text-2xl font-semibold tracking-[-0.04em]">
        {title}
      </h2>
      <p className="mt-3 leading-7 text-muted-foreground">{detail}</p>
    </section>
  )
}

export { PermanentLicenceFlow }
