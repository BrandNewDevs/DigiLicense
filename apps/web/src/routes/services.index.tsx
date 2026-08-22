import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react"

import { SiteFooter } from "@workspace/ui/components/site-footer"
import { SiteHeader } from "@workspace/ui/components/site-header"

import { services } from "../lib/services"

export const Route = createFileRoute("/services/")({
  component: ServicesPage,
})

function ServicesPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader
        brand="DigiLicense"
        brandHref="/"
        brandLabel="DigiLicense home"
        linkComponent={Link}
        navigation={[{ href: "/", label: "Home" }]}
        actions={[
          {
            href: "/applicant/login?returnTo=%2Fservices",
            label: "Sign in",
          },
        ]}
      />

      <main id="main-content">
        <section>
          <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
            <Link
              className="inline-flex min-h-11 items-center gap-2 text-base text-muted-foreground underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              to="/"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to home
            </Link>
            <p className="mt-8 text-base font-medium text-muted-foreground">
              Delhi-only independent prototype
            </p>
            <h1 className="mt-4 max-w-3xl font-heading text-5xl font-medium tracking-[-0.06em] sm:text-7xl">
              Licence services
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Try each service with synthetic data. Protected services use a
              mock applicant button instead of real authentication.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service, index) => (
              <Link
                className="group flex min-h-64 flex-col rounded-3xl border border-border bg-card p-6 transition-transform hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:transform-none"
                key={service.id}
                params={{ serviceId: service.id }}
                preload="intent"
                to="/services/$serviceId"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-sm text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    {service.protected ? (
                      <LockKeyhole className="size-3.5" aria-hidden="true" />
                    ) : null}
                    {service.protected ? "Mock sign-in" : "Public"}
                  </span>
                </div>
                <h2 className="mt-8 font-heading text-2xl font-medium tracking-[-0.045em]">
                  {service.title}
                </h2>
                <p className="mt-3 leading-6 text-muted-foreground">
                  {service.summary}
                </p>
                <span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-medium">
                  Open service
                  <ArrowRight
                    className="size-4 -rotate-45 transition-transform group-hover:rotate-0 group-focus-visible:rotate-0 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter title="DigiLicense">
        <p>
          DigiLicense is not a government website. Every application,
          verification, payment, test, and appointment shown here is simulated.
        </p>
      </SiteFooter>
    </div>
  )
}
