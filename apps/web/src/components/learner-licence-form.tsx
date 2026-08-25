import { useEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"

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

const steps = [
  {
    checksEligibility: false,
    fields: ["fullName", "dateOfBirth"] as const,
    hint: "Use any name and birth date. Real identity details must never be entered.",
    title: "Personal details",
  },
  {
    checksEligibility: true,
    fields: ["vehicleClass", "zone"] as const,
    hint: "The class decides the minimum age, and the zone is where the test would run.",
    title: "Licence request",
  },
  {
    checksEligibility: false,
    fields: ["identityProofType", "addressProofType"] as const,
    hint: "No file upload exists here. Choosing an option records a document entry.",
    title: "Documents",
  },
]

const reviewStepIndex = steps.length

const totalStepCount = steps.length + 1

const fieldLabels: Record<FieldName, string> = {
  addressProofType: "Address proof",
  dateOfBirth: "Date of birth",
  fullName: "Full name",
  identityProofType: "Identity proof",
  vehicleClass: "Vehicle class",
  zone: "Preferred Delhi zone",
}

const inputClassName =
  "h-11 w-full rounded-lg border border-input px-3 text-base"

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
  const [stepIndex, setStepIndex] = useState(0)
  const [declarationAccepted, setDeclarationAccepted] = useState(false)
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
    if (phase === "form" || phase === "submitted") {
      headingRef.current?.focus()
    }
  }, [phase, stepIndex])

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
    if (
      values.dateOfBirth &&
      !nextErrors.dateOfBirth &&
      stepIndex === 0
    ) {
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

  function goToStep(nextStepIndex: number) {
    setStepIndex(nextStepIndex)
    setErrors({})
    setSubmitError(undefined)
    announce(
      nextStepIndex < reviewStepIndex
        ? `Step ${nextStepIndex + 1} of ${totalStepCount}: ${steps[nextStepIndex].title}`
        : `Step ${totalStepCount} of ${totalStepCount}: Review and declare`
    )
  }

  function handleContinue() {
    const stepDefinition = steps[stepIndex]

    const nextErrors = {
      ...validateFields(stepDefinition.fields),
      ...(stepDefinition.checksEligibility ? checkEligibility() : {}),
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      announce("Some details need attention before continuing.")
      return
    }

    goToStep(stepIndex + 1)
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
    // The server schema only accepts a literal true; this guard keeps the
    // checkbox meaningful on this side of the boundary too.
    if (!declarationAccepted) {
      announce("Accept the declaration before submitting.")
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
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  if (phase === "loading") {
    return (
      <section className="rounded-3xl border border-border p-6 sm:p-8">
        <p className="text-base leading-7 text-muted-foreground" role="status">
          Loading your learner's licence progress...
        </p>
      </section>
    )
  }

  if (phase === "authentication-required") {
    return (
      <section className="rounded-3xl border border-border p-6 sm:p-8">
        <h2 className="font-heading text-2xl font-medium tracking-[-0.04em]">
          Sign in required
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Your applicant session ended. Sign in again to continue the
          learner's licence workflow.
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
      <section className="rounded-3xl border border-border p-6 sm:p-8">
        <h2 className="mt-5 font-heading text-2xl font-medium tracking-[-0.04em]">
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
        className="rounded-3xl border border-border p-6 sm:p-8"
      >
        <p className="mt-5 text-sm font-medium text-muted-foreground">
          Application already in progress
        </p>
        <h2
          className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]"
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
        className="rounded-3xl border border-border p-6 sm:p-8"
      >
        <p className="mt-6 text-sm font-medium text-muted-foreground">
          Submission complete
        </p>
        <h2
          className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]"
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
          This created DigiLicense records only. No government
          service was contacted and no fee was collected.
        </p>
      </section>
    )
  }

  const isReviewStep = stepIndex === reviewStepIndex
  const currentStep = steps[stepIndex]
  const progressItems = [...steps.map((step) => step.title), "Review"]

  return (
    <form
      aria-describedby="learner-form-note"
      className="rounded-3xl border border-border p-6 sm:p-8"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void handleSubmit()
      }}
    >
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <p className="text-sm font-medium text-muted-foreground">
          Guided workflow
      </p>
      <h2
        className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]"
        ref={headingRef}
        tabIndex={-1}
      >
        {isReviewStep ? "Review and declare" : currentStep.title}
      </h2>

      <ol
        aria-label="Workflow progress"
        className="mt-5 flex flex-wrap gap-2 text-xs font-medium"
      >
        {progressItems.map((label, index) => (
          <li key={label}>
            {index === stepIndex ? (
              <span
                aria-current="step"
                className="rounded-full border border-border px-3 py-1.5 text-foreground"
              >
                {index + 1}. {label}
              </span>
            ) : (
              <span className="rounded-full border border-border px-3 py-1.5 text-muted-foreground">
                {index + 1}. {label}
              </span>
            )}
          </li>
        ))}
      </ol>

      {!isReviewStep ? (
        <p
          className="mt-5 text-sm leading-6 text-muted-foreground"
          id="learner-form-note"
        >
          {currentStep.hint}
        </p>
      ) : (
        <p
          className="mt-5 text-sm leading-6 text-muted-foreground"
          id="learner-form-note"
        >
          Check every answer. Submitting saves the application on the server
          and closes any saved draft.
        </p>
      )}

      <div className="mt-7 space-y-5">
        {!isReviewStep && stepIndex === 0 ? (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="ll-fullName">
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
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="ll-dateOfBirth">
                {fieldLabels.dateOfBirth}
              </label>
              <input
                aria-describedby={
                  errors.dateOfBirth ? "ll-dateOfBirth-error" : undefined
                }
                aria-invalid={errors.dateOfBirth ? true : undefined}
                className={inputClassName}
                id="ll-dateOfBirth"
                max={new Date().toISOString().slice(0, 10)}
                name="dateOfBirth"
                onChange={(event) =>
                  updateValue("dateOfBirth", event.target.value)
                }
                type="date"
                value={values.dateOfBirth}
              />
              {errors.dateOfBirth ? (
                <p
                  className="mt-2 text-sm text-destructive"
                  id="ll-dateOfBirth-error"
                  role="alert"
                >
                  {errors.dateOfBirth}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {!isReviewStep && stepIndex === 1 ? (
          <>
            {errors.dateOfBirth ? (
              <div
                className="rounded-xl border border-destructive/40 p-4 text-sm leading-6 text-destructive"
                role="alert"
              >
                {errors.dateOfBirth}
                <button
                  className="ml-2 underline hover:no-underline"
                  onClick={() => goToStep(0)}
                  type="button"
                >
                  Correct your date of birth
                </button>
              </div>
            ) : null}
            <fieldset>
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
                      checked={values.vehicleClass === option.value}
                      name="vehicleClass"
                      onChange={() => updateValue("vehicleClass", option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <span>{option.label}</span>
                    <span className="ml-auto text-sm text-muted-foreground">
                      Minimum age {option.minimumAgeYears}
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
                className={inputClassName}
                id="ll-zone"
                name="zone"
                onChange={(event) => updateValue("zone", event.target.value)}
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
        ) : null}

        {!isReviewStep && stepIndex === 2 ? (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="ll-identityProofType">
                {fieldLabels.identityProofType}
              </label>
              <select
                className={inputClassName}
                id="ll-identityProofType"
                name="identityProofType"
                onChange={(event) =>
                  updateValue("identityProofType", event.target.value)
                }
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
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="ll-addressProofType">
                {fieldLabels.addressProofType}
              </label>
              <select
                className={inputClassName}
                id="ll-addressProofType"
                name="addressProofType"
                onChange={(event) =>
                  updateValue("addressProofType", event.target.value)
                }
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
        ) : null}

        {isReviewStep ? (
          <>
            <dl className="space-y-4 rounded-2xl border border-border p-5">
              {(Object.keys(fieldLabels) as FieldName[]).map((field) => (
                <div key={field}>
                  <dt className="text-sm font-medium text-muted-foreground">
                    {fieldLabels[field]}
                  </dt>
                  <dd className="mt-1">
                    {field === "identityProofType"
                      ? identityProofOptions.find(
                          (option) => option.value === values[field]
                        )?.label ?? "Not provided"
                      : field === "addressProofType"
                        ? addressProofOptions.find(
                            (option) => option.value === values[field]
                          )?.label ?? "Not provided"
                        : field === "vehicleClass"
                          ? getVehicleClass(values[field])?.label ?? "Not provided"
                          : field === "zone"
                            ? delhiZones.find(
                                (option) => option.value === values[field]
                              )?.label ?? "Not provided"
                            : values[field] || "Not provided"}
                  </dd>
                </div>
              ))}
            </dl>
            <label className="flex items-start gap-3 rounded-xl border border-border p-4">
              <input
                checked={declarationAccepted}
                className="mt-1 size-5"
                onChange={(event) =>
                  setDeclarationAccepted(event.target.checked)
                }
                type="checkbox"
              />
              <span className="leading-6">
                I confirm these are the details for this application, and I
                understand nothing is sent to a government
                service.
              </span>
            </label>
          </>
        ) : null}
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
          {submitError.kind === "eligibility-not-met" ? (
            <button
              className="mt-1 underline hover:no-underline"
              onClick={() => goToStep(0)}
              type="button"
            >
              Correct your date of birth
            </button>
          ) : null}
          {submitError.kind === "rate-limited" ? (
            <p className="mt-1 text-destructive/80">
              Your answers are still here. Try again once the wait passes.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row-reverse">
        {isReviewStep ? (
          <Button
            aria-describedby="learner-form-note"
            className="h-11 flex-1 text-base"
            disabled={isSubmitting || !declarationAccepted}
            type="submit"
          >
            {isSubmitting ? "Submitting..." : "Submit application"}
          </Button>
        ) : (
          <Button
            className="h-11 flex-1 text-base"
            onClick={() => handleContinue()}
            type="button"
          >
            Continue
          </Button>
        )}
        {!isReviewStep && stepIndex > 0 ? (
          <Button
            className="h-11 px-5 text-base"
            onClick={() => goToStep(stepIndex - 1)}
            type="button"
            variant="outline"
          >
            Back
          </Button>
        ) : null}
        {!isReviewStep ? (
          <Button
            className="h-11 px-5 text-base"
            disabled={isSavingDraft}
            onClick={() => void handleSaveDraft()}
            type="button"
            variant="outline"
          >
            {isSavingDraft ? "Saving..." : "Save draft"}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

export { LearnerLicenceForm }
