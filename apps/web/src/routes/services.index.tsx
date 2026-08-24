import { createFileRoute } from "@tanstack/react-router"

import { ApplicantHeader } from "../components/applicant-header"

export const Route = createFileRoute("/services/")({
  component: ServicesPage,
})

function ServicesPage() {
  return (
    <div className="flex min-h-svh flex-col text-foreground">
      <ApplicantHeader
        navigation={[
          { href: "/#about", label: "About" },
          { href: "/services", label: "Services" },
          { href: "/#how-it-works", label: "How it works" },
        ]}
        returnTo="/services"
      />

      <main className="flex-1" id="main-content" />

    </div>
  )
}
