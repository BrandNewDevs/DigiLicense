import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeft, Check, ShieldAlert } from "lucide-react"

import { SiteFooter } from "@workspace/ui/components/site-footer"
import { SiteHeader } from "@workspace/ui/components/site-header"

import { MockApplicantGate } from "../components/mock-applicant-gate"
import { LearnerLicenceForm } from "../components/learner-licence-form"
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

  const isLearnerLicenceWorkflow = "workflow" in service

  const form = isLearnerLicenceWorkflow ? (
    <LearnerLicenceForm />
  ) : (
    <ServicePrototypeForm service={service} />
  )

  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader
        brand="DigiLicense"
        brandHref="/"
        brandLabel="DigiLicense home"
        linkComponent={Link}
        navigation={[{ href: "/services", label: "All services" }]}
      />

      <main id="main-content">
        <section>
          <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
            <Link
              className="inline-flex min-h-11 items-center gap-2 text-base text-muted-foreground underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              to="/services"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
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

        <div className="mx-auto grid max-w-[1100px] gap-6 px-5 py-10 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-10 lg:py-12">
          <aside className="h-fit rounded-3xl bg-muted p-6 sm:p-7">
            <h2 className="font-heading text-xl font-medium tracking-[-0.035em]">
              What you need
            </h2>
            <ul className="mt-5 space-y-4">
              {service.whatYouNeed.map((item) => (
                <li className="flex gap-3 leading-6" key={item}>
                  <Check className="mt-1 size-4 shrink-0" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7">
              <div className="flex gap-3">
                <ShieldAlert
                  className="mt-1 size-4 shrink-0"
                  aria-hidden="true"
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  {isLearnerLicenceWorkflow
                    ? "Use only synthetic values. Answers are stored in the prototype database so status and history work end to end, and nothing is sent to a government service."
                    : "Use only the synthetic values shown on this page. No data is saved or sent to an external service."}
                </p>
              </div>
            </div>
          </aside>

          <div>
            {service.protected ? (
              <MockApplicantGate returnTo={`/services/${service.id}`}>
                {form}
              </MockApplicantGate>
            ) : (
              form
            )}
          </div>
        </div>
      </main>

      <SiteFooter title="DigiLicense">
        <p>
          This is a Delhi-only independent prototype. It is not affiliated with
          or endorsed by a government department, and all actions are simulated.
        </p>
      </SiteFooter>
    </div>
  )
}

function UnknownService() {
  return (
    <main
      className="mx-auto min-h-svh max-w-3xl px-5 py-20 sm:px-8"
      id="main-content"
    >
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-muted-foreground underline"
        to="/services"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to services
      </Link>
      <p className="mt-20 text-base text-muted-foreground">Service not found</p>
      <h1 className="mt-4 font-heading text-5xl font-medium tracking-[-0.06em]">
        This service route does not exist
      </h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        Choose one of the ten prototype services from the service directory.
      </p>
    </main>
  )
}
