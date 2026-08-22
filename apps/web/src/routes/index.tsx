import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

import {
  ServiceCard,
  ServiceCardAction,
} from "@workspace/ui/components/service-card"
import { SiteFooter } from "@workspace/ui/components/site-footer"
import { SiteHeader } from "@workspace/ui/components/site-header"

export const Route = createFileRoute("/")({ component: App })

const services = [
  {
    title: "Renew your driving licence",
    description: "Renew an existing licence online when it is due to expire.",
    meta: "For existing licence holders",
    type: "action",
    action: "Renew licence",
    href: "/services/renew-licence",
  },
  {
    title: "Apply for a learner's licence",
    description:
      "Start your first licence application with the details you have ready.",
    meta: "For new applicants",
    type: "action",
    action: "Apply for licence",
    href: "/services/learner-licence",
  },
  {
    title: "Check application status",
    description: "Enter your application number to see what happens next.",
    meta: "Application number needed",
    type: "action",
    action: "Check status",
    href: "/services/track-application",
  },
  {
    title: "Update your details",
    description:
      "Keep your address and personal details up to date on your licence record.",
    meta: "For current licence holders",
    type: "action",
    action: "Update details",
    href: "/services/change-address",
  },
] as const

function App() {
  return (
    <div className="min-h-svh overflow-hidden bg-background text-foreground">
      <SiteHeader
        brand="DigiLicense"
        brandHref="/"
        brandLabel="DigiLicense home"
        linkComponent={Link}
        navigation={[{ href: "/services", label: "Services" }]}
        actions={[{ href: "/applicant/login?returnTo=%2F", label: "Sign in" }]}
      />

      <main id="main-content">
        <section>
          <div className="mx-auto flex max-w-[1240px] items-center px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
            <div className="max-w-3xl">
              <h1 className="font-heading text-4xl leading-tight font-medium tracking-[-0.06em] sm:text-6xl lg:text-7xl">
                Licence services without the confusion.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Know what to do, what you need, and what happens next. Apply,
                renew, update your details, or track an application through
                clear, guided steps.
              </p>
            </div>
          </div>
        </section>

        <section
          id="services"
          className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14"
        >
          <div className="max-w-xl">
            <h2 className="font-heading text-4xl leading-tight font-medium tracking-[-0.065em] sm:text-5xl">
              Quick Services
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Explore the main licence services in one place.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => (
              <div className="sm:min-h-[320px]" key={service.title}>
                <ServiceCard
                  description={service.description}
                  meta={service.meta}
                  title={service.title}
                >
                  <ServiceCardAction
                    href={service.href}
                    label={service.action}
                    linkComponent={Link}
                  />
                </ServiceCard>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <Link
              className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 text-base font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none sm:w-auto"
              to="/services"
            >
              All services
              <ArrowRight
                className="size-4 -rotate-45 transition-transform group-hover:rotate-0 group-focus-visible:rotate-0 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter contentClassName="max-w-none" title="DigiLicense">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl">
            Independent prototype. Not affiliated with or endorsed by a
            government department.
          </p>
          <nav className="shrink-0" aria-label="Prototype access">
            <Link
              className="inline-flex min-h-11 items-center font-medium text-foreground transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
              to="/operator/login"
            >
              Operator
            </Link>
          </nav>
        </div>
      </SiteFooter>
    </div>
  )
}
