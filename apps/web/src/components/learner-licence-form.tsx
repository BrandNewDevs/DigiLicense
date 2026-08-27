import { useEffect, useRef, useState } from "react"
import { CalendarIcon, Info } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  addressProofOptions,
  calculateCompletedYears,
  delhiZones,
  getVehicleClass,
  identityProofOptions,
  minimumLearnerAgeYears,
  vehicleClasses,
} from "../lib/learner-licence"
import { getApplicationStatusLabel } from "../lib/application-status"
import { learnerLicenceDraftPayloadSchema } from "../validation/learner-licence"
import {
  readLearnerLicenceState,
  saveLearnerLicenceDraft,
  submitLearnerLicenceApplication,
} from "../server-functions/learner-licence"

type FormValues = {
  fullName: string
  dateOfBirth: string
  vehicleClass: string
  zone: string
  identityProofType: string
  addressProofType: string
}

type FieldName = keyof FormValues

type FieldErrors = Partial<Record<FieldName, string>>

const emptyValues: FormValues = {
  addressProofType: "",
  dateOfBirth: "",
  fullName: "",
  identityProofType: "",
  vehicleClass: "",
  zone: "",
}

const fieldLabels: Record<FieldName, string> = {
  addressProofType: "Address proof",
  dateOfBirth: "Date of birth",
  fullName: "Full name",
  identityProofType: "Identity proof",
  vehicleClass: "Vehicle class",
  zone: "Preferred Delhi zone",
}

const inputClassName =
  "h-11 w-full rounded-lg border border-input px-3 text-base disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"

function dateToInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function formatDateInput(isoDate: string) {
  if (!isoDate) return ""

  const [year, month, day] = isoDate.split("-")
  return `${day}/${month}/${year}`
}

function parseDateInput(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return undefined

  const [, day, month, year] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))

  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return undefined
  }

  return date
}

function formatDate(isoDateTime: string) {
  return new Date(isoDateTime).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function LearnerLicenceForm() {
  const readState = useServerFn(readLearnerLicenceState)
  const persistDraft = useServerFn(saveLearnerLicenceDraft)
  const submitApplication = useServerFn(submitLearnerLicenceApplication)

  const [phase, setPhase] = useState<
    | "active"
    | "authentication-required"
    | "form"
    | "loading"
    | "submitted"
    | "unavailable"
  >("loading")
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [declarationAccepted, setDeclarationAccepted] = useState(false)
  const [blockedFieldMessage, setBlockedFieldMessage] = useState<string>()
  const [dateOfBirthInput, setDateOfBirthInput] = useState("")
  const [calendarMonth, setCalendarMonth] = useState<Date>()
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string>()
  const [submitError, setSubmitError] = useState<{
    kind: string
    message: string
  }>()
  const [announcement, setAnnouncement] = useState("")

  const activeApplicationRef = useRef<{
    applicationNumber: string
    status: string
    nextAction: string
    submittedAt: string
  } | null>(null)

  const submittedNumberRef = useRef("")
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let cancelled = false

    async function loadInitialState() {
      try {
        const result = await readState()

        if (cancelled) return

        if (result.kind === "ready") {
          if (result.activeApplication) {
            activeApplicationRef.current = result.activeApplication
            setPhase("active")
            return
          }

          setValues((current) => ({
            ...current,
            ...result.draft?.payload,
          }))
          const draftDateOfBirth = result.draft?.payload.dateOfBirth ?? ""
          setDateOfBirthInput(formatDateInput(draftDateOfBirth))
          setCalendarMonth(
            draftDateOfBirth
              ? new Date(`${draftDateOfBirth}T00:00:00`)
              : undefined
          )
          setPhase("form")
          return
        }

        setPhase(result.kind)
      } catch {
        if (!cancelled) setPhase("unavailable")
      }
    }

    void loadInitialState()

    return () => {
      cancelled = true
    }
  }, [readState])

  useEffect(() => {
    if (phase === "submitted") {
      headingRef.current?.focus()
    }
  }, [phase])

  function announce(message: string) {
    setAnnouncement(message)
  }

  function validateFields(fields: readonly FieldName[]): FieldErrors {
    const nextErrors: FieldErrors = {}

    for (const field of fields) {
      if (!values[field]) {
        nextErrors[field] = `${fieldLabels[field]} is required to continue.`
        continue
      }

      if (
        !learnerLicenceDraftPayloadSchema.safeParse({
          [field]: values[field],
        }).success
      ) {
        nextErrors[field] = `${fieldLabels[field]} has an invalid format.`
      }
    }

    // A date of birth that cannot hold any learner's-licence class is
    // rejected immediately, even before a vehicle class is chosen. Future
    // dates produce a negative age and fail the same check.
    if (values.dateOfBirth && !nextErrors.dateOfBirth) {
      const completedYears = calculateCompletedYears(
        values.dateOfBirth,
        new Date()
      )

      if (
        completedYears !== undefined &&
        completedYears < minimumLearnerAgeYears
      ) {
        nextErrors.dateOfBirth = `The youngest eligible age for any learner's licence class is ${minimumLearnerAgeYears}.`
      }
    }

    return nextErrors
  }

  function checkEligibility(): FieldErrors {
    const minimumAge = getVehicleClass(values.vehicleClass)?.minimumAgeYears

    if (!minimumAge || !values.dateOfBirth) return {}

    const completedYears = calculateCompletedYears(
      values.dateOfBirth,
      new Date()
    )

    if (completedYears === undefined || completedYears >= minimumAge) {
      return {}
    }

    return {
      dateOfBirth: `This vehicle class needs a minimum age of ${minimumAge} when you apply.`,
    }
  }

  async function handleSaveDraft() {
    setIsSavingDraft(true)

    try {
      const payload = Object.fromEntries(
        Object.entries(values).filter((entry) => entry[1] !== "")
      )

      const result = await persistDraft({ data: payload })

      if (result.kind === "saved") {
        setDraftSavedAt(result.savedAt)
        announce(
          `Draft saved. The service keeps drafts for seven days after each save.`
        )
      }
    } catch {
      announce("The draft could not be saved right now.")
    } finally {
      setIsSavingDraft(false)
    }
  }

  async function handleSubmit() {
    const nextErrors = {
      ...validateFields([
        "fullName",
        "dateOfBirth",
        "vehicleClass",
        "zone",
        "identityProofType",
        "addressProofType",
      ]),
      ...checkEligibility(),
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      const message = "Complete the required details before submitting."
      setBlockedFieldMessage(message)
      announce(message)
      return
    }

    if (!declarationAccepted) {
      const message = "Accept the declaration before submitting."
      setBlockedFieldMessage(message)
      announce(message)
      return
    }

    setIsSubmitting(true)
    setSubmitError(undefined)

    try {
      const result = await submitApplication({
        data: { declarationAccepted: true as const, ...values },
      })

      if (result.kind === "submitted") {
        submittedNumberRef.current = result.applicationNumber
        announce("Application submitted.")
        setPhase("submitted")
        return
      }

      if (result.kind === "duplicate-active") {
        try {
          const refreshed = await readState()

          if (refreshed.kind === "ready" && refreshed.activeApplication) {
            activeApplicationRef.current = refreshed.activeApplication
          }
        } catch {
          // Fall through to the active panel without fresh details.
        }

        announce(result.message)
        setPhase("active")
        return
      }

      // A ended mock session is terminal: the workflow cannot continue on
      // this page, so switch to the sign-in panel.
      if (result.kind === "authentication-required") {
        announce(result.message)
        setPhase("authentication-required")
        return
      }

      // Everything else (rate-limited, unavailable, eligibility-not-met,
      // invalid-submission) is recoverable. The form state is preserved and
      // the reason is shown where a sighted applicant can act on it.
      setSubmitError({ kind: result.kind, message: result.message })
    } catch {
      setSubmitError({
        kind: "network-error",
        message:
          "The submission could not be completed. Check your answers and try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateValue(field: FieldName, value: string) {
    setBlockedFieldMessage(undefined)
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function explainLockedField(message: string) {
    setBlockedFieldMessage(message)
    announce(message)
  }

  if (phase === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label="Loading learner's licence progress"
        className="rounded-lg border bg-card p-6 sm:p-8"
      >
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-4 h-4 w-full max-w-xl" />
        <Skeleton className="mt-2 h-4 w-4/5 max-w-lg" />
        <Skeleton className="mt-8 h-11 w-full" />
        <Skeleton className="mt-4 h-11 w-full" />
      </section>
    )
  }

  if (phase === "authentication-required") {
    return (
      <section className="rounded-xl border border-border p-6 sm:p-8">
        <h2 className="font-sans text-2xl font-medium">Sign in required</h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Your applicant session ended. Sign in again to continue the learner's
          licence workflow.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-foreground px-5 text-base font-medium text-foreground"
          search={{ returnTo: "/services/learner-licence" }}
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
        <h2 className="mt-5 font-sans text-2xl font-medium">
          Service unavailable
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          The learner's licence service could not be loaded. Nothing was lost.
          Reload the page to try again.
        </p>
      </section>
    )
  }

  if (phase === "active") {
    const activeApplication = activeApplicationRef.current

    return (
      <section
        aria-labelledby="active-application-title"
        className="rounded-xl border border-border p-6 sm:p-8"
      >
        <p className="mt-5 text-sm font-medium text-muted-foreground">
          Application already in progress
        </p>
        <h2
          className="mt-2 font-sans text-2xl font-medium"
          id="active-application-title"
        >
          You have an open learner's licence application
        </h2>
        {activeApplication ? (
          <>
            <dl className="mt-6 space-y-4 rounded-2xl border border-border p-5">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Reference number
                </dt>
                <dd className="mt-1 font-mono text-lg font-medium">
                  {activeApplication.applicationNumber}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Current status
                </dt>
                <dd className="mt-1">
                  {getApplicationStatusLabel(activeApplication.status)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Next action for you
                </dt>
                <dd className="mt-1">{activeApplication.nextAction}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Submitted on
                </dt>
                <dd className="mt-1">
                  {formatDate(activeApplication.submittedAt)}
                </dd>
              </div>
            </dl>
            {activeApplication.status === "TEST_PENDING" ? (
              <Link
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                params={{ serviceId: "learner-test" }}
                to="/services/$serviceId"
              >
                Start learner's test
              </Link>
            ) : null}
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Only one learner's licence application can be open at a time. This
              rule is enforced by the database, not just this page.
            </p>
          </>
        ) : (
          <p className="mt-5 leading-7 text-muted-foreground">
            We could not reload its details. The form is unavailable to avoid a
            second submission. Reload the page to view the application.
          </p>
        )}
      </section>
    )
  }

  if (phase === "submitted") {
    return (
      <section
        aria-labelledby="submission-complete-title"
        className="rounded-xl border border-border p-6 sm:p-8"
      >
        <p className="mt-6 text-sm font-medium text-muted-foreground">
          Submission complete
        </p>
        <h2
          className="mt-2 font-sans text-2xl font-medium"
          id="submission-complete-title"
          ref={headingRef}
          tabIndex={-1}
        >
          Learner's licence application received
        </h2>
        <dl className="mt-6 space-y-4 rounded-2xl border border-border p-5">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Reference number
            </dt>
            <dd className="mt-1 font-mono text-lg font-medium">
              {submittedNumberRef.current}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Current status
            </dt>
            <dd className="mt-1">Checks complete</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Next action for you
            </dt>
            <dd className="mt-1">
              Your application is ready for the learner's test.
            </dd>
          </div>
        </dl>
        <Link
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          params={{ serviceId: "learner-test" }}
          to="/services/$serviceId"
        >
          Start learner's test
        </Link>
        <ul className="mt-6 space-y-3">
          {[
            "Three document records were created for this application.",
            "The service completed its automatic checks.",
            "Your saved draft was closed so it cannot create a second application.",
          ].map((item) => (
            <li className="flex gap-3 leading-6" key={item}>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm leading-6 text-muted-foreground">
          This created DigiLicense records only. No government service was
          contacted and no fee was collected.
        </p>
      </section>
    )
  }

  const isPersonalComplete =
    Object.keys(validateFields(["fullName", "dateOfBirth"])).length === 0
  const isRequestComplete =
    isPersonalComplete &&
    Object.keys(validateFields(["vehicleClass", "zone"])).length === 0 &&
    Object.keys(checkEligibility()).length === 0
  const isDocumentsComplete =
    isRequestComplete &&
    Object.keys(validateFields(["identityProofType", "addressProofType"]))
      .length === 0

  return (
    <form
      aria-describedby="learner-form-note"
      className="rounded-xl border border-border p-6 sm:p-8"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void handleSubmit()
      }}
    >
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <h2
        className="font-sans text-2xl font-medium"
        ref={headingRef}
        tabIndex={-1}
      >
        Learner's licence application
      </h2>
      <p
        className="mt-3 text-sm leading-6 text-muted-foreground"
        id="learner-form-note"
      >
        Complete each section in order. Later sections unlock when the required
        information above is complete.
      </p>
      {blockedFieldMessage ? (
        <p
          className="mt-4 flex items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground"
          role="status"
        >
          <Info aria-hidden="true" className="size-4 shrink-0" />
          {blockedFieldMessage}
        </p>
      ) : null}

      <div className="mt-7 space-y-5">
        <>
          <div className="scroll-mt-24" id="learner-personal-details">
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="ll-fullName"
            >
              {fieldLabels.fullName}
            </label>
            <input
              aria-describedby={
                errors.fullName ? "ll-fullName-error" : undefined
              }
              aria-invalid={errors.fullName ? true : undefined}
              autoComplete="off"
              className={inputClassName}
              id="ll-fullName"
              maxLength={80}
              name="fullName"
              onChange={(event) => updateValue("fullName", event.target.value)}
              type="text"
              value={values.fullName}
            />
            {errors.fullName ? (
              <p
                className="mt-2 text-sm text-destructive"
                id="ll-fullName-error"
                role="alert"
              >
                {errors.fullName}
              </p>
            ) : null}
          </div>
          <Field>
            <FieldLabel htmlFor="ll-dateOfBirth">
              {fieldLabels.dateOfBirth}
            </FieldLabel>
            <div className="mt-2 flex gap-3">
              <input
                aria-describedby={
                  errors.dateOfBirth ? "ll-dateOfBirth-error" : undefined
                }
                aria-invalid={errors.dateOfBirth ? true : undefined}
                autoComplete="bday"
                className={inputClassName}
                id="ll-dateOfBirth"
                inputMode="numeric"
                onChange={(event) => {
                  const nextValue = event.target.value
                  setDateOfBirthInput(nextValue)
                  const date = parseDateInput(nextValue)

                  updateValue("dateOfBirth", date ? dateToInputValue(date) : "")
                  if (date) setCalendarMonth(date)
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    setIsDatePickerOpen(true)
                  }
                }}
                placeholder="DD/MM/YYYY"
                value={dateOfBirthInput}
              />
              <Popover
                modal
                onOpenChange={setIsDatePickerOpen}
                open={isDatePickerOpen}
              >
                <PopoverTrigger
                  render={
                    <Button
                      aria-label="Select date of birth"
                      className="size-11 shrink-0"
                      type="button"
                      variant="outline"
                    >
                      <CalendarIcon />
                      <span className="sr-only">Select date of birth</span>
                    </Button>
                  }
                />
                <PopoverContent
                  align="end"
                  className="w-auto overflow-hidden p-0"
                  sideOffset={10}
                >
                  <Calendar
                    captionLayout="dropdown"
                    disabled={{ after: new Date() }}
                    endMonth={new Date()}
                    month={calendarMonth}
                    mode="single"
                    onMonthChange={setCalendarMonth}
                    startMonth={new Date(new Date().getFullYear() - 100, 0)}
                    onSelect={(date) => {
                      if (!date) return
                      const nextDate = dateToInputValue(date)
                      updateValue("dateOfBirth", nextDate)
                      setDateOfBirthInput(formatDateInput(nextDate))
                      setCalendarMonth(date)
                      setIsDatePickerOpen(false)
                    }}
                    selected={
                      values.dateOfBirth
                        ? new Date(`${values.dateOfBirth}T00:00:00`)
                        : undefined
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>
            {errors.dateOfBirth ? (
              <p
                className="mt-2 text-sm text-destructive"
                id="ll-dateOfBirth-error"
                role="alert"
              >
                {errors.dateOfBirth}
              </p>
            ) : null}
          </Field>
        </>

        <>
          {errors.dateOfBirth ? (
            <div
              className="rounded-xl border border-destructive/40 p-4 text-sm leading-6 text-destructive"
              role="alert"
            >
              {errors.dateOfBirth}
            </div>
          ) : null}
          <fieldset
            aria-disabled={!isPersonalComplete}
            className={`scroll-mt-24 ${!isPersonalComplete ? "opacity-60" : ""}`}
            id="learner-vehicle-and-zone"
          >
            <legend className="mb-2 block text-sm font-medium">
              {fieldLabels.vehicleClass}
            </legend>
            <div className="space-y-2">
              {vehicleClasses.map((option) => (
                <label
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-input px-3 text-base has-checked:border-ring"
                  key={option.value}
                >
                  <input
                    aria-disabled={!isPersonalComplete}
                    checked={values.vehicleClass === option.value}
                    name="vehicleClass"
                    onChange={() => {
                      if (!isPersonalComplete) {
                        explainLockedField(
                          "Complete your full name and date of birth before choosing a vehicle class."
                        )
                        return
                      }

                      updateValue("vehicleClass", option.value)
                    }}
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                  <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                      {option.code}
                    </span>
                    <span>Minimum age {option.minimumAgeYears}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.vehicleClass ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {errors.vehicleClass}
              </p>
            ) : null}
          </fieldset>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="ll-zone">
              {fieldLabels.zone}
            </label>
            <select
              aria-disabled={!isPersonalComplete}
              className={inputClassName}
              id="ll-zone"
              name="zone"
              onChange={(event) => {
                if (!isPersonalComplete) {
                  explainLockedField(
                    "Complete your full name and date of birth before choosing a Delhi zone."
                  )
                  return
                }

                updateValue("zone", event.target.value)
              }}
              value={values.zone}
            >
              <option value="">Select an option</option>
              {delhiZones.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.zone ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {errors.zone}
              </p>
            ) : null}
          </div>
        </>

        <>
          <div
            aria-disabled={!isRequestComplete}
            className={!isRequestComplete ? "opacity-60" : undefined}
            id="learner-proof-selections"
          >
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="ll-identityProofType"
            >
              {fieldLabels.identityProofType}
            </label>
            <select
              aria-disabled={!isRequestComplete}
              className={inputClassName}
              id="ll-identityProofType"
              name="identityProofType"
              onChange={(event) => {
                if (!isRequestComplete) {
                  explainLockedField(
                    "Choose a vehicle class and Delhi zone before selecting identity proof."
                  )
                  return
                }

                updateValue("identityProofType", event.target.value)
              }}
              value={values.identityProofType}
            >
              <option value="">Select an option</option>
              {identityProofOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.identityProofType ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {errors.identityProofType}
              </p>
            ) : null}
          </div>
          <div className={!isRequestComplete ? "opacity-60" : undefined}>
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="ll-addressProofType"
            >
              {fieldLabels.addressProofType}
            </label>
            <select
              aria-disabled={!isRequestComplete}
              className={inputClassName}
              id="ll-addressProofType"
              name="addressProofType"
              onChange={(event) => {
                if (!isRequestComplete) {
                  explainLockedField(
                    "Choose a vehicle class and Delhi zone before selecting address proof."
                  )
                  return
                }

                updateValue("addressProofType", event.target.value)
              }}
              value={values.addressProofType}
            >
              <option value="">Select an option</option>
              {addressProofOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.addressProofType ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {errors.addressProofType}
              </p>
            ) : null}
          </div>
        </>

        <>
          <dl
            className="scroll-mt-24 space-y-4 rounded-2xl border border-border p-5"
            id="learner-review"
          >
            {(Object.keys(fieldLabels) as FieldName[]).map((field) => (
              <div key={field}>
                <dt className="text-sm font-medium text-muted-foreground">
                  {fieldLabels[field]}
                </dt>
                <dd className="mt-1">
                  {field === "identityProofType"
                    ? (identityProofOptions.find(
                        (option) => option.value === values[field]
                      )?.label ?? "Not provided")
                    : field === "addressProofType"
                      ? (addressProofOptions.find(
                          (option) => option.value === values[field]
                        )?.label ?? "Not provided")
                      : field === "vehicleClass"
                        ? (getVehicleClass(values[field])?.label ??
                          "Not provided")
                        : field === "zone"
                          ? (delhiZones.find(
                              (option) => option.value === values[field]
                            )?.label ?? "Not provided")
                          : values[field] || "Not provided"}
                </dd>
              </div>
            ))}
          </dl>
          <label className="flex items-start gap-3 rounded-xl border border-border p-4">
            <input
              aria-disabled={!isDocumentsComplete}
              checked={declarationAccepted}
              className={`mt-1 size-5 ${!isDocumentsComplete ? "opacity-60" : ""}`}
              onChange={(event) => {
                if (!isDocumentsComplete) {
                  explainLockedField(
                    "Select both proof types before confirming the declaration."
                  )
                  return
                }

                setBlockedFieldMessage(undefined)
                setDeclarationAccepted(event.target.checked)
              }}
              type="checkbox"
            />
            <span className="leading-6">
              I confirm these are the details for this application, and I
              understand nothing is sent to a government service.
            </span>
          </label>
        </>
      </div>

      {draftSavedAt ? (
        <p className="mt-5 text-sm text-muted-foreground" role="status">
          Draft saved at {draftSavedAt.slice(11, 16)}. It stays available for
          seven days after each save.
        </p>
      ) : null}

      {submitError ? (
        <div
          className="mt-5 rounded-xl border border-destructive/40 p-4 text-sm leading-6 text-destructive"
          role="alert"
        >
          <p className="font-medium">{submitError.message}</p>
          {submitError.kind === "rate-limited" ? (
            <p className="mt-1 text-destructive/80">
              Your answers are still here. Try again once the wait passes.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          aria-describedby="learner-form-note"
          aria-disabled={isSubmitting || !declarationAccepted}
          className={`h-11 flex-1 text-base ${!declarationAccepted ? "opacity-60" : ""}`}
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Submitting..." : "Submit application"}
        </Button>
        <Button
          className="h-11 px-5 text-base"
          disabled={isSavingDraft}
          onClick={() => void handleSaveDraft()}
          type="button"
          variant="outline"
        >
          {isSavingDraft ? "Saving..." : "Save draft"}
        </Button>
      </div>
    </form>
  )
}

export { LearnerLicenceForm }
