import { ArrowRight, ClipboardList, Clock3, ListChecks } from "lucide-react"
import { Link, createFileRoute } from "@tanstack/react-router"

import { OperatorAccessRequired } from "../components/operator-access-required"
import { OperatorShell } from "../components/operator-shell"
import { getActionsForStatus, getStatusLabel } from "../lib/operator-workflow"
import { getOperatorDashboard } from "../server-functions/operator"

export const Route = createFileRoute("/operator/")({
  loader: () => getOperatorDashboard(),
  component: OperatorDashboardPage,
  errorComponent: OperatorDashboardUnavailable,
})

function OperatorDashboardPage() {
  const data = Route.useLoaderData()

  if (data.kind === "authentication-required") {
    return <OperatorAccessRequired />
  }

  const actionableCount = data.applications.filter(
    (application) => getActionsForStatus(application.status).length > 0
  ).length
  const waitlistCount = data.applications.filter(
    (application) => application.status === "WAITLISTED"
  ).length

  return (
    <OperatorShell>
      <main id="main-content">
        <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
          <p className="text-sm font-medium text-muted-foreground">
            Synthetic operations
          </p>
          <h1 className="mt-3 max-w-3xl font-heading text-4xl font-medium tracking-[-0.055em] sm:text-6xl">
            Application work queue
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            Review seeded cases and record simulated decisions. Every change is
            persisted with workflow and audit history.
          </p>

          <dl className="mt-9 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            <SummaryItem
              icon={<ClipboardList className="size-5" aria-hidden="true" />}
              label="Seeded applications"
              value={data.applications.length}
            />
            <SummaryItem
              icon={<ListChecks className="size-5" aria-hidden="true" />}
              label="Need an operator action"
              value={actionableCount}
            />
            <SummaryItem
              icon={<Clock3 className="size-5" aria-hidden="true" />}
              label="On the mock waitlist"
              value={waitlistCount}
            />
          </dl>

          <section className="mt-12" aria-labelledby="queue-title">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Oldest first</p>
                <h2
                  className="mt-1 font-heading text-2xl font-medium"
                  id="queue-title"
                >
                  Open cases
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {data.applications.length} records
              </p>
            </div>

            {data.applications.length === 0 ? (
              <div className="mt-5 rounded-xl border border-border p-8 text-center">
                <p className="font-medium">No synthetic applications found</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Run the Prisma seed command to create the demo work queue.
                </p>
              </div>
            ) : (
              <ul className="mt-5 divide-y divide-border border-y border-border">
                {data.applications.map((application) => (
                  <li key={application.id}>
                    <Link
                      className="group grid min-h-24 gap-3 py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:grid-cols-[1fr_auto] sm:items-center"
                      params={{ applicationId: application.id }}
                      to="/operator/applications/$applicationId"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {application.service}
                          </span>
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                            {getStatusLabel(application.status)}
                          </span>
                        </div>
                        <p className="mt-2 font-mono text-sm text-muted-foreground">
                          {application.applicationNumber}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {application.nextAction}
                        </p>
                      </div>
                      <span className="flex items-center gap-2 text-sm font-medium underline-offset-4 group-hover:underline">
                        Open case
                        <ArrowRight
                          className="size-4 -rotate-45 transition-transform group-hover:rotate-0 group-focus-visible:rotate-0 motion-reduce:transition-none"
                          aria-hidden="true"
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-12" aria-labelledby="audit-title">
            <h2 className="font-heading text-2xl font-medium" id="audit-title">
              Recent audit activity
            </h2>
            {data.audits.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No operator actions have been recorded yet.
              </p>
            ) : (
              <ol className="mt-5 space-y-3">
                {data.audits.map((audit) => (
                  <li
                    className="rounded-lg bg-muted p-4 text-sm"
                    key={audit.id}
                  >
                    <p className="font-medium">
                      {audit.action.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {audit.entityId} · {audit.reasonCode.replaceAll("_", " ")}{" "}
                      ·{" "}
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(audit.createdAt))}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </main>
    </OperatorShell>
  )
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="bg-card p-5">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-3 font-heading text-3xl font-medium">{value}</dd>
    </div>
  )
}

function OperatorDashboardUnavailable() {
  return (
    <main className="mx-auto min-h-svh max-w-2xl px-5 py-20" id="main-content">
      <p className="text-sm font-medium text-muted-foreground">
        Mock service unavailable
      </p>
      <h1 className="mt-3 font-heading text-4xl font-medium tracking-[-0.05em]">
        The synthetic work queue could not be loaded
      </h1>
      <p className="mt-5 leading-7 text-muted-foreground">
        Check the PostgreSQL connection, apply the migration, and seed the demo
        scenarios. No external service is involved.
      </p>
    </main>
  )
}
