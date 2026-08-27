import { useForm } from "@tanstack/react-form"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { vehicleClasses } from "../lib/learner-licence"
import { useAssistantPublicContextOverride } from "../lib/assistant-public-context"
import {
  readPermanentLicenceState,
  submitPermanentLicenceApplication,
} from "../server-functions/permanent-licence"

type PermanentState =
  | Awaited<ReturnType<typeof readPermanentLicenceState>>
  | Awaited<ReturnType<typeof submitPermanentLicenceApplication>>

function PermanentLicenceFlow() {
  const readState = useServerFn(readPermanentLicenceState)
  const submit = useServerFn(submitPermanentLicenceApplication)
  const [state, setState] = useState<PermanentState>()
  useAssistantPublicContextOverride({
    reasonCode:
      state?.kind === "waiting-period"
        ? "WAITING_PERIOD_ACTIVE"
        : state &&
            state.kind !== "eligible" &&
            state.kind !== "active-application" &&
            state.kind !== "submitted"
          ? "ACTION_LOCKED"
          : "NONE",
  })
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
      if (result.kind === "vehicle-class-mismatch") {
        form.reset({ vehicleClass: result.vehicleClass })
        const refreshedState = await readState({ data: undefined })
        setState(refreshedState)
        return
      }
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

  if (!state) {
    return (
      <section
        aria-busy="true"
        aria-label="Checking permanent-licence eligibility"
        className="rounded-lg border bg-card p-6 sm:p-8"
      >
        <Skeleton className="h-7 w-64" />
        <Skeleton className="mt-4 h-4 w-full max-w-xl" />
        <Skeleton className="mt-2 h-4 w-3/4 max-w-lg" />
        <Skeleton className="mt-8 h-10 w-40" />
      </section>
    )
  }

  if (state.kind === "eligible") {
    return (
      <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <p className="text-sm font-semibold text-primary">You can apply now</p>
        <h2 className="mt-2 font-sans text-3xl font-semibold">
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
                      {item.label} ({item.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>
          <form.Subscribe selector={(formState) => formState.isSubmitting}>
            {(isSubmitting) => (
              <Button
                className="h-11 w-full rounded-lg"
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
        action={
          <Link
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            params={{ serviceId: "appointments" }}
            search={{ applicationNumber: state.applicationNumber }}
            to="/services/$serviceId"
          >
            Choose appointment preferences
          </Link>
        }
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
      {action}
    </section>
  )
}

export { PermanentLicenceFlow }
