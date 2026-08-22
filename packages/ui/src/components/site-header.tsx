import type { ElementType, ReactNode } from "react"

type NavigationItem = {
  href: string
  label: string
}

type SiteHeaderProps = {
  actions?: readonly NavigationItem[]
  brand: ReactNode
  brandHref: string
  brandLabel?: string
  linkComponent?: ElementType
  navigation: readonly NavigationItem[]
}

function SiteHeader({
  actions = [],
  brand,
  brandHref,
  brandLabel,
  linkComponent,
  navigation,
}: SiteHeaderProps) {
  const LinkElement = linkComponent ?? "a"
  const linkTarget = (href: string) => (linkComponent ? { to: href } : { href })

  return (
    <header className="bg-background">
      <div className="mx-auto grid h-16 max-w-[1240px] grid-cols-[1fr_auto_1fr] items-center px-5 sm:px-8 lg:px-10">
        <LinkElement
          {...linkTarget(brandHref)}
          className="inline-flex min-h-11 items-center font-heading text-lg font-semibold tracking-[-0.04em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          aria-label={brandLabel}
        >
          {brand}
        </LinkElement>

        <nav
          className="flex items-center justify-center gap-5 text-sm font-medium text-muted-foreground"
          aria-label="Main navigation"
        >
          {navigation.map((item) => (
            <LinkElement
              {...linkTarget(item.href)}
              className="inline-flex min-h-11 items-center transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              key={item.href}
            >
              {item.label}
            </LinkElement>
          ))}
        </nav>

        {actions.length > 0 ? (
          <nav
            className="flex items-center justify-end gap-4 text-sm font-medium"
            aria-label="Account"
          >
            {actions.map((item) => (
              <LinkElement
                {...linkTarget(item.href)}
                className="inline-flex min-h-11 items-center transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                key={item.href}
              >
                {item.label}
              </LinkElement>
            ))}
          </nav>
        ) : (
          <div aria-hidden="true" />
        )}
      </div>
    </header>
  )
}

export { SiteHeader }
export type { NavigationItem, SiteHeaderProps }
