import type { ReactNode } from "react"

type NavigationItem = {
  href: string
  label: string
}

type SiteHeaderProps = {
  brand: ReactNode
  brandHref: string
  brandLabel?: string
  navigation: readonly NavigationItem[]
}

function SiteHeader({
  brand,
  brandHref,
  brandLabel,
  navigation,
}: SiteHeaderProps) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <a
          href={brandHref}
          className="inline-flex min-h-11 items-center font-heading text-lg font-semibold tracking-[-0.04em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          aria-label={brandLabel}
        >
          {brand}
        </a>

        <nav
          className="flex items-center text-sm font-medium text-muted-foreground"
          aria-label="Main navigation"
        >
          {navigation.map((item) => (
            <a
              className="inline-flex min-h-11 items-center transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}

export { SiteHeader }
export type { NavigationItem, SiteHeaderProps }
