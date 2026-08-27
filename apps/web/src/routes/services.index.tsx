import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"

import { services } from "../lib/services"
import type { ServiceDefinition, ServiceId } from "../lib/services"

export const Route = createFileRoute("/services/")({
  component: ServicesPage,
})

function ServicesPage() {
  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <main className="flex-1" id="main-content">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Services
            </h1>
            <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
              Find the licence service you need.
            </p>
          </div>

          <div className="mt-10 grid overflow-hidden rounded-xl border border-border sm:grid-cols-2 xl:grid-cols-4">
            {serviceCategories.map((category, index) => {
              const categoryServices = services.filter((service) =>
                category.serviceIds.includes(service.id)
              )

              return (
                <section
                  aria-labelledby={category.id}
                  className={getCategoryCellClassName(index)}
                  key={category.id}
                >
                  <h2
                    className="flex min-h-[5.25rem] items-center justify-center border-b border-border pb-3 text-center text-2xl font-semibold tracking-tight sm:text-3xl"
                    id={category.id}
                  >
                    {category.title}
                  </h2>
                  <div className="mt-6 space-y-6">
                    {categoryServices.map((service) => (
                      <ServiceLink key={service.id} service={service} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}

function ServiceLink({ service }: { service: ServiceDefinition }) {
  return (
    <article>
      <Link
        className="group -mx-2 block rounded-md px-2 py-2 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        params={{ serviceId: service.id }}
        to="/services/$serviceId"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold underline decoration-border underline-offset-4 group-hover:decoration-foreground">
            {service.title}
          </h3>
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-hover:rotate-45"
          />
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {service.description}
        </p>
      </Link>
    </article>
  )
}

function getCategoryCellClassName(index: number) {
  if (index === 0) {
    return "border-b border-border p-6 sm:border-r xl:border-b-0"
  }

  if (index === 1) {
    return "border-b border-border p-6 xl:border-r xl:border-b-0"
  }

  if (index === 2) {
    return "border-b border-border p-6 sm:border-r xl:border-b-0"
  }

  return "p-6"
}

type ServiceCategory = {
  id: string
  serviceIds: readonly ServiceId[]
  title: string
}

const serviceCategories: readonly ServiceCategory[] = [
  {
    id: "start-driving",
    title: "Start driving",
    serviceIds: ["learner-licence", "learner-test", "permanent-licence"],
  },
  {
    id: "manage-licence",
    title: "Manage your licence",
    serviceIds: ["renew-licence", "duplicate-licence", "change-address"],
  },
  {
    id: "application-details",
    title: "Application and contact details",
    serviceIds: ["track-application", "update-mobile"],
  },
  {
    id: "fees-and-appointments",
    title: "Fees and appointments",
    serviceIds: ["fees", "appointments"],
  },
]
