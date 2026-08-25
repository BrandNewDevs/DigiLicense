import { Link } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { SiteHeader } from "@workspace/ui/components/site-header"
import type { NavigationItem } from "@workspace/ui/components/site-header"

import { endMockSession, useMockSession } from "../lib/mock-auth"
import { logoutDemoSession } from "../server-functions/demo-auth"
import { DisplayPreferencesControl } from "./display-preferences"

type ApplicantHeaderProps = {
  navigation: readonly NavigationItem[]
  returnTo: string
}

function ApplicantHeader({ navigation, returnTo }: ApplicantHeaderProps) {
  const isSignedIn = useMockSession("applicant")
  const logout = useServerFn(logoutDemoSession)
  const [isSigningOut, setIsSigningOut] = useState(false)

  return (
    <SiteHeader
      account={
        isSignedIn ? (
          <>
            <Button
              className="h-9 rounded-full bg-black px-3 text-sm text-white hover:bg-black/80 hover:text-red-400"
              disabled={isSigningOut}
              onClick={async () => {
                setIsSigningOut(true)

                try {
                  await logout({ data: { role: "applicant" } })
                } finally {
                  endMockSession("applicant")
                  window.location.assign("/")
                }
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {isSigningOut ? "Logging out..." : "Logout"}
            </Button>
          </>
        ) : undefined
      }
      actions={
        isSignedIn
          ? []
          : [
              {
                href: `/applicant/login?returnTo=${encodeURIComponent(returnTo)}`,
                label: "Sign in",
              },
            ]
      }
      brand="DigiLicense"
      brandHref="/"
      brandLabel="DigiLicense home"
      linkComponent={Link}
      navigation={navigation}
      utility={<DisplayPreferencesControl />}
    />
  )
}

export { ApplicantHeader }
