import { LockKeyhole } from "lucide-react"
import { Link } from "@tanstack/react-router"

function OperatorAccessRequired() {
  return (
    <main
      className="mx-auto min-h-[70svh] max-w-2xl px-5 py-20 sm:px-8"
      id="main-content"
    >
      <LockKeyhole className="size-9" aria-hidden="true" />
      <p className="mt-6 text-sm font-medium text-muted-foreground">
        Operator session required
      </p>
      <h1 className="mt-3 font-heading text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
        Sign in to open the mock work queue
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
        Use the displayed synthetic credentials. This sign-in cannot access a
        government or staff identity system.
      </p>
      <Link
        className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/80"
        to="/operator/login"
      >
        Go to operator sign in
      </Link>
    </main>
  )
}

export { OperatorAccessRequired }
