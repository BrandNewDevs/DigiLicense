import { createFileRoute } from "@tanstack/react-router"

import { ApplicantHeader } from "../components/applicant-header"
import { LicenceJourneyCycle } from "../components/licence-journey-cycle"
import { applicantNavigation } from "../lib/applicant-navigation"

export const Route = createFileRoute("/")({ component: App })

function App() {
  return (
    <div className="sky-glow-background flex min-h-svh flex-col overflow-hidden text-foreground">
      <ApplicantHeader navigation={applicantNavigation} returnTo="/" />

      <main className="flex flex-col items-center pt-20 sm:pt-24" id="main-content">
        <div className="w-full max-w-[var(--digilicense-home-width)] px-5 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-5xl">
            <span className="block text-black">
              Licence <span className="italic">services</span>
            </span>
            <span className="block text-[#d96b16]">
              <span className="text-black">Without the</span>{" "}
              <span className="relative inline-block no-underline after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 after:ease-out hover:after:scale-x-100">
                <span className="italic">Confusion</span>
              </span>
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-xl">
            Licence services, without the
            <br className="sm:hidden" /> bureaucratic obstacle course.
          </p>
        </div>

        <LicenceJourneyCycle />
      </main>
    </div>
  )
}
