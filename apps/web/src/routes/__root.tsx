import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"

import appCss from "@workspace/ui/globals.css?url"

import { ApplicantAssistantLauncher } from "../components/applicant-assistant"
import { AppFooter } from "../components/app-footer"
import { ApplicantHeader } from "../components/applicant-header"
import { AssistantPublicContextProvider } from "../lib/assistant-public-context"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "DigiLicense",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  component: RootLayout,
  notFoundComponent: () => (
    <main id="main-content" className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background pb-24 text-foreground md:pb-0">
      <ApplicantHeader />
      <AssistantPublicContextProvider>
        <Outlet />
        <ApplicantAssistantLauncher />
      </AssistantPublicContextProvider>
      <AppFooter />
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html className="scroll-smooth motion-reduce:scroll-auto" lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only fixed top-4 left-4 z-50 rounded-md border border-foreground px-4 py-3 text-sm font-medium text-foreground focus:not-sr-only focus:outline-2 focus:outline-offset-4 focus:outline-ring"
        >
          Skip to main content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
