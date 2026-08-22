import { createFileRoute } from "@tanstack/react-router"
import { ArrowUpRight, BadgeCheck, FileCheck2, ScanLine } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@workspace/ui/components/carousel"

export const Route = createFileRoute("/")({ component: App })

const services = [
  {
    icon: FileCheck2,
    number: "01",
    title: "Renew your driving licence",
    description: "Renew an existing licence online when it is due to expire.",
    meta: "For existing licence holders",
    type: "action",
    action: "Renew now",
    href: "/services/renew-licence",
  },
  {
    icon: ScanLine,
    number: "02",
    title: "Apply for a learner's licence",
    description:
      "Start your first licence application with the details you have ready.",
    meta: "For new applicants",
    type: "action",
    action: "Apply now",
    href: "/services/learner-licence",
  },
  {
    icon: BadgeCheck,
    number: "03",
    title: "Check application status",
    description: "Enter your application number to see what happens next.",
    meta: "Have your application number ready",
    type: "tracking",
  },
  {
    icon: FileCheck2,
    number: "04",
    title: "Update your details",
    description:
      "Keep your address and personal details up to date on your licence record.",
    meta: "For current licence holders",
    type: "action",
    action: "Update details",
    href: "/services/update-details",
  },
] as const

function App() {
  return (
    <div className="min-h-svh overflow-hidden bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <a
            href="#main-content"
            className="inline-flex min-h-11 items-center font-heading text-lg font-semibold tracking-[-0.04em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            aria-label="DigiLicense home"
          >
            DigiLicense
          </a>

          <nav
            className="flex items-center text-sm font-medium text-muted-foreground"
            aria-label="Main navigation"
          >
            <a
              className="inline-flex min-h-11 items-center transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              href="/services"
            >
              Services
            </a>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="border-b border-border">
          <div className="mx-auto flex min-h-[470px] max-w-[1240px] items-center px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
            <div className="max-w-3xl">
              <h1 className="font-heading text-4xl leading-tight font-medium tracking-[-0.06em] sm:text-6xl lg:text-7xl">
                What do you need to do?
              </h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Apply for a learner&apos;s licence, renew an existing licence,
                update your details, or check your application status. Choose a
                service below to get started.
              </p>
            </div>
          </div>
        </section>

        <section
          id="services"
          className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:px-10 lg:py-28"
        >
          <div className="flex flex-col justify-between gap-7 md:flex-row md:items-end">
            <div>
              <p className="mb-4 text-base font-medium text-muted-foreground">
                Quick Links
              </p>
              <h2 className="max-w-xl font-heading text-4xl leading-tight font-medium tracking-[-0.065em] sm:text-5xl">
                The things you came to do.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              Explore the main licence services in one place.
            </p>
          </div>

          <div className="relative mt-12 px-10 sm:px-12">
            <Carousel
              className="w-full"
              opts={{ align: "start", loop: true }}
              aria-label="Licence services"
            >
              <CarouselContent className="items-stretch">
                {services.map((service, index) => {
                  const Icon = service.icon

                  return (
                    <CarouselItem
                      className="h-[430px] md:basis-1/2 lg:basis-1/3"
                      key={service.title}
                      aria-label={`${service.title}, service ${index + 1} of ${services.length}`}
                    >
                      <article className="group flex h-full min-h-0 flex-col rounded-[1.6rem] border border-border bg-card p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:transform-none sm:p-7">
                        <div className="flex items-start justify-between">
                          <span className="grid size-12 place-items-center rounded-2xl bg-muted">
                            <Icon className="size-5" aria-hidden="true" />
                          </span>
                          <span
                            className="font-mono text-sm text-muted-foreground"
                            aria-hidden="true"
                          >
                            {service.number}
                          </span>
                        </div>

                        <div className="mt-8">
                          <h3 className="max-w-[280px] font-heading text-2xl font-medium tracking-[-0.05em]">
                            {service.title}
                          </h3>
                          <p className="mt-3 max-w-[300px] text-sm leading-6 text-muted-foreground">
                            {service.description}
                          </p>
                        </div>

                        <div className="mt-auto border-t border-border pt-5">
                          <p
                            className="mb-4 flex min-h-6 items-center text-sm font-medium text-muted-foreground"
                            id={
                              service.type === "tracking"
                                ? "application-number-help"
                                : undefined
                            }
                          >
                            {service.meta}
                          </p>

                          <div className="flex min-h-[132px] flex-col justify-end">
                            {service.type === "tracking" ? (
                              <form
                                className="space-y-2"
                                onSubmit={(event) => {
                                  event.preventDefault()
                                  const formData = new FormData(
                                    event.currentTarget
                                  )
                                  const applicationNumber = String(
                                    formData.get("application-number") ?? ""
                                  ).trim()

                                  if (applicationNumber) {
                                    window.location.href = `/services/track-application?application=${encodeURIComponent(applicationNumber)}`
                                  }
                                }}
                              >
                                <label
                                  className="mb-2 block text-sm font-medium"
                                  htmlFor="application-number"
                                >
                                  Application number
                                </label>
                                <input
                                  id="application-number"
                                  name="application-number"
                                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                  placeholder="Application number"
                                  inputMode="text"
                                  autoComplete="off"
                                  required
                                  aria-describedby="application-number-help"
                                />
                                <Button className="h-11 w-full" type="submit">
                                  Track status
                                </Button>
                              </form>
                            ) : (
                              <a
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-base font-medium text-background transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
                                href={service.href}
                              >
                                {service.action}
                                <ArrowUpRight
                                  className="size-4"
                                  aria-hidden="true"
                                />
                              </a>
                            )}
                          </div>
                        </div>
                      </article>
                    </CarouselItem>
                  )
                })}
              </CarouselContent>
              <CarouselPrevious aria-label="Previous service" />
              <CarouselNext aria-label="Next service" />
            </Carousel>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-border bg-muted">
          <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-10 lg:py-24">
            <div>
              <p className="mb-4 text-base font-medium text-muted-foreground">
                How it works
              </p>
              <h2 className="max-w-md font-heading text-4xl leading-tight font-medium tracking-[-0.065em] sm:text-5xl">
                A shorter route to done.
              </h2>
              <p className="mt-5 max-w-sm text-base leading-7 text-muted-foreground">
                Start with a service, provide the needed details, and keep track
                of what happens next.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [
                  "01",
                  "Choose a service",
                  "Pick the licence service you need.",
                ],
                [
                  "02",
                  "Share your details",
                  "Add the information needed to continue.",
                ],
                ["03", "Follow the status", "Keep up with the next step."],
              ].map(([number, title, text]) => (
                <div
                  className="rounded-2xl border border-border bg-background p-5"
                  key={number}
                >
                  <span
                    className="font-mono text-sm text-muted-foreground"
                    aria-hidden="true"
                  >
                    {number}
                  </span>
                  <h3 className="mt-12 font-heading text-lg font-medium tracking-[-0.035em]">
                    {title}
                  </h3>
                  <p className="mt-2 text-base leading-6 text-muted-foreground">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-[1240px] px-5 py-10 text-base leading-7 text-muted-foreground sm:px-8 lg:px-10">
          <p className="font-medium text-foreground">DigiLicense</p>
          <p className="mt-3 max-w-3xl">
            Disclaimer: DigiLicense is not a government website. It is an
            independent project, and its features, content, and services are not
            provided by, affiliated with, endorsed by, or connected to any
            government department or agency.
          </p>
        </div>
      </footer>
    </div>
  )
}
