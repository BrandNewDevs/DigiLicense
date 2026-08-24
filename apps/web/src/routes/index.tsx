import { createFileRoute } from "@tanstack/react-router"

import { ApplicantHeader } from "../components/applicant-header"

export const Route = createFileRoute("/")({ component: App })

function App() {
  return (
    <div className="flex min-h-svh flex-col overflow-hidden text-foreground">
      <ApplicantHeader
        navigation={[
          { href: "/#about", label: "About" },
          { href: "/services", label: "Services" },
          { href: "/#how-it-works", label: "How it works" },
        ]}
        returnTo="/"
      />

      <main className="flex flex-1 justify-center pt-16" id="main-content">
        <div className="w-full max-w-3xl px-5 text-center">
          <h1 className="font-satoshi text-2xl font-semibold tracking-tight text-foreground sm:text-5xl">
            <>
              <span className="block text-black">
                License <span className="italic">services</span>
              </span>
              <span className="block text-[#d96b16]">
                <span className="text-black">Without the</span>{" "}
                <span className="relative inline-block no-underline after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 after:ease-out hover:after:scale-x-100">
                  <span className="italic">Confusion</span>
                </span>
              </span>
            </>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-xl">
            Licence services, without the bureaucratic obstacle course.
          </p>
        </div>
      </main>

    </div>
  )
}
