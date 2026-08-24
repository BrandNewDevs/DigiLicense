import { Link, useNavigate } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { LogOut } from "lucide-react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { SiteHeader } from "@workspace/ui/components/site-header"
import type { NavigationItem } from "@workspace/ui/components/site-header"

import { endMockSession, useMockSession } from "../lib/mock-auth"
import { logoutDemoSession } from "../server-functions/demo-auth"

type ApplicantHeaderProps = {
  navigation: readonly NavigationItem[]
  returnTo: string
}

function ApplicantHeader({ navigation, returnTo }: ApplicantHeaderProps) {
  const isSignedIn = useMockSession("applicant")
  const logout = useServerFn(logoutDemoSession)
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)

  return (
    <SiteHeader
      account={
        isSignedIn ? (
          <>
            <Button
              className="h-9 rounded-full px-3 text-sm"
              disabled={isSigningOut}
              onClick={async () => {
                setIsSigningOut(true)

                try {
                  await logout({ data: { role: "applicant" } })
                  endMockSession("applicant")
                  await navigate({ to: "/" })
                } finally {
                  setIsSigningOut(false)
                }
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <LogOut className="size-4" aria-hidden="true" />
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
    />
  )
}

export { ApplicantHeader }
