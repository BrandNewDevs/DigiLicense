import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

import appCss from "@workspace/ui/globals.css?url"

import { DisplayPreferencesProvider } from "../components/display-preferences"

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
  notFoundComponent: () => (
    <main id="main-content" className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
        <DisplayPreferencesProvider>{children}</DisplayPreferencesProvider>
        <Scripts />
      </body>
    </html>
  )
}
