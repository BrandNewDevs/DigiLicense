import { Link, createFileRoute } from "@tanstack/react-router"

import { useCardGradient } from "@workspace/ui/hooks/use-card-gradient"

import { ApplicantHeader } from "../components/applicant-header"
import { applicantNavigation } from "../lib/applicant-navigation"
import { services } from "../lib/services"
import type { ServiceDefinition, ServiceId } from "../lib/services"

export const Route = createFileRoute("/services/")({
  component: ServicesPage,
})

function ServicesPage() {
  return (
    <div className="sky-glow-background flex min-h-svh flex-col text-foreground">
      <ApplicantHeader navigation={applicantNavigation} returnTo="/services" />

      <main className="flex-1" id="main-content">
        <div className="mx-auto max-w-[var(--digilicense-page-width)] px-5 sm:px-8 lg:px-10">
          {serviceCategories.map((category) => {
            const categoryServices = services.filter((service) =>
              category.serviceIds.includes(service.id)
            )

            return (
              <section
                aria-labelledby={category.id}
                className="py-10 sm:py-14"
                key={category.id}
              >
                <div className="max-w-2xl">
                  <h2
                    className="font-heading text-3xl font-medium tracking-[-0.05em] sm:text-4xl"
                    id={category.id}
                  >
                    {category.title}
                  </h2>
                  <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
                    {category.description}
                  </p>
                </div>

                <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {categoryServices.map((service) => (
                    <ServiceCard key={service.id} service={service} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function ServiceCard({ service }: { service: ServiceDefinition }) {
  const cardGradient = useCardGradient()

  return (
    <article
      {...cardGradient}
      className="journey-step-card relative flex min-h-64 flex-col overflow-hidden rounded-3xl p-5 sm:p-6"
    >
      <h3 className="relative z-10 font-heading text-2xl font-medium tracking-[-0.04em]">
        {service.title}
      </h3>
      <p className="relative z-10 mt-3 leading-7 text-muted-foreground">
        {service.description}
      </p>
      <div className="relative z-10 mt-auto flex flex-col items-start gap-2 pt-7">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d96b16] px-5 text-sm font-medium text-white transition-colors hover:bg-[#b9550d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d96b16]"
          params={{ serviceId: service.id }}
          to="/services/$serviceId"
        >
          {service.action}
        </Link>
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-[#d96b16] underline decoration-[#d96b16] decoration-dotted decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d96b16]"
          params={{ serviceId: service.id }}
          to="/services/$serviceId"
        >
          View details
        </Link>
      </div>
    </article>
  )
}

type ServiceCategory = {
  description: string
  id: string
  serviceIds: readonly ServiceId[]
  title: string
}

const serviceCategories: readonly ServiceCategory[] = [
  {
    id: "start-driving",
    title: "Start driving",
    description:
      "Begin a first-time licence journey, take the learner's test, and continue when you are ready for the permanent licence step.",
    serviceIds: ["learner-licence", "learner-test", "permanent-licence"],
  },
  {
    id: "manage-licence",
    title: "Manage your licence",
    description:
      "Handle a licence that needs renewal, replacement, or an address correction without having to hunt for the right request.",
    serviceIds: ["renew-licence", "duplicate-licence", "change-address"],
  },
  {
    id: "application-details",
    title: "Application and contact details",
    description:
      "Check the progress of an application or update the mobile number attached to a licence record.",
    serviceIds: ["track-application", "update-mobile"],
  },
  {
    id: "fees-and-appointments",
    title: "Fees and appointments",
    description:
      "See a fee estimate, then choose a driving-test slot or join the transparent waitlist when a slot is unavailable.",
    serviceIds: ["fees", "appointments"],
  },
]
