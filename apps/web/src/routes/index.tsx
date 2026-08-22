import { createFileRoute } from "@tanstack/react-router"
import { BadgeCheck, FileCheck2, ScanLine } from "lucide-react"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@workspace/ui/components/carousel"
import {
  ServiceCard,
  ServiceCardAction,
  ServiceLookupForm,
} from "@workspace/ui/components/service-card"
import { SiteFooter } from "@workspace/ui/components/site-footer"
import { SiteHeader } from "@workspace/ui/components/site-header"

export const Route = createFileRoute("/")({ component: App })

const services = [
  {
    icon: FileCheck2,
    title: "Renew your driving licence",
    description: "Renew an existing licence online when it is due to expire.",
    meta: "For existing licence holders",
    type: "action",
    action: "Renew now",
    href: "/services/renew-licence",
  },
  {
    icon: ScanLine,
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
    title: "Check application status",
    description: "Enter your application number to see what happens next.",
    meta: "Have your application number ready",
    type: "tracking",
  },
  {
    icon: FileCheck2,
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
      <SiteHeader
        brand="DigiLicense"
        brandHref="/"
        brandLabel="DigiLicense home"
        navigation={[{ href: "/services", label: "Services" }]}
      />

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
                {services.map((service, index) => (
                  <CarouselItem
                    className="h-[430px] md:basis-1/2 lg:basis-1/3"
                    key={service.title}
                    aria-label={`${service.title}, service ${index + 1} of ${services.length}`}
                  >
                    <ServiceCard
                      description={service.description}
                      icon={service.icon}
                      meta={service.meta}
                      metaId={
                        service.type === "tracking"
                          ? "application-number-help"
                          : undefined
                      }
                      title={service.title}
                    >
                      {service.type === "tracking" ? (
                        <ServiceLookupForm
                          describedBy="application-number-help"
                          fieldId="application-number"
                          fieldLabel="Application number"
                          fieldName="application-number"
                          placeholder="Application number"
                          submitLabel="Track status"
                          onSubmit={(applicationNumber) => {
                            window.location.href = `/services/track-application?application=${encodeURIComponent(applicationNumber)}`
                          }}
                        />
                      ) : (
                        <ServiceCardAction
                          href={service.href}
                          label={service.action}
                        />
                      )}
                    </ServiceCard>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious aria-label="Previous service" />
              <CarouselNext aria-label="Next service" />
            </Carousel>
          </div>
        </section>
      </main>

      <SiteFooter title="DigiLicense">
        <p>
          Disclaimer: DigiLicense is not a government website. It is an
          independent project, and its features, content, and services are not
          provided by, affiliated with, endorsed by, or connected to any
          government department or agency.
        </p>
      </SiteFooter>
    </div>
  )
}
