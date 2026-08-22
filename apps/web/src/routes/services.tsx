import { createFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

export const Route = createFileRoute("/services")({
  component: ServicesPage,
})

function ServicesPage() {
  return (
    <main
      id="main-content"
      className="mx-auto min-h-svh max-w-3xl px-5 py-20 sm:px-8"
    >
      <a
        className="inline-flex min-h-11 items-center gap-2 text-base text-muted-foreground underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        href="/"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to home
      </a>
      <p className="mt-20 text-base text-muted-foreground">
        DigiLicence services
      </p>
      <h1 className="mt-4 font-heading text-5xl font-medium tracking-[-0.06em] sm:text-7xl">
        Coming soon
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
        We are preparing the services page. The available service flows will be
        added here soon.
      </p>
    </main>
  )
}
