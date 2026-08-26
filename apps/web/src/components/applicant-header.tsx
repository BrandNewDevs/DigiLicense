import { Link, useRouterState } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { LogOut } from "lucide-react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { SiteHeader } from "@workspace/ui/components/site-header"
import type { NavigationItem } from "@workspace/ui/components/site-header"

import { endMockSession, useMockSession } from "../lib/mock-auth"
import { logoutDemoSession } from "../server-functions/demo-auth"
import { DisplayPreferencesControl } from "./display-preferences"
import { MockLoginPage } from "./mock-login-page"

type ApplicantHeaderProps = {
  navigation: readonly NavigationItem[]
  returnTo: string
}

function ApplicantHeader({ navigation, returnTo }: ApplicantHeaderProps) {
  const isSignedIn = useMockSession("applicant")
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const logout = useServerFn(logoutDemoSession)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isSignInOpen, setIsSignInOpen] = useState(false)

  return (
    <>
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
                variant="solid"
              >
                {isSigningOut ? "Logging out..." : "Logout"}
                <LogOut aria-hidden="true" className="size-4" />
              </Button>
            </>
          ) : (
            <Button
              className="h-9 rounded-full bg-black px-4 text-base text-white hover:bg-black/80"
              onClick={() => setIsSignInOpen(true)}
              size="sm"
              type="button"
              variant="solid"
            >
              Sign in
            </Button>
          )
        }
        actions={[]}
        brand="DigiLicense"
        brandLabel="DigiLicense"
        initialPathname={pathname}
        linkComponent={Link}
        navigation={navigation}
        utility={<DisplayPreferencesControl />}
      />
      <MockLoginPage
        onOpenChange={setIsSignInOpen}
        open={isSignInOpen}
        returnTo={returnTo}
      />
    </>
  )
}

export { ApplicantHeader }
