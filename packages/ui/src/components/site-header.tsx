import type { ElementType, ReactNode } from "react"

type NavigationItem = {
  href: string
  label: string
}

type SiteHeaderProps = {
  brand: ReactNode
  brandHref: string
  brandLabel?: string
  linkComponent?: ElementType
  navigation: readonly NavigationItem[]
}

function SiteHeader({
  brand,
  brandHref,
  brandLabel,
  linkComponent,
  navigation,
}: SiteHeaderProps) {
  const LinkElement = linkComponent ?? "a"
  const linkTarget = (href: string) =>
    linkComponent ? { to: href } : { href }

  return (
    <header className="bg-background">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <LinkElement
          {...linkTarget(brandHref)}
          className="inline-flex min-h-11 items-center font-heading text-lg font-semibold tracking-[-0.04em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          aria-label={brandLabel}
        >
          {brand}
        </LinkElement>

        <nav
          className="flex items-center gap-5 text-sm font-medium text-muted-foreground"
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
      </div>
    </header>
  )
}

export { SiteHeader }
export type { NavigationItem, SiteHeaderProps }
