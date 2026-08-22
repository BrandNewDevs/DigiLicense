import { ArrowLeft } from "lucide-react"
import { Link, createFileRoute } from "@tanstack/react-router"

import { OperatorAccessRequired } from "../components/operator-access-required"
import { OperatorActionPanel } from "../components/operator-action-panel"
import { OperatorShell } from "../components/operator-shell"
import { getStatusLabel } from "../lib/operator-workflow"
import { getOperatorApplication } from "../server-functions/operator"

export const Route = createFileRoute("/operator/applications/$applicationId")({
  loader: ({ params }) =>
    getOperatorApplication({ data: { applicationId: params.applicationId } }),
  component: OperatorApplicationPage,
  errorComponent: OperatorApplicationUnavailable,
})

function OperatorApplicationPage() {
  const data = Route.useLoaderData()

  if (data.kind === "authentication-required") {
    return <OperatorAccessRequired />
  }

  if (data.kind === "not-found") {
    return (
      <OperatorShell>
        <main
          className="mx-auto min-h-[70svh] max-w-2xl px-5 py-20"
          id="main-content"
        >
          <p className="text-sm text-muted-foreground">Case not found</p>
          <h1 className="mt-3 font-heading text-4xl font-medium">
            This synthetic application does not exist
          </h1>
          <Link
            className="mt-7 inline-flex min-h-11 items-center underline"
            to="/operator"
          >
            Return to the work queue
          </Link>
        </main>
      </OperatorShell>
    )
  }

  const { application } = data

  return (
    <OperatorShell>
      <main id="main-content">
        <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
          <Link
            className="inline-flex min-h-11 items-center gap-2 text-muted-foreground underline"
            to="/operator"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to work queue
          </Link>

          <div className="mt-8 flex flex-col gap-4 border-b border-border pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-sm text-muted-foreground">
                {application.applicationNumber}
              </p>
              <h1 className="mt-3 font-heading text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
                {application.service}
              </h1>
            </div>
            <span className="w-fit rounded-full bg-muted px-3 py-1.5 text-sm font-medium">
              {getStatusLabel(application.status)}
            </span>
          </div>

          <section
            className="grid gap-6 py-8 sm:grid-cols-2"
            aria-labelledby="case-summary-title"
          >
            <h2 className="sr-only" id="case-summary-title">
              Case summary
            </h2>
            <div>
              <p className="text-sm text-muted-foreground">Applicant account</p>
              <p className="mt-2 font-medium">Demo Applicant 001</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Applicant's next action
              </p>
              <p className="mt-2 leading-6">{application.nextAction}</p>
            </div>
          </section>

          <OperatorActionPanel
            applicationId={application.id}
            status={application.status}
            version={application.version}
          />

          <section
            className="mt-10 border-t border-border pt-8"
            aria-labelledby="history-title"
          >
            <h2
              className="font-heading text-2xl font-medium"
              id="history-title"
            >
              Workflow history
            </h2>
            <ol className="mt-5 space-y-5">
              {application.workflowEvents.map((event) => (
                <li className="border-l-2 border-border pl-4" key={event.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{event.title}</p>
                    <span className="text-xs text-muted-foreground">
                      {event.actor.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {event.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(event.createdAt))}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </OperatorShell>
  )
}

function OperatorApplicationUnavailable() {
  return (
    <main className="mx-auto min-h-svh max-w-2xl px-5 py-20" id="main-content">
      <h1 className="font-heading text-4xl font-medium">
        The mock case could not be loaded
      </h1>
      <p className="mt-5 leading-7 text-muted-foreground">
        Check the local database and reload the operator work queue.
      </p>
    </main>
  )
}
