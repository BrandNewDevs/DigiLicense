import { LogOut, ShieldCheck } from "lucide-react"
import type { ReactNode } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { Button } from "@workspace/ui/components/button"
import { SiteFooter } from "@workspace/ui/components/site-footer"
import { SiteHeader } from "@workspace/ui/components/site-header"

import { endMockSession } from "../lib/mock-auth"
import { logoutDemoSession } from "../server-functions/demo-auth"

function OperatorShell({ children }: { children: ReactNode }) {
  const logout = useServerFn(logoutDemoSession)
  const navigate = useNavigate()

  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader
        brand="DigiLicense Operator"
        brandHref="/operator"
        brandLabel="Operator dashboard"
        linkComponent={Link}
        navigation={[{ href: "/operator", label: "Applications" }]}
      />

      <div className="border-b border-border bg-muted">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>Demo Operator 001</span>
            <span className="text-muted-foreground">
              Synthetic records only
            </span>
          </div>
          <Button
            className="h-9 w-fit"
            onClick={async () => {
              await logout({ data: { role: "operator" } })
              endMockSession("operator")
              await navigate({ to: "/operator/login" })
            }}
            type="button"
            variant="outline"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </div>

      {children}

      <SiteFooter title="DigiLicense Operator">
        <p>
          Independent Delhi-only prototype. Operator actions change synthetic
          DigiLicense records and never contact a government system.
        </p>
      </SiteFooter>
    </div>
  )
}

export { OperatorShell }
