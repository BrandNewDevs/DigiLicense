import { Link, createFileRoute } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { BadgeCheck, FileCheck2, ScanLine } from "lucide-react"
import { useState } from "react"

import {
  ServiceCard,
  ServiceCardAction,
  ServiceLookupForm,
} from "@workspace/ui/components/service-card"
import { SiteFooter } from "@workspace/ui/components/site-footer"
import { SiteHeader } from "@workspace/ui/components/site-header"

import { lookupApplicationStatus } from "../server-functions/application-status"

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
    href: "/services/change-address",
  },
] as const

function App() {
  const lookupApplicationStatusFn = useServerFn(lookupApplicationStatus)
  const [lookupFeedback, setLookupFeedback] = useState<{
    kind: "error" | "success"
    message: string
  }>()
  const [isLookingUpApplication, setIsLookingUpApplication] = useState(false)

  return (
    <div className="min-h-svh overflow-hidden bg-background text-foreground">
      <SiteHeader
        brand="DigiLicense"
        brandHref="/"
        brandLabel="DigiLicense home"
        linkComponent={Link}
        navigation={[
          { href: "/services", label: "Services" },
          { href: "/applicant/login?returnTo=%2F", label: "Sign in" },
        ]}
      />

      <main id="main-content">
        <section>
          <div className="mx-auto flex max-w-[1240px] items-center px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
            <div className="max-w-3xl">
              <h1 className="font-heading text-4xl leading-tight font-medium tracking-[-0.06em] sm:text-6xl lg:text-7xl">
                What do you need to do?
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Apply for a learner&apos;s licence, renew an existing licence,
                update your details, or check your application status. Choose a
                service below to get started.
              </p>
            </div>
          </div>
        </section>

        <section
          id="services"
          className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="mb-2 text-base font-medium text-muted-foreground">
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

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => (
              <div className="min-h-[380px]" key={service.title}>
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
                      isSubmitting={isLookingUpApplication}
                      feedback={
                        lookupFeedback ? (
                          <p
                            className={
                              lookupFeedback.kind === "success"
                                ? "text-sm text-foreground"
                                : "text-sm text-destructive"
                            }
                            role="status"
                            aria-live="polite"
                          >
                            {lookupFeedback.message}
                          </p>
                        ) : undefined
                      }
                      onSubmit={async (applicationNumber) => {
                        setIsLookingUpApplication(true)
                        setLookupFeedback(undefined)

                        try {
                          const result = await lookupApplicationStatusFn({
                            data: { applicationNumber },
                          })

                          if (result.kind === "found") {
                            setLookupFeedback({
                              kind: "success",
                              message: `${result.service}: ${result.status}. ${result.nextAction}`,
                            })
                          } else {
                            setLookupFeedback({
                              kind: "error",
                              message: result.message,
                            })
                          }
                        } catch {
                          setLookupFeedback({
                            kind: "error",
                            message:
                              "Check the application number and try again.",
                          })
                        } finally {
                          setIsLookingUpApplication(false)
                        }
                      }}
                    />
                  ) : (
                    <ServiceCardAction
                      href={service.href}
                      label={service.action}
                      linkComponent={Link}
                    />
                  )}
                </ServiceCard>
              </div>
            ))}
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
