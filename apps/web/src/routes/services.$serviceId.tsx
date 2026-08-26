import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { AddressChangeFlow } from "../components/address-change-flow"
import { ApplicationStatusFlow } from "../components/application-status-flow"
import { ApplicantHeader } from "../components/applicant-header"
import { MockApplicantGate } from "../components/mock-applicant-gate"
import { applicantNavigation } from "../lib/applicant-navigation"
import { LearnerLicenceForm } from "../components/learner-licence-form"
import { LearnerTestFlow } from "../components/learner-test-flow"
import { MobileUpdateFlow } from "../components/mobile-update-flow"
import { PermanentLicenceFlow } from "../components/permanent-licence-flow"
import { ServicePrototypeForm } from "../components/service-prototype-form"
import { getService } from "../lib/services"

export const Route = createFileRoute("/services/$serviceId")({
  component: ServicePage,
})

function ServicePage() {
  const { serviceId } = Route.useParams()
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
    ) : (
      <ServicePrototypeForm service={service} />
    )

  return (
    <div className="min-h-svh text-foreground">
      <ApplicantHeader
        navigation={applicantNavigation}
        returnTo={`/services/${service.id}`}
      />

      <main id="main-content">
        <section>
          <div className="mx-auto max-w-[var(--digilicense-page-width)] px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
            <Link
              className="inline-flex min-h-11 items-center gap-2 text-base text-muted-foreground underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              to="/services"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to services
            </Link>

            <h1 className="mt-8 max-w-4xl font-heading text-4xl font-medium tracking-[-0.06em] sm:text-6xl">
              {service.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              {service.description}
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-[var(--digilicense-home-width)] px-5 py-10 sm:px-8 lg:py-12">
          {service.protected ? (
            <MockApplicantGate returnTo={`/services/${service.id}`}>
              {form}
            </MockApplicantGate>
          ) : (
            form
          )}
        </div>
      </main>
    </div>
  )
}

function UnknownService() {
  return (
    <main
      className="mx-auto min-h-svh max-w-[var(--digilicense-home-width)] px-5 py-20 sm:px-8"
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
      <h1 className="mt-4 font-heading text-5xl font-medium tracking-[-0.06em]">
        This service route does not exist
      </h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        Choose one of the ten services from the service directory.
      </p>
    </main>
  )
}
