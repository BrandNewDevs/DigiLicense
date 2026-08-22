import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/services/$serviceId")({
  component: ServicePage,
})

const serviceContent = {
  "renew-licence": {
    title: "Renew your driving licence",
    description:
      "Use this service to renew an existing driving licence when it is due to expire.",
  },
  "learner-licence": {
    title: "Apply for a learner's licence",
    description:
      "Use this service to start a new learner's licence application.",
  },
  "track-application": {
    title: "Check application status",
    description:
      "Enter your application number to find the latest status and next step.",
  },
  "update-details": {
    title: "Update your details",
    description:
      "Use this service to update the personal details connected to your licence.",
  },
} as const

function ServicePage() {
  const { serviceId } = Route.useParams()
  const service = Object.entries(serviceContent).find(
    ([id]) => id === serviceId
  )?.[1]

  if (!service) {
    return (
      <main
        id="main-content"
        className="mx-auto min-h-svh max-w-3xl px-5 py-20 sm:px-8"
      >
        <p className="text-sm text-muted-foreground">Service not found.</p>
        <a
          className="mt-6 inline-block min-h-11 py-2 underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          href="/"
        >
          Back to services
        </a>
      </main>
    )
  }

  return (
    <main
      id="main-content"
      className="mx-auto min-h-svh max-w-3xl px-5 py-20 sm:px-8"
    >
      <a
        className="inline-flex min-h-11 items-center text-base text-muted-foreground underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        href="/"
      >
        Back to services
      </a>
      <p className="mt-20 text-sm text-muted-foreground">DigiLicence service</p>
      <h1 className="mt-4 font-heading text-5xl font-medium tracking-[-0.06em] sm:text-7xl">
        {service.title}
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
        {service.description}
      </p>
      <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
        This service page is ready for the application flow to be added.
      </p>
    </main>
  )
}
