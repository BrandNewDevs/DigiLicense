import { useEffect, useRef, useState } from "react"
import type { ElementType, FocusEvent, PointerEvent, ReactNode } from "react"

import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

type NavigationItem = {
  href: string
  label: string
}

type SiteHeaderProps = {
  account?: ReactNode
  actions?: readonly NavigationItem[]
  brand: ReactNode
  brandHref: string
  brandLabel?: string
  linkComponent?: ElementType
  navigation: readonly NavigationItem[]
}

type IndicatorPosition = {
  left: number
  width: number
}

const INDICATOR_HIDE_DELAY = 400

function getHashTarget(href: string) {
  const hashIndex = href.indexOf("#")
  return hashIndex === -1 ? null : href.slice(hashIndex + 1)
}

function getPathname(href: string) {
  return href.split("#")[0] || "/"
}

function SiteHeader({
  account,
  actions = [],
  brand,
  brandHref,
  brandLabel,
  linkComponent,
  navigation,
}: SiteHeaderProps) {
  const LinkElement = linkComponent ?? "a"
  const linkTarget = (href: string) => (linkComponent ? { to: href } : { href })
  const [currentPath, setCurrentPath] = useState("")
  const [activeHash, setActiveHash] = useState("")
  const [indicatorPosition, setIndicatorPosition] =
    useState<IndicatorPosition | null>(null)
  const [isIndicatorVisible, setIsIndicatorVisible] = useState(false)
  const hideIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearIndicatorTimer = () => {
    if (hideIndicatorTimer.current) {
      clearTimeout(hideIndicatorTimer.current)
      hideIndicatorTimer.current = null
    }
  }

  const showIndicator = (element: HTMLAnchorElement) => {
    clearIndicatorTimer()
    setIndicatorPosition({
      left: element.offsetLeft,
      width: element.offsetWidth,
    })
    setIsIndicatorVisible(true)
  }

  const hideIndicator = () => {
    clearIndicatorTimer()
    hideIndicatorTimer.current = setTimeout(() => {
      setIsIndicatorVisible(false)
      hideIndicatorTimer.current = null
    }, INDICATOR_HIDE_DELAY)
  }

  useEffect(() => {
    setCurrentPath(window.location.pathname)

    const hashTargets = navigation
      .map((item) => item.href)
      .filter((href) => href.includes("#"))
      .map((href) => href.slice(href.indexOf("#") + 1))
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element))

    if (hashTargets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
          .slice(0, 1)
          .forEach((entry) => setActiveHash(entry.target.id))
      },
      { rootMargin: "-20% 0px -55%", threshold: [0.1, 0.5, 0.9] }
    )

    hashTargets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [navigation])

  useEffect(() => () => clearIndicatorTimer(), [])

  return (
    <header className="sticky top-0 z-40 px-4 pt-4 pb-4 sm:pt-5">
      <div className="relative mx-auto flex h-12 max-w-[calc(100vw-2rem)] items-center gap-0.5 rounded-full border border-border/70 bg-gradient-to-r from-background/75 via-background/40 to-background/75 px-1 shadow-md shadow-black/10 backdrop-blur-xl sm:max-w-[720px] sm:gap-1 sm:px-1.5">
        <LinkElement
          {...linkTarget(brandHref)}
          className="inline-flex h-9 shrink-0 items-center rounded-full px-3 font-heading text-sm font-semibold tracking-[-0.04em] text-black transition-colors hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-md:hidden sm:px-4"
          aria-label={brandLabel}
        >
          {brand}
        </LinkElement>

        <nav
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 text-xs font-medium text-black max-md:static max-md:flex-1 max-md:translate-x-0 max-md:justify-center sm:text-sm"
          aria-label="Main navigation"
          onPointerLeave={hideIndicator}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0.5 rounded-full bg-background max-lg:hidden"
            style={{
              left: indicatorPosition?.left ?? 0,
              width: indicatorPosition?.width ?? 0,
              opacity: isIndicatorVisible ? 1 : 0,
              transition: isIndicatorVisible
                ? "left 200ms ease-out, width 200ms ease-out, opacity 200ms ease-out"
                : "opacity 200ms ease-out",
            }}
          />
          {navigation.map((item) => (
            <LinkElement
              {...linkTarget(item.href)}
              className={cn(
                "relative z-10 inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-1.5 text-xs text-black transition-colors hover:text-black focus-visible:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3 sm:text-sm",
                getHashTarget(item.href) === null &&
                currentPath === getPathname(item.href)
                  ? "after:absolute after:right-2 after:bottom-0.5 after:left-2 after:h-0.5 after:rounded-full after:bg-current"
                  : activeHash === getHashTarget(item.href)
                  ? "after:absolute after:right-2 after:bottom-0.5 after:left-2 after:h-0.5 after:rounded-full after:bg-current"
                  : ""
              )}
              key={item.href}
              onFocus={(event: FocusEvent<HTMLAnchorElement>) =>
                showIndicator(event.currentTarget)
              }
              onPointerEnter={(event: PointerEvent<HTMLAnchorElement>) =>
                showIndicator(event.currentTarget)
              }
            >
              {item.label}
            </LinkElement>
          ))}
        </nav>

        {account ? (
          <div className="ml-auto flex items-center gap-1">{account}</div>
        ) : actions.length > 0 ? (
          <nav
            className="ml-auto flex items-center gap-1 text-sm font-medium"
            aria-label="Account"
          >
            {actions.map((item) => (
              <LinkElement
                {...linkTarget(item.href)}
                className={cn(
                  buttonVariants({
                    variant: item.label === "Sign in" ? "solid" : "outline",
                    size: "sm",
                  }),
                  "h-9 rounded-full px-4 text-sm"
                )}
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
