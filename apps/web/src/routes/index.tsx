import { createFileRoute } from "@tanstack/react-router"

import { ApplicantHeader } from "../components/applicant-header"
import { applicantNavigation } from "../lib/applicant-navigation"

export const Route = createFileRoute("/")({ component: App })

function App() {
  return (
    <div className="flex min-h-svh flex-col overflow-hidden text-foreground">
      <ApplicantHeader navigation={applicantNavigation} returnTo="/" />

      <main
      className="flex flex-1 flex-col items-center justify-center pt-16"
      id="main-content"
    >
        <div className="w-full max-w-[var(--digilicense-home-width)] px-5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Licence services without the confusion
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-xl">
            A clearer way to apply, test, and track your driving licence in
            Delhi.
          </p>
        </div>

        <section className="w-full max-w-[var(--digilicense-home-width)] px-5 pb-16 pt-10 text-left" id="about">
          <h2 className="font-heading text-xl font-medium tracking-[-0.03em]">
            About this service
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            DigiLicense is an independent Delhi-only service for driving-
            licence journeys. It is not a government website and does not
            submit anything to a government system. Actions that would reach a
            government office, such as document verification or test results
            being registered officially, are carried out inside DigiLicense
            only and are labelled at the point where they happen.
          </p>
        </section>

        <section className="w-full max-w-[var(--digilicense-home-width)] px-5 pb-16 text-left" id="how-it-works">
          <h2 className="font-heading text-xl font-medium tracking-[-0.03em]">
            How it works
          </h2>
          <ol className="mt-3 max-w-2xl space-y-2 text-sm leading-6 text-muted-foreground">
            <li>
              Start a guided learner's-licence application. Your progress is
              saved on the server and visible from every step.
            </li>
            <li>
              Take the learner's test in English or Hindi. The result decides
              whether you continue or retake.
            </li>
            <li>
              Continue to the permanent-licence application and book a
              driving-test appointment when you become eligible.
            </li>
          </ol>
        </section>
      </main>
    </div>
  )
}
