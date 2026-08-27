import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"

import { services } from "../lib/services"
import type { ServiceDefinition } from "../lib/services"

export const Route = createFileRoute("/")({ component: App })

const featuredServiceIds = [
  "learner-licence",
  "permanent-licence",
  "appointments",
] as const

function App() {
  const featuredServices = services.filter((service) =>
    featuredServiceIds.includes(
      service.id as (typeof featuredServiceIds)[number]
    )
  )

  return (
    <main className="flex flex-1 px-4 py-10 sm:px-6 sm:py-14" id="main-content">
      <div className="mx-auto w-full max-w-5xl">
        <section className="mx-auto max-w-3xl py-8 text-center sm:py-12">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Licence services without the confusion
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Licence services, without the
            <br className="sm:hidden" /> bureaucratic obstacle course.
          </p>
        </section>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <section aria-labelledby="all-services-title">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
                id="all-services-title"
              >
                Services
              </h2>
              <Link
                className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                to="/services"
              >
                View all services
              </Link>
            </div>
            <div className="mt-4 divide-y divide-border">
              {services.slice(0, 5).map((service) => (
                <ServiceListItem key={service.id} service={service} />
              ))}
            </div>
          </section>

          <aside
            aria-labelledby="featured-services-title"
            className="rounded-xl bg-muted p-6"
          >
            <h2 className="text-lg font-semibold" id="featured-services-title">
              Featured services
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Start here for the first-time licence journey and driving test.
            </p>
            <div className="mt-5 space-y-5">
              {featuredServices.map((service) => (
                <ServiceListItem compact key={service.id} service={service} />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}

function ServiceListItem({
  compact = false,
  service,
}: {
  compact?: boolean
  service: ServiceDefinition
}) {
  return (
    <article className={compact ? "" : "py-2"}>
      <Link
        className={`group block w-full rounded-md transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          compact ? "-mx-2 px-2 py-2" : "-mx-3 px-3 py-5"
        }`}
        params={{ serviceId: service.id }}
        to="/services/$serviceId"
      >
        <div className="flex items-center justify-between gap-4">
          <h3
            className={
              compact
                ? "text-base font-semibold underline decoration-border underline-offset-4 group-hover:decoration-foreground"
                : "text-lg font-semibold underline decoration-border underline-offset-4 group-hover:decoration-foreground sm:text-xl"
            }
          >
            {service.title}
          </h3>
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-hover:rotate-45"
          />
        </div>
        <p
          className={
            compact
              ? "mt-1 text-sm leading-6 text-muted-foreground"
              : "mt-2 text-base leading-7 text-muted-foreground"
          }
        >
          {service.description}
        </p>
      </Link>
    </article>
  )
}
