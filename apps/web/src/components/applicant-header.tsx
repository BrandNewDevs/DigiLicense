import { Link, useRouterState } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { ArrowUpRight, House, LogOut, Menu, Search, X } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { endMockSession, useMockSession } from "../lib/mock-auth"
import { services } from "../lib/services"
import { logoutDemoSession } from "../server-functions/demo-auth"
import { MockLoginPage } from "./mock-login-page"

function ApplicantHeader() {
  const isSignedIn = useMockSession("applicant")
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const logout = useServerFn(logoutDemoSession)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isSignInOpen, setIsSignInOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(
    null
  )
  const searchResultRefs = useRef<Array<HTMLAnchorElement | null>>([])

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  const matchingServices = services.filter((service) => {
    if (!normalizedSearchQuery) return true

    return [service.title, service.summary, service.description].some((value) =>
      value.toLocaleLowerCase().includes(normalizedSearchQuery)
    )
  })

  const signOut = async () => {
    setIsSigningOut(true)

    try {
      await logout({ data: { role: "applicant" } })
    } finally {
      endMockSession("applicant")
      window.location.assign("/")
    }
  }

  const openSearch = () => {
    setIsMenuOpen(false)
    setActiveSearchIndex(null)
    setSearchQuery("")
    setIsSearchOpen(true)
  }

  const accountControl = (className?: string) =>
    isSignedIn ? (
      <Popover>
        <PopoverTrigger
          className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 ${className ?? ""}`}
        >
          Account
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          <Link
            className="flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => setIsMenuOpen(false)}
            to="/dashboard"
          >
            Dashboard
          </Link>
          <button
            className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            disabled={isSigningOut}
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut aria-hidden="true" className="size-4" />
            {isSigningOut ? "Logging out..." : "Log out"}
          </button>
        </PopoverContent>
      </Popover>
    ) : (
      <Button
        className={className}
        onClick={() => {
          setIsMenuOpen(false)
          setIsSignInOpen(true)
        }}
        size="sm"
        type="button"
        variant="solid"
      >
        Sign in
      </Button>
    )

  return (
    <>
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link
            aria-label="DigiLicense home"
            className="shrink-0 text-lg font-semibold tracking-tight"
            to="/"
          >
            DigiLicense
          </Link>

          <div className="flex items-center gap-2 md:absolute md:left-1/2 md:-translate-x-1/2">
            <Link
              aria-current={pathname === "/" ? "page" : undefined}
              aria-label="Home"
              className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              to="/"
            >
              <House aria-hidden="true" className="size-4" />
              Home
            </Link>

            <Button
              className="hidden h-10 w-72 justify-start rounded-lg border-border bg-muted px-3 text-muted-foreground hover:bg-accent hover:text-foreground md:flex"
              onClick={openSearch}
              type="button"
              variant="outline"
            >
              <Search aria-hidden="true" className="size-4" />
              Search services
            </Button>
          </div>

          <div className="ml-auto hidden md:block">{accountControl()}</div>

          <Button
            aria-label="Open navigation"
            className="ml-auto md:hidden"
            onClick={() => setIsMenuOpen(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
        </div>
      </header>

      <Dialog onOpenChange={setIsMenuOpen} open={isMenuOpen}>
        <DialogContent className="max-w-sm">
          <DialogClose
            aria-label="Close navigation"
            className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogClose>
          <DialogHeader className="pr-10">
            <DialogTitle>Menu</DialogTitle>
            <DialogDescription>
              Find a service or manage your account.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 space-y-3">
            <Button
              className="h-11 w-full justify-start"
              onClick={openSearch}
              type="button"
              variant="outline"
            >
              <Search aria-hidden="true" className="size-4" />
              Search services
            </Button>
            <Link
              aria-current={pathname === "/" ? "page" : undefined}
              className="flex min-h-11 items-center gap-2 rounded-lg px-4 text-base font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() => setIsMenuOpen(false)}
              to="/"
            >
              <House aria-hidden="true" className="size-4" />
              Home
            </Link>
          </div>
          <div className="mt-6">{accountControl("w-full")}</div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setIsSearchOpen} open={isSearchOpen}>
        <DialogContent className="max-w-xl">
          <DialogClose
            aria-label="Close service search"
            className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogClose>
          <DialogHeader className="pr-10">
            <DialogTitle>Find a service</DialogTitle>
            <DialogDescription>
              Search by the task you need to complete.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5">
            <label className="sr-only" htmlFor="service-search">
              Search services
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                autoFocus
                className="h-11 w-full rounded-lg border border-input bg-background pr-3 pl-10 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                id="service-search"
                onChange={(event) => {
                  setActiveSearchIndex(null)
                  setSearchQuery(event.target.value)
                }}
                onFocus={() => setActiveSearchIndex(null)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    searchResultRefs.current[0]?.focus()
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault()
                    searchResultRefs.current[
                      matchingServices.length - 1
                    ]?.focus()
                  }
                }}
                placeholder="Search learner's licence, renewal, appointment..."
                type="search"
                value={searchQuery}
              />
            </div>
          </div>
          <div
            aria-label="Search results"
            className="mt-4 max-h-80 overflow-y-auto"
            role="region"
          >
            {matchingServices.length ? (
              <ul>
                {matchingServices.map((service, index) => (
                  <li
                    className={index === 0 ? "" : "border-t border-border pt-3"}
                    key={service.id}
                  >
                    <Link
                      className={`group -mx-2 block w-[calc(100%+1rem)] rounded-xl px-3 py-4 transition-colors ${
                        activeSearchIndex === index
                          ? "bg-accent"
                          : "hover:bg-accent"
                      }`}
                      onClick={() => setIsSearchOpen(false)}
                      onFocus={() => setActiveSearchIndex(index)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault()
                          searchResultRefs.current[index + 1]?.focus()
                        }

                        if (event.key === "ArrowUp") {
                          event.preventDefault()
                          if (index === 0) {
                            document.getElementById("service-search")?.focus()
                          } else {
                            searchResultRefs.current[index - 1]?.focus()
                          }
                        }

                        if (event.key === "Home") {
                          event.preventDefault()
                          searchResultRefs.current[0]?.focus()
                        }

                        if (event.key === "End") {
                          event.preventDefault()
                          searchResultRefs.current[
                            matchingServices.length - 1
                          ]?.focus()
                        }
                      }}
                      params={{ serviceId: service.id }}
                      ref={(element) => {
                        searchResultRefs.current[index] = element
                      }}
                      to="/services/$serviceId"
                    >
                      <span className="flex items-center justify-between gap-4 font-medium text-foreground">
                        {service.title}
                        <ArrowUpRight
                          aria-hidden="true"
                          className="size-4 shrink-0 transition-transform group-hover:rotate-45"
                        />
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                        {service.description}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-sm text-muted-foreground">
                No service matches that search.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <MockLoginPage
        onOpenChange={setIsSignInOpen}
        open={isSignInOpen}
        returnTo={pathname}
      />
    </>
  )
}

export { ApplicantHeader }
