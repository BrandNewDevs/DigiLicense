import { Link } from "@tanstack/react-router"
import { FaGithub } from "react-icons/fa"
import { FaXTwitter } from "react-icons/fa6"

const footerSocialItems = [
  {
    label: "X",
    menuLabel: "Creators",
    actions: [
      { label: "@yajush_who", href: "https://x.com/Yajush_who" },
      { label: "@fuzzykny", href: "https://x.com/fuzzykny" },
    ],
    icon: FaXTwitter,
  },
  {
    label: "GitHub",
    menuLabel: "Contributors",
    actions: [
      { label: "Yajush", href: "https://github.com/Yajush-afk" },
      { label: "Kritiraj", href: "https://github.com/fuzzyKenny" },
    ],
    icon: FaGithub,
  },
] as const

function AppFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            aria-label="DigiLicense"
            className="text-base font-semibold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            to="/"
          >
            DigiLicense
          </Link>
          <p className="mt-2 max-w-sm leading-6">
            A clearer way to understand Delhi driving-licence services.
          </p>
          <p className="mt-3 max-w-sm leading-6">
            DigiLicense is independent. No government service is connected.
          </p>
          <div className="mt-4 flex gap-2">
            {footerSocialItems.map(({ actions, icon: Icon, label, menuLabel }) => (
              <details className="relative" key={label}>
                <summary
                  aria-label={label}
                  className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md border border-input text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
                >
                  <Icon aria-hidden="true" className="size-4" />
                </summary>
                <div className="absolute bottom-11 left-0 z-10 w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                  <p className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                    {menuLabel}
                  </p>
                  {actions.map((action) => (
                    <a
                      className="flex min-h-9 items-center rounded-sm px-3 text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                      href={action.href}
                      key={action.label}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {action.label}
                    </a>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>

        <nav aria-label="Footer navigation" className="flex flex-col items-start gap-3">
          <Link
            className="transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            to="/services"
          >
            Services
          </Link>
          <Link
            className="transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            params={{ serviceId: "track-application" }}
            to="/services/$serviceId"
          >
            Track an application
          </Link>
          <Link
            className="transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            params={{ serviceId: "fees" }}
            to="/services/$serviceId"
          >
            Fee schedule
          </Link>
        </nav>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="border-t" />
        <p className="py-4 text-right text-sm text-muted-foreground">
          © 2026 DigiLicense
        </p>
      </div>
    </footer>
  )
}

export { AppFooter }
