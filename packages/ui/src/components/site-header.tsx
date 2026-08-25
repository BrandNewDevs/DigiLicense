import { useEffect, useMemo, useRef, useState } from "react"
import type {
  ElementType,
  FocusEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
} from "react"

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
  utility?: ReactNode
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

function getActiveNavigationHref(
  navigation: readonly NavigationItem[],
  pathname: string,
  hash: string
) {
  const hashTarget = hash.startsWith("#") ? hash.slice(1) : hash

  if (hashTarget) {
    return (
      navigation.find((item) => getHashTarget(item.href) === hashTarget)
        ?.href ?? ""
    )
  }

  return (
    navigation.find(
      (item) =>
        getHashTarget(item.href) === null &&
        getPathname(item.href) === pathname
    )?.href ?? ""
  )
}

function SiteHeader({
  account,
  actions = [],
  brand,
  brandHref,
  brandLabel,
  linkComponent,
  navigation,
  utility,
}: SiteHeaderProps) {
  const LinkElement = linkComponent ?? "a"
  const linkTarget = (href: string) => (linkComponent ? { to: href } : { href })
  const [currentPath, setCurrentPath] = useState("")
  const [activeHash, setActiveHash] = useState("")
  const [activeHref, setActiveHref] = useState("")
  const [indicatorPosition, setIndicatorPosition] =
    useState<IndicatorPosition | null>(null)
  const [isIndicatorVisible, setIsIndicatorVisible] = useState(false)
  const [shouldAnimateIndicator, setShouldAnimateIndicator] = useState(false)
  const navigationRef = useRef<HTMLElement>(null)
  const hideIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearIndicatorTimer = () => {
    if (hideIndicatorTimer.current) {
      clearTimeout(hideIndicatorTimer.current)
      hideIndicatorTimer.current = null
    }
  }

  const showIndicator = (
    element: HTMLAnchorElement,
    options: { animate?: boolean } = {}
  ) => {
    clearIndicatorTimer()
    setShouldAnimateIndicator(options.animate ?? true)
    setIndicatorPosition({
      left: element.offsetLeft,
      width: element.offsetWidth,
    })
    setIsIndicatorVisible(true)
  }

  const getNavigationLink = (href: string) =>
    Array.from(
      navigationRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []
    ).find((element) => element.getAttribute("href") === href)

  const restoreActiveIndicator = () => {
    clearIndicatorTimer()
    hideIndicatorTimer.current = setTimeout(() => {
      const activeLink = getNavigationLink(activeHref)

      if (activeLink) {
        showIndicator(activeLink)
      } else {
        setIsIndicatorVisible(false)
      }

      hideIndicatorTimer.current = null
    }, INDICATOR_HIDE_DELAY)
  }

  // Consumers often pass an inline array literal, so navigation identity
  // changes every render. Derive a primitive key from the hrefs and read the
  // latest navigation through a ref so effects below do not tear down and
  // rebuild observers on unrelated re-renders.
  const navigationItemsRef = useRef(navigation)

  useEffect(() => {
    navigationItemsRef.current = navigation
  }, [navigation])

  const sectionIds = useMemo(
    () =>
      navigation
        .map((item) => getHashTarget(item.href))
        .filter((id): id is string => Boolean(id)),
    [navigation]
  )

  const sectionIdsKey = sectionIds.join(" ")

  // Runs once: location listeners read navigation through the ref, so they
  // never need re-subscription and never discard an observed section.
  useEffect(() => {
    const syncLocation = () => {
      const pathname = window.location.pathname
      const hash = window.location.hash

      setCurrentPath(pathname)
      setActiveHash(hash.startsWith("#") ? hash.slice(1) : "")
      setActiveHref(
        getActiveNavigationHref(navigationItemsRef.current, pathname, hash)
      )
    }

    syncLocation()
    window.addEventListener("hashchange", syncLocation)
    window.addEventListener("popstate", syncLocation)

    return () => {
      window.removeEventListener("hashchange", syncLocation)
      window.removeEventListener("popstate", syncLocation)
    }
  }, [])

  // Re-subscribes only when the set of observed sections actually changes.
  useEffect(() => {
    if (!sectionIdsKey) return

    const hashTargets = sectionIdsKey
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element))

    if (hashTargets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
          .slice(0, 1)
          .forEach((entry) => {
            setActiveHash(entry.target.id)
            setActiveHref(
              navigationItemsRef.current.find(
                (item) => getHashTarget(item.href) === entry.target.id
              )?.href ?? ""
            )
          })
      },
      { rootMargin: "-20% 0px -55%", threshold: [0.1, 0.5, 0.9] }
    )

    hashTargets.forEach((target) => observer.observe(target))
    return () => {
      observer.disconnect()
    }
  }, [sectionIdsKey])

  useEffect(() => {
    const activeLink = getNavigationLink(activeHref)

    if (!activeLink) return

    showIndicator(activeLink, { animate: false })
    const animationFrame = window.requestAnimationFrame(() => {
      setShouldAnimateIndicator(true)
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [activeHref])

  useEffect(() => {
    const navigationElement = navigationRef.current

    if (!navigationElement) return

    const repositionIndicator = () => {
      const activeLink = getNavigationLink(activeHref)

      if (activeLink) {
        showIndicator(activeLink, { animate: false })
      }
    }

    const resizeObserver = new ResizeObserver(repositionIndicator)
    resizeObserver.observe(navigationElement)
    window.addEventListener("resize", repositionIndicator)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", repositionIndicator)
    }
  }, [activeHref])

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
          ref={navigationRef}
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 text-xs font-medium text-black max-md:static max-md:flex-1 max-md:translate-x-0 max-md:justify-center sm:text-sm"
          aria-label="Main navigation"
          onPointerLeave={restoreActiveIndicator}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0.5 rounded-full bg-background max-lg:hidden"
            style={{
              left: indicatorPosition?.left ?? 0,
              width: indicatorPosition?.width ?? 0,
              opacity: isIndicatorVisible ? 1 : 0,
              transition: isIndicatorVisible && shouldAnimateIndicator
                ? "left 200ms ease-out, width 200ms ease-out, opacity 200ms ease-out"
                : "none",
            }}
          />
          {navigation.map((item) => (
            <LinkElement
              {...linkTarget(item.href)}
              className={cn(
                "relative z-10 inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-1.5 text-xs text-black transition-colors hover:text-black focus-visible:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3 sm:text-sm",
                getHashTarget(item.href) === null &&
                currentPath === getPathname(item.href)
                  ? "after:absolute after:right-2 after:bottom-0.5 after:left-2 after:h-0.5 after:rounded-full after:bg-current lg:after:hidden"
                  : activeHash === getHashTarget(item.href)
                  ? "after:absolute after:right-2 after:bottom-0.5 after:left-2 after:h-0.5 after:rounded-full after:bg-current lg:after:hidden"
                  : ""
              )}
              key={item.href}
              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                setActiveHref(item.href)
                showIndicator(event.currentTarget)
              }}
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

        {account || actions.length > 0 ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {account ? (
              account
            ) : actions.length > 0 ? (
              <nav className="flex items-center gap-1 text-sm font-medium" aria-label="Account">
                {actions.map((item) => (
                  <LinkElement
                    {...linkTarget(item.href)}
                    className={cn(
                      buttonVariants({
                        variant: item.label === "Sign in" ? "solid" : "outline",
                        size: "sm",
                      }),
                      "h-9 rounded-full px-4 text-sm max-[380px]:px-2",
                      item.label === "Sign in" &&
                        "bg-[#d96b16] text-white hover:bg-[#b9550d]"
                    )}
                    key={item.href}
                  >
                    {item.label}
                  </LinkElement>
                ))}
              </nav>
            ) : null}
          </div>
        ) : (
          <div aria-hidden="true" />
        )}
      </div>
      {utility ? (
        <>
          <div className="absolute top-5 right-5 hidden md:block">
            {utility}
          </div>
          {/* Small screens have no room beside the navigation pill. Render
              the utility (accessibility controls) in flow under the header
              row so it stays reachable instead of being display:none. */}
          <div className="flex justify-end px-4 pb-1 md:hidden">{utility}</div>
        </>
      ) : null}
    </header>
  )
}

export { SiteHeader }
export type { NavigationItem, SiteHeaderProps }
