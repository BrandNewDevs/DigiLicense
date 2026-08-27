import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { appointmentJourneyReadSchema } from "../validation/appointment"

import { AddressChangeFlow } from "../components/address-change-flow"
import { ApplicationStatusFlow } from "../components/application-status-flow"
import { AppointmentFlow } from "../components/appointment-flow"
import { MockApplicantGate } from "../components/mock-applicant-gate"
import { LearnerLicenceForm } from "../components/learner-licence-form"
import { LearnerTestFlow } from "../components/learner-test-flow"
import { MobileUpdateFlow } from "../components/mobile-update-flow"
import { PermanentLicenceFlow } from "../components/permanent-licence-flow"
import { ServicePrototypeForm } from "../components/service-prototype-form"
import { getService } from "../lib/services"

export const Route = createFileRoute("/services/$serviceId")({
  component: ServicePage,
  validateSearch: appointmentJourneyReadSchema,
})

function ServicePage() {
  const { serviceId } = Route.useParams()
  const { applicationNumber } = Route.useSearch()
  const service = getService(serviceId)

  if (!service) {
    return <UnknownService />
  }

  const workflow = "workflow" in service ? service.workflow : undefined

  const form =
    workflow === "application-status" ? (
      <ApplicationStatusFlow />
    ) : workflow === "learner-licence" ? (
      <LearnerLicenceForm />
    ) : workflow === "learner-test" ? (
      <LearnerTestFlow />
    ) : workflow === "mobile-update" ? (
      <MobileUpdateFlow />
    ) : workflow === "permanent-licence" ? (
      <PermanentLicenceFlow />
    ) : workflow === "address-change" ? (
      <AddressChangeFlow />
    ) : service.id === "appointments" ? (
      <AppointmentFlow applicationNumber={applicationNumber} />
    ) : (
      <ServicePrototypeForm service={service} />
    )

  return (
    <div className="flex-1 text-foreground">
      <main id="main-content">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
          <Link
            className="inline-flex min-h-11 items-center gap-2 text-base text-muted-foreground underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            to="/services"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to services
          </Link>

          <div className="mx-auto mt-8 grid max-w-5xl gap-8 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-12">
            <aside className="hidden lg:block">
              <nav aria-label="On this page" className="sticky top-8">
                <p className="text-sm font-semibold">On this page</p>
                <ul className="mt-3 space-y-1 text-sm">
                  <li>
                    <a
                      className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      href="#service-overview"
                    >
                      Overview
                    </a>
                  </li>
                  <li>
                    <a
                      className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      href="#service-requirements"
                    >
                      Requirements
                    </a>
                  </li>
                  <li>
                    <a
                      className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      href="#service-form"
                    >
                      Application form
                    </a>
                    {workflow === "learner-licence" ? (
                      <ul className="mt-1 ml-3 space-y-1 border-l border-border pl-3 text-xs">
                        <li>
                          <a
                            className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            href="#learner-personal-details"
                          >
                            Personal details
                          </a>
                        </li>
                        <li>
                          <a
                            className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            href="#learner-vehicle-and-zone"
                          >
                            Vehicle and zone
                          </a>
                        </li>
                        <li>
                          <a
                            className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            href="#learner-proof-selections"
                          >
                            Proof selections
                          </a>
                        </li>
                        <li>
                          <a
                            className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            href="#learner-review"
                          >
                            Review and declaration
                          </a>
                        </li>
                      </ul>
                    ) : null}
                  </li>
                </ul>
              </nav>
            </aside>

            <div className="min-w-0">
              <section className="scroll-mt-24" id="service-overview">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {service.title}
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {service.description}
                </p>
              </section>

              <section
                className="mt-8 scroll-mt-24 rounded-xl border border-border bg-muted p-5"
                id="service-requirements"
              >
                <h2 className="text-base font-semibold">
                  Required for this service
                </h2>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                  {service.whatYouNeed.map((item) => (
                    <li className="flex gap-3" key={item}>
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              <div className="mt-8 scroll-mt-24" id="service-form">
                {service.protected ? (
                  <MockApplicantGate returnTo={`/services/${service.id}`}>
                    {form}
                  </MockApplicantGate>
                ) : (
                  form
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function UnknownService() {
  return (
    <main
      className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6"
      id="main-content"
    >
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-muted-foreground underline"
        to="/services"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to services
      </Link>
      <p className="mt-20 text-base text-muted-foreground">Service not found</p>
      <h1 className="mt-4 font-sans text-5xl font-medium">
        This service route does not exist
      </h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        Choose one of the ten services from the service directory.
      </p>
    </main>
  )
}
