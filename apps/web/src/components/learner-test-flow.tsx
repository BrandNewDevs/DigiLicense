import { AlertCircle, Award, CheckCircle2, RotateCcw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"

import {
  learnerTestLanguages,
  learnerTestPassMark,
} from "../lib/learner-test"
import type { LearnerTestLanguage } from "../lib/learner-test"
import { getApplicationStatusLabel } from "../lib/application-status"
import type { LearnerTestReadResult } from "../server/learner-test.server"
import {
  readLearnerTestState,
  submitLearnerTest,
} from "../server-functions/learner-test"

type ReadyState = Extract<LearnerTestReadResult, { kind: "ready" }>

type Phase =
  | "already-passed"
  | "authentication-required"
  | "graded"
  | "loading"
  | "no-application"
  | "ready"
  | "test"
  | "unavailable"

type GradedOutcome = {
  applicationNumber: string
  score: number
  passMark: number
  passed: boolean
}

const inputClassName =
  "h-11 w-full rounded-lg border border-input px-3 text-base sm:max-w-xs"

// Always yields a spec-compliant v4 UUID so the server's z.uuid() boundary
// accepts it even where crypto.randomUUID is unavailable.
function createTestIdempotencyKey(): string | null {
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

function LearnerTestFlow() {
  const loadState = useServerFn(readLearnerTestState)
  const submitTest = useServerFn(submitLearnerTest)

  const [phase, setPhase] = useState<Phase>("loading")
  const [state, setState] = useState<ReadyState | null>(null)
  const [outcome, setOutcome] = useState<GradedOutcome | null>(null)
  const [language, setLanguage] = useState<LearnerTestLanguage>("ENGLISH")
  const [answers, setAnswers] = useState<number[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<{
    kind: string
    message: string
  }>()
  // One key per started test: retries of the same submission reuse it so a
  // lost response cannot record the attempt twice. Starting over generates
  // a fresh key.
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let cancelled = false

    async function loadInitialState() {
      try {
        const result = await loadState()

        if (cancelled) return

        if (result.kind === "ready") {
          setState(result)
          setPhase("ready")
          return
        }

        if (result.kind === "already-passed") {
          setState(null)
          setPhase("already-passed")
          return
        }

        setPhase(result.kind === "authentication-required" ? "authentication-required" : result.kind === "no-application" ? "no-application" : "unavailable")
      } catch {
        if (!cancelled) setPhase("unavailable")
      }
    }

    void loadInitialState()

    return () => {
      cancelled = true
    }
  }, [loadState])

  useEffect(() => {
    if (phase === "test" || phase === "graded") {
      headingRef.current?.focus()
    }
  }, [phase])

  function announce(message: string) {
    setAnnouncement(message)
  }

  function beginTest() {
    setAnswers(new Array(state?.questionCount ?? 0).fill(-1))

    const key = createTestIdempotencyKey()

    if (!key) {
      setSubmitError({
        kind: "unsupported-browser",
        message:
          "This browser cannot start the test securely. Update your browser or open DigiLicense over HTTPS.",
      })
      announce(
        "This browser cannot start the test securely. Update your browser or open DigiLicense over HTTPS."
      )
      return
    }

    setIdempotencyKey(key)
    setSubmitError(undefined)
    setPhase("test")
    setAnnouncement(
      `The test has ${state?.questionCount ?? 0} questions. The pass mark is ${learnerTestPassMark}.`
    )
  }

  async function handleSubmit() {
    if (!state) return

    if (answers.some((answer) => answer < 0)) {
      const firstUnanswered = answers.findIndex((answer) => answer < 0)

      setAnnouncement(
        `Question ${firstUnanswered + 1} still needs an answer before submitting.`
      )
      return
    }

    setIsSubmitting(true)
    setSubmitError(undefined)

    try {
      if (!idempotencyKey) {
        setSubmitError({
          kind: "missing-key",
          message:
            "The test session was interrupted. Start the test again to submit.",
        })
        setIsSubmitting(false)
        return
      }

      const result = await submitTest({
        data: { language, answers, idempotencyKey },
      })

      if (result.kind === "graded") {
        setOutcome({
          applicationNumber: result.applicationNumber,
          score: result.score,
          passMark: result.passMark,
          passed: result.passed,
        })
        setAnnouncement(
          result.passed
            ? `You passed with ${result.score} of ${state.questionCount}.`
            : `You scored ${result.score} of ${state.questionCount}. You can retake the test.`
        )
        setPhase("graded")
        return
      }

      if (result.kind === "authentication-required") {
        setPhase("authentication-required")
        return
      }

      if (result.kind === "no-application") {
        setPhase("no-application")
        return
      }

      // Rate-limited and unavailable outcomes keep every recorded answer so
      // the applicant can retry without retyping anything.
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

  function updateAnswer(questionIndex: number, optionIndex: number) {
    setAnswers((current) =>
      current.map((answer, index) =>
        index === questionIndex ? optionIndex : answer
      )
    )
  }

  function promptText(question: ReadyState["questions"][number]) {
    return language === "HINDI" ? question.prompt.hi : question.prompt.en
  }

  function optionTexts(question: ReadyState["questions"][number]) {
    return question.options.map((option) =>
      language === "HINDI" ? option.hi : option.en
    )
  }

  if (phase === "loading") {
    return (
      <section className="rounded-3xl border border-border p-6 sm:p-8">
        <p className="text-base leading-7 text-muted-foreground" role="status">
          Loading your learner's-test progress...
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
          Your applicant session ended. Sign in again to take the learner's
          test.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-foreground px-5 text-base font-medium text-foreground"
          search={{ returnTo: "/services/learner-test" }}
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
        <AlertCircle className="size-8" aria-hidden="true" />
        <h2 className="mt-5 font-heading text-2xl font-medium tracking-[-0.04em]">
          Service unavailable
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          The learner's-test service could not be loaded. Reload the page to
          try again.
        </p>
      </section>
    )
  }

  if (phase === "no-application") {
    return (
      <section className="rounded-3xl border border-border p-6 sm:p-8">
        <AlertCircle className="size-8" aria-hidden="true" />
        <h2 className="mt-5 font-heading text-2xl font-medium tracking-[-0.04em]">
          No application is ready for the test
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          The learner's test opens once a learner's-licence application has
          been submitted and its automatic checks are complete.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-foreground px-5 text-base font-medium text-foreground"
          params={{ serviceId: "learner-licence" }}
          to="/services/$serviceId"
        >
          Go to the learner's-licence service
        </Link>
      </section>
    )
  }

  if (phase === "already-passed") {
    return (
      <section className="rounded-3xl border border-border p-6 sm:p-8">
        <Award className="size-8" aria-hidden="true" />
        <h2 className="mt-5 font-heading text-2xl font-medium tracking-[-0.04em]">
          Learner's test already passed
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Your learner's test has already been passed and recorded on your
          application. The next step is the permanent-licence application,
          which opens after the waiting period.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-foreground px-5 text-base font-medium text-foreground"
          params={{ serviceId: "permanent-licence" }}
          to="/services/$serviceId"
        >
          Go to the permanent-licence service
        </Link>
      </section>
    )
  }

  if (phase === "graded" && outcome) {
    return (
      <section
        aria-labelledby="test-result-title"
        className="rounded-3xl border border-border p-6 sm:p-8"
      >
        {outcome.passed ? (
          <Award className="size-10" aria-hidden="true" />
        ) : (
          <RotateCcw className="size-10" aria-hidden="true" />
        )}
        <p className="mt-6 text-sm font-medium text-muted-foreground">
          Test result for {outcome.applicationNumber}
        </p>
        <h2
          className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]"
          id="test-result-title"
          ref={headingRef}
          tabIndex={-1}
        >
          {outcome.passed ? "Learner's test passed" : "Learner's test not passed"}
        </h2>
        <dl className="mt-6 space-y-4 rounded-2xl border border-border p-5">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Score</dt>
            <dd className="mt-1 text-lg font-medium">
              {outcome.score} of {state?.questionCount}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Pass mark
            </dt>
            <dd className="mt-1">{outcome.passMark}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Next action for you
            </dt>
            <dd className="mt-1">
              {outcome.passed
                ? "Continue to the permanent-licence application after the waiting period."
                : "You can retake the test. Review the road-sign and road-rule topics first."}
            </dd>
          </div>
        </dl>
        {!outcome.passed ? (
          <Button
            className="mt-7 h-11 w-full text-base sm:w-auto"
            onClick={() => setPhase("ready")}
            variant="outline"
          >
            Prepare to retake the test
          </Button>
        ) : null}
        <p className="mt-6 text-sm leading-6 text-muted-foreground">
          This result was recorded by DigiLicense only. No government service
          was contacted and no official licence outcome exists.
        </p>
      </section>
    )
  }

  if (!state || phase === "ready") {
    const latestAttempt = state?.previousAttempts[0]

    return (
      <section
        aria-labelledby="learner-test-intro-title"
        className="rounded-3xl border border-border p-6 sm:p-8"
      >
        <CheckCircle2 className="size-8" aria-hidden="true" />
        <h2
          className="mt-5 font-heading text-2xl font-medium tracking-[-0.04em]"
          id="learner-test-intro-title"
        >
          Your test is ready
        </h2>
        <dl className="mt-6 space-y-4 rounded-2xl border border-border p-5">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Application number
            </dt>
            <dd className="mt-1 font-mono text-lg font-medium">
              {state?.applicationNumber}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Current status
            </dt>
            <dd className="mt-1">
              {getApplicationStatusLabel(state?.status ?? "")}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Format
            </dt>
            <dd className="mt-1">
              {state?.questionCount} questions; pass mark{" "}
              {state?.passMark}. Road signs and road rules.
            </dd>
          </div>
          {latestAttempt ? (
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Previous attempt
              </dt>
              <dd className="mt-1">
                Scored {latestAttempt.score},{" "}
                {latestAttempt.passed ? "passed" : "not passed"}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-7">
          <label className="mb-2 block text-sm font-medium" htmlFor="lt-language">
            Test language
          </label>
          <select
            className={inputClassName}
            id="lt-language"
            onChange={(event) =>
              setLanguage(event.target.value as LearnerTestLanguage)
            }
            value={language}
          >
            {learnerTestLanguages.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {submitError?.kind === "unsupported-browser" ? (
          <div
            className="mt-5 rounded-xl border border-destructive/40 p-4 text-sm leading-6 text-destructive"
            role="alert"
          >
            {submitError.message}
          </div>
        ) : null}

        <Button
          className="mt-7 h-11 w-full text-base sm:w-auto"
          disabled={submitError?.kind === "unsupported-browser"}
          onClick={beginTest}
          size="lg"
        >
          Start the test
        </Button>
      </section>
    )
  }

  const unansweredCount = answers.filter((answer) => answer < 0).length

  return (
    <form
      aria-describedby="learner-test-note"
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
        Questions: {state.questionCount} · Pass mark: {state.passMark}
      </p>
      <h2
        className="mt-2 font-heading text-2xl font-medium tracking-[-0.04em]"
        ref={headingRef}
        tabIndex={-1}
      >
        Learner's test
      </h2>
      <p
        className="mt-5 text-sm leading-6 text-muted-foreground"
        id="learner-test-note"
      >
        Answer every question, then submit. Your answers are graded on the
        server and the result is saved to your application.
      </p>

      <ol className="mt-7 space-y-6">
        {state.questions.map((question, questionIndex) => {
          const options = optionTexts(question)
          const name = `lt-q-${question.id}`

          return (
            <li className="rounded-2xl border border-border p-5" key={question.id}>
              <fieldset>
                <legend className="text-base font-medium leading-6">
                  {questionIndex + 1}. {promptText(question)}
                </legend>
                <div className="mt-4 space-y-2">
                  {options.map((optionText, optionIndex) => (
                    <label
                      className="flex min-h-11 items-center gap-3 rounded-lg border border-input px-3 text-base has-checked:border-ring"
                      key={`${question.id}-${optionIndex}`}
                    >
                      <input
                        checked={answers[questionIndex] === optionIndex}
                        name={name}
                        onChange={() =>
                          updateAnswer(questionIndex, optionIndex)
                        }
                        type="radio"
                        value={optionIndex}
                      />
                      <span>{optionText}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          )
        })}
      </ol>

      {unansweredCount > 0 ? (
        <p className="mt-5 text-sm text-muted-foreground" role="status">
          {unansweredCount} question{unansweredCount > 1 ? "s" : ""} still need
          an answer.
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

      <Button
        aria-describedby="learner-test-note"
        className="mt-7 h-11 w-full text-base sm:w-auto"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Checking..." : "Submit test"}
      </Button>
    </form>
  )
}

export { LearnerTestFlow }
