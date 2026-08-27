import { Link, createFileRoute } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardList,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { MockApplicantGate } from "../components/mock-applicant-gate"
import { readApplicantDashboard } from "../server-functions/dashboard"

export const Route = createFileRoute("/dashboard")({ component: DashboardPage })

type Dashboard = Extract<
  Awaited<ReturnType<typeof readApplicantDashboard>>,
  { kind: "found" }
>

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function DashboardPage() {
  return (
    <MockApplicantGate returnTo="/dashboard">
      <DashboardContent />
    </MockApplicantGate>
  )
}

function DashboardContent() {
  const readDashboard = useServerFn(readApplicantDashboard)
  const [dashboard, setDashboard] = useState<Dashboard>()
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  async function refresh() {
    setIsLoading(true)
    try {
      const result = await readDashboard({ data: undefined })
      if (result.kind === "found") {
        setDashboard(result)
        setMessage("")
      } else {
        setMessage(result.message)
      }
    } catch {
      setMessage("Your dashboard is temporarily unavailable.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <main
      className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14"
      id="main-content"
    >
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-base text-muted-foreground underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        to="/"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to home
      </Link>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">
            Applicant account
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Your dashboard
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            See what needs your attention and continue each application from its
            next step.
          </p>
        </div>
        <Button
          disabled={isLoading}
          onClick={() => void refresh()}
          type="button"
          variant="outline"
        >
          Refresh
        </Button>
      </div>
      <p
        aria-live="polite"
        className="mt-5 text-sm text-muted-foreground"
        role="status"
      >
        {message}
      </p>
      {isLoading && !dashboard ? <DashboardSkeleton /> : null}
      {dashboard ? (
        <DashboardApplications applications={dashboard.applications} />
      ) : null}
    </main>
  )
}

type DashboardApplication = Dashboard["applications"][number]

function DashboardApplications({
  applications,
}: {
  applications: DashboardApplication[]
}) {
  if (!applications.length)
    return (
      <section className="mt-8 rounded-xl border border-border bg-card p-6 sm:p-8">
        <ClipboardList aria-hidden="true" className="size-6 text-primary" />
        <h2 className="mt-4 text-xl font-semibold">No applications yet</h2>
        <p className="mt-2 leading-7 text-muted-foreground">
          Start with a learner's-licence application to begin your first-time
          licence journey.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          params={{ serviceId: "learner-licence" }}
          to="/services/$serviceId"
        >
          Apply for a learner's licence
        </Link>
      </section>
    )
  const unreadNotifications = applications.reduce(
    (total, application) => total + application.unreadNotifications,
    0
  )
  return (
    <>
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <ClipboardList aria-hidden="true" className="size-5 text-primary" />
          <p className="mt-3 text-2xl font-semibold">{applications.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Application{applications.length === 1 ? "" : "s"} in your account
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Bell aria-hidden="true" className="size-5 text-primary" />
          <p className="mt-3 text-2xl font-semibold">{unreadNotifications}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Unread notification{unreadNotifications === 1 ? "" : "s"}
          </p>
        </div>
      </section>
      <section aria-labelledby="applications-title" className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold" id="applications-title">
            Your applications
          </h2>
          <Link
            className="text-sm font-medium underline"
            params={{ serviceId: "track-application" }}
            to="/services/$serviceId"
          >
            Track an application
          </Link>
        </div>
        <div className="mt-4 divide-y rounded-xl border border-border bg-card">
          {applications.map((application, index) => (
            <ApplicationCard
              application={application}
              isPrimary={index === 0}
              key={application.applicationNumber}
            />
          ))}
        </div>
      </section>
    </>
  )
}

function ApplicationCard({
  application,
  isPrimary,
}: {
  application: DashboardApplication
  isPrimary: boolean
}) {
  const serviceId =
    application.service === "Permanent driving licence"
      ? "appointments"
      : application.service === "Learner's licence"
        ? "learner-test"
        : "application-status"
  return (
    <article className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">
            {isPrimary ? "Current application" : application.statusLabel}
          </p>
          <h3 className="mt-1 text-lg font-semibold">{application.service}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Reference: {application.applicationNumber}
          </p>
        </div>
        {application.statusDeadlineAt ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays aria-hidden="true" className="size-4" />
            By {formatDate(application.statusDeadlineAt)}
          </p>
        ) : null}
      </div>
      <p className="mt-4 leading-7">{application.nextAction}</p>
      {application.unreadNotifications ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {application.unreadNotifications} unread notification
          {application.unreadNotifications === 1 ? "" : "s"}
        </p>
      ) : null}
      <Link
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        params={{ serviceId }}
        to="/services/$serviceId"
      >
        {isPrimary ? "Continue" : "View next step"}
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </article>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="mt-8 space-y-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
