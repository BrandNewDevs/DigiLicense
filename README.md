# DigiLicense

DigiLicense is a hackathon project for [Build What Moves India](https://www.buildwhatmovesindia.com/).
We are building a faster, safer, and more citizen-centred alternative to the
current online driving licence experience in India's government transport
services.

The project responds to common problems people face while using Parivahan:
the service is hard to navigate, some features do not work as expected,
application updates can be slow, fee payments can fail, and progress tracking
is not clear enough. DigiLicense puts the service a citizen needs first, then
guides them through the next step with clearer information.

The long-term goal is a secure, reliable, and easy-to-use licence service that
gives people a clear path from application to completion. That includes simple
navigation, useful status updates, dependable payments, and careful handling
of personal information.

The current repository contains a frontend prototype. Its service pages and
status lookup show the intended user flow, but they do not yet submit data to a
government system or a project backend. DigiLicense is an independent project,
not a government website, and is not affiliated with or endorsed by any
government department or agency.

## Why DigiLicense

People should not have to search through a large portal to find one licence
service or wonder whether a payment and application update went through. The
product is designed around the questions a citizen has at each step:

- What service do I need?
- What information should I have ready?
- What happens after I submit it?
- How do I know whether my application is moving forward?

The first version focuses on making those entry points clear. Later versions
will connect the flows to the project backend and clearly labelled simulated
payment, identity, and government-action adapters.

## Current features

- A responsive home page at `/` with the main licence services.
- A keyboard-accessible service carousel with previous and next controls.
- A tracking form that posts the application number to a TanStack Start server
  function for validation and applicant-scoped PostgreSQL lookup. The number is
  never put in the URL, and the browser receives only safe status fields.
- Separate synthetic applicant and operator sign-ins backed by short-lived,
  HTTP-only, role-bound server sessions.
- An operator work queue at `/operator` with seeded synthetic applications,
  explicit workflow commands, allowlisted decision reasons, and audit history.
  Free-text decision notes are not accepted, so contact details or application
  data cannot enter the append-only records.
- A case page where simulated document, payment, learner-test, and approval
  actions update the same record shown by applicant tracking.
- A shared dynamic service route at `/services/$serviceId` for renewal,
  learner's licence, application tracking, and detail updates.
- A skip link, labelled navigation, visible focus styles, form labels, and
  reduced-motion handling for the main interactive elements.
- A shared `@workspace/ui` package containing the button, carousel, utility,
  and global style code used by the web app.

## Hackathon direction

DigiLicense is being developed around four product goals:

- Make the main licence services easy to find and understand.
- Show application progress in language people can act on.
- Build payment and submission flows that are dependable and secure.
- Treat accessibility, privacy, and citizen trust as product requirements.

The current code demonstrates the navigation and interaction layer. It does
not yet provide production authentication, backend storage, payment
processing, or integration with Parivahan or another government system.

## Tech stack

- React 19
- TanStack Start and TanStack Router
- Vite
- TypeScript
- Tailwind CSS v4
- shadcn/ui component conventions
- Lucide React icons
- pnpm workspaces and Turborepo
- Geist Variable font

## Architecture

The web application uses TanStack Start as its full-stack React framework and
TanStack Router for file-based routing. Browser code renders the interface and
submits user actions. TanStack Start server functions or server routes will own
authenticated reads and mutations, input validation, workflow enforcement,
auditing, and database access.

PostgreSQL on Neon will store synthetic product data, with Prisma handling the
schema, migrations, queries, and seed data. The application must run on a
server-capable deployment target so server-side rendering and server functions
remain available. It is not designed as a static-only Vite deployment.

The bilingual assistant will run as a separate stateless FastAPI service. Only
the TanStack Start server may call it. The browser will not call it directly,
and the AI service will not have database credentials or access to applicant
records.

## Repository structure

```text
.
├── apps/
│   └── web/
│       ├── src/routes/index.tsx                # Home page
│       ├── src/routes/services.$serviceId.tsx  # Service pages
│       ├── src/routes/__root.tsx               # Document shell and metadata
│       ├── src/router.tsx                      # Router setup
│       └── package.json
├── packages/
│   └── ui/
│       ├── src/components/                     # Shared React components
│       ├── src/lib/utils.ts                    # Shared class-name helper
│       ├── src/styles/globals.css              # Tailwind and theme styles
│       └── package.json
├── package.json                                # Workspace scripts
├── pnpm-workspace.yaml                         # Workspace package paths
├── turbo.json                                  # Turborepo task pipeline
└── README.md
```

The generated file `apps/web/src/routeTree.gen.ts` is maintained by TanStack
Router. It updates when file-based routes change, so it should not be edited
by hand.

## Requirements

- Node.js 20 or newer
- pnpm 10.33.4, or a compatible pnpm 10 release

Check the installed versions before starting:

```bash
node --version
pnpm --version
```

## Getting started

Install dependencies from the repository root:

```bash
pnpm install
```

Start the web app in development mode:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Vite and TanStack Start
will rebuild the app as source files change.

## Available commands

Run these commands from the repository root:

| Command          | Purpose                                         |
| ---------------- | ----------------------------------------------- |
| `pnpm dev`       | Start the development server for the workspace. |
| `pnpm build`     | Build all workspace packages and applications.  |
| `pnpm test:clean-build` | Verify a root build generates the Prisma client. |
| `pnpm lint`      | Run ESLint across the workspace.                |
| `pnpm format`    | Format TypeScript and TSX files with Prettier.  |
| `pnpm typecheck` | Run TypeScript checks without emitting files.   |

To work only on the web app, use its package directly:

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web lint
pnpm --filter web typecheck
```

`pnpm test:clean-build` temporarily removes the ignored generated Prisma
client, runs a fully uncached root build (`turbo build
--cache=local:,remote:`), verifies generation, then restores the prior
generated output.

## Database setup and migrations

Copy `apps/web/.env.example` to `apps/web/.env`, point `DATABASE_URL` at a
synthetic development database, and set a session secret. The database package
uses that same uncommitted file for Prisma commands. All database hosts,
including loopback development hosts, must require TLS (`sslmode=require`,
`verify-ca`, or `verify-full`).

For an **empty development database**, create the schema with:

```bash
pnpm --filter @digilicense/db db:migrate   # prisma migrate dev
pnpm --filter @digilicense/db db:seed      # synthetic demo data only
```

Do not treat `prisma migrate dev --name init` as a production baseline.
`migrate dev` is a development command that may reset data; use it only against
an empty or disposable database.

For an **existing database that holds important data**, baseline without
resetting it:

1. Generate the SQL for review instead of applying it blindly:

   ```bash
   pnpm --filter @digilicense/db exec prisma migrate diff \
     --from-empty --to-schema prisma/schema.prisma --script \
     > packages/db/prisma/migrations/0_init/migration.sql
   ```

2. Review `0_init/migration.sql` carefully before it touches any database.
3. Replace or archive any existing timestamped migrations so their changes are
   already contained in `0_init` and they are not applied again after the
   baseline. The repository's timestamped migrations exist for development
   databases created with `migrate dev`; a baselined production database must
   not replay them on top of `0_init`.
4. Mark the baseline as applied, then deploy:

   ```bash
   pnpm --filter @digilicense/db exec prisma migrate resolve --applied 0_init
   pnpm --filter @digilicense/db db:migrate:deploy
   ```

In production, apply committed migrations only with `prisma migrate deploy`.

### Destructive-command safety

`prisma migrate reset` and other destructive commands are restricted to
development, test, or synthetic databases. Never run them against a production,
live, or government system, and verify the target in `DATABASE_URL` before
running anything. User consent alone does not make a wrong datasource safe.

When automation needs the consent environment variable, expand the message
safely instead of pasting it inline, because a `'` inside single quotes breaks
the shell command:

```bash
read -r -p 'Paste the exact consent message: ' consent
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="$consent" prisma migrate reset --force
```

## Application routes

| Route                         | Description                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `/`                           | Home page with the available licence services.                                           |
| `/operator/login`             | Synthetic operator sign-in.                                                              |
| `/operator`                   | Protected mock operator work queue.                                                       |
| `/services/renew-licence`     | Placeholder for the renewal service.                                                     |
| `/services/learner-licence`   | Placeholder for the learner's-licence service.                                           |
| `/services/track-application` | Placeholder for the future full application-status page.                                |
| `/services/update-details`    | Placeholder for the details-update service.                                              |

The dynamic route in `apps/web/src/routes/services.$serviceId.tsx` currently
renders the same coming-soon state for every service ID. It does not validate
known service IDs or load service data yet.

## Adding shared UI components

The UI package follows the shadcn/ui layout. Add a component from the
repository root and point the CLI at the web app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

The component is placed in `packages/ui/src/components`. Import it in the web
app through the workspace package alias:

```tsx
import { Button } from "@workspace/ui/components/button"
```

The package exports component files, hooks, utilities, and the global style
sheet through `packages/ui/package.json`.

## Styling

Global styles live in `packages/ui/src/styles/globals.css`. That file imports
Tailwind CSS, the shadcn theme, animation utilities, and the Geist Variable
font. The web app loads it from the root route with the `@workspace/ui`
package alias.

The project uses CSS variables for colors, borders, focus rings, radii, and
dark-mode values. Component classes use the Tailwind tokens defined in that
stylesheet rather than hard-coded colors wherever possible.

## Development notes

- Add new pages as files under `apps/web/src/routes` so TanStack Router can
  include them in the generated route tree.
- Put privileged reads and mutations in TanStack Start server functions or
  server routes. Do not import Prisma or server secrets into browser code.
- Keep reusable components in `packages/ui/src/components` when they may be
  used by more than one app.
- Run `pnpm typecheck` after changing route params, shared component props, or
  workspace exports.
- Run `pnpm lint` before opening a pull request.
- Keep generated route files out of manual edits.
- Replace the placeholder service-page text and client-only tracking redirect
  when the real application and status APIs are available.

## Project status

The current implementation includes server-issued synthetic sessions and a
persisted operator-to-applicant status workflow. The other service forms remain
UI simulations. DigiLicense does not connect to government identity, licence,
payment, test, appointment, or notification systems, and production deployment
configuration is not complete.
