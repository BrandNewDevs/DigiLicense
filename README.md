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

The repository contains a TanStack Start full-stack application, a
PostgreSQL/Prisma workflow backend, and a private FastAPI guidance service.
Product actions persist only to DigiLicense's synthetic records; nothing is
submitted to a government system. DigiLicense is independent and is not
affiliated with or endorsed by any government department or agency.

## Why DigiLicense

People should not have to search through a large portal to find one licence
service or wonder whether a payment and application update went through. The
product is designed around the questions a citizen has at each step:

- What service do I need?
- What information should I have ready?
- What happens after I submit it?
- How do I know whether my application is moving forward?

The current backend implements all ten scoped service capabilities. Some newer
server contracts still await dedicated frontend components, as listed below.

## Current features

- A responsive applicant-facing landing page at `/`.
- A synthetic applicant sign-in backed by a short-lived, HTTP-only server
  session.
- A guided learner's-licence form with client and server validation, draft
  recovery, a seven-day draft-retention period, and a database-enforced guard
  against duplicate active applications.
- A versioned DigiLicense fee catalogue and deterministic payment-result
  workflow with server-derived amounts, idempotency, transaction locks, and
  PostgreSQL uniqueness guards.
- Learner, permanent, and address submissions connected to the shared payment
  workflow.
- Persisted renewal and replacement workflows using owned licence, payment,
  document, notification, status, and audit infrastructure.
- An applicant-scoped application-status flow showing owned workflow history,
  document states, unread application notifications, blockers, and expected
  review timing. Notification reads are ownership-scoped and idempotent.
- Address-change submissions receive a one-minute expected review time. A
  scheduled database worker accepts the permitted proof choices atomically,
  updates the DigiLicense-only licence summary, and records system workflow,
  notification, and audit history. No operator review route exists yet.
- A permanent-licence appointment waitlist with ranked Delhi preferences,
  30-minute offers, rejection/expiry/cooldown/reallocation, synthetic delivery
  outbox records, and transactionally confirmed single-capacity slots.
- A private, authenticated TanStack Start integration for the AI guidance
  service with a public-context-only payload, bounded timeout, validation,
  rate limiting, and deterministic bilingual fallback.
- A shared dynamic service route at `/services/$serviceId`. Learner, learner
  test, permanent, address, mobile, status, appointment, and assistant UI flows
  use server-backed contracts. Fee/payment, renewal, and replacement contracts
  are backend-complete but their current generic forms still save nothing; see
  [the frontend handoff](docs/frontend-backend-handoff.md).
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

All service state persists to the project's own PostgreSQL instance. Real
government authentication, payment processing, messaging, document review,
and government-system integration remain intentionally absent. Every affected
result states that it was recorded by DigiLicense only.

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
- PostgreSQL 17, Prisma 7, and TLS-enabled local Compose
- Python 3.12 and FastAPI for the private AI service
- Vitest and Playwright

## Architecture

The web application uses TanStack Start as its full-stack React framework and
TanStack Router for file-based routing. Browser code renders the interface and
submits user actions. TanStack Start server functions or server routes own
authenticated reads and mutations, input validation, workflow enforcement,
auditing, and database access.

PostgreSQL on Neon stores synthetic product data, with Prisma handling the
schema, migrations, queries, and seed data. The application must run on a
server-capable deployment target so server-side rendering and server functions
remain available. It is not designed as a static-only Vite deployment.

The bilingual assistant runs as a separate stateless FastAPI service. Only
the TanStack Start server may call it. The browser will not call it directly,
and the AI service will not have database credentials or access to applicant
records.

### Private assistant integration

`askAssistant` is an authenticated POST-only TanStack Start server function.
It accepts only a question plus public `locale`, `service`, `page`, `reasonCode`,
and an optional opaque signed context token. Applicant, session, licence,
application, address, contact, document, payment, and chat-history data are
not forwarded. The web server sends only this allowlisted payload and a fresh
correlation ID to the private FastAPI endpoint, with an eight-second deadline,
no-store fetch policy, strict response validation, and sanitized dependency
telemetry.

Set `DIGILICENSE_AI_BASE_URL` and
`DIGILICENSE_AI_SERVICE_BEARER_TOKEN` only in the web server environment; do
not use `VITE_` variables. They are optional for local development, where the
server returns local bilingual guidance when the service is absent. Production
requires both values, an HTTPS origin, and a 32+ character rotated credential
that matches the private AI service. Timeout, service unavailability, malformed
responses, and rate limits return deterministic bilingual guidance without
exposing error details. The applicant assistant calls this boundary; see
[the assistant handoff](docs/frontend-assistant-handoff.md).

### Browser request security

TanStack Start applies a global same-origin policy to every request. Unsafe
methods require browser-controlled same-origin metadata, and requests carrying
an `Origin` header must match `DIGILICENSE_PUBLIC_ORIGIN` exactly. Cross-origin
requests and preflights are rejected without CORS allow headers. Production
must configure this value as an HTTPS origin with no trailing slash or path.

All application responses carry CSP, clickjacking, MIME-sniffing, referrer,
permissions, and cross-origin isolation headers. Production also enables HSTS.
The current CSP permits inline scripts and styles only because TanStack's
streamed hydration and the component styling model require them; it permits no
third-party script or style origins. Moving those inline allowances to
per-request nonces remains a deployment-hardening task.

### PostgreSQL integration tests

`pnpm test` remains the fast unit suite. `pnpm test:integration` runs the
serial PostgreSQL workflow tests only after `prisma migrate deploy` has been
applied to a dedicated `digilicense_integration` database. The test setup
refuses to run unless both that database name and
`DIGILICENSE_INTEGRATION_TEST=true` are present, so it cannot clean a normal
development or production database. CI starts only the TLS-enabled Compose
database, uses fixed synthetic credentials, and removes the container volume
even after failures.

`pnpm test:e2e` runs Playwright browser checks for the public shell, security
headers, keyboard access, mobile overflow, slow asset delivery, applicant
server login, and dashboard availability. CI seeds only synthetic applicants
before this run and retains traces/screenshots/videos only after failure.

The once-per-minute `deploy/cron/digilicense-address-review.cron` command runs
the automatic address-review worker. It uses `FOR UPDATE SKIP LOCKED`, so
multiple worker instances cannot complete the same application twice.

### Local security configuration

For Docker Compose, the root `.env` file is the authoritative source of
`DIGILICENSE_PUBLIC_ORIGIN`; copy `.env.example` to `.env` before starting the
stack. `apps/web/.env` is for direct local tooling and does not configure the
web container. Direct development runs may omit the value and use the current
request origin, while production deployments must set an explicit HTTPS origin.

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

- Docker Desktop with Docker Compose v2
- Node.js 20 or newer and pnpm 10.33.4 only if you want to run workspace
  commands outside Docker

Check Docker before starting:

```bash
docker compose version
```

## Getting started

With Docker running, set up the complete local stack (web app, PostgreSQL,
Adminer, migrations, and synthetic seed data) from the repository root:

```bash
pnpm dev:setup
```

The script generates local secrets into the ignored `.env` on first run,
syncs `apps/web/.env` for host-side Prisma commands, builds and starts the
Compose stack, applies checked-in migrations, and seeds demo data. It is safe
to re-run; it never deletes data.

Other lifecycle commands:

| Command       | Purpose                                          |
| ------------- | ------------------------------------------------ |
| `pnpm dev:setup`  | Start or finish setting up the stack. Keeps data. |
| `pnpm dev:stop`   | Stop the stack. Keeps all local data.             |
| `pnpm dev:reset`  | Delete all local data and rebuild from scratch.   |

Open these local addresses:
- App: [http://localhost:3000](http://localhost:3000)
- Database viewer: [http://127.0.0.1:8080](http://127.0.0.1:8080)

The app runs with Vite inside Docker and reloads after source changes. Check
the running services with `docker compose ps`. Stop the stack with `pnpm dev:stop`
(or `docker compose down`). This preserves the local database volume. Use
`pnpm dev:reset` (or `docker compose down -v`) only when you deliberately want to
delete all local synthetic database data.

Use these credentials only with the local synthetic environment:

| Where | Sign in details |
| --- | --- |
| Applicant app | Mobile `9000000001`, OTP `123456` |
| Adminer | Server `db`, username `digilicense`, password from `DIGILICENSE_LOCAL_DB_PASSWORD`, database `digilicense` |

To run the workspace outside Docker, install dependencies with `pnpm install`.
Start the database first with `docker compose up -d db`, apply migrations and
seed data with the database commands below, then run `pnpm dev`.

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
| `pnpm test` | Run fast unit and schema tests. |
| `pnpm test:integration` | Run serial workflows against the guarded integration database. |
| `pnpm test:e2e` | Run Playwright browser quality checks. |

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

`pnpm dev:setup` writes both environment files for you. The root `.env` owns the
single source of truth for the local database password and session secret.
`apps/web/.env` mirrors that password with a `localhost` `DATABASE_URL` so
Prisma commands run on the host work without manual copying; Docker Compose
overrides `DATABASE_URL` inside containers, so the localhost URL only affects
host-side commands. The database package uses that same uncommitted file for
Prisma commands. All database hosts, including loopback development hosts,
must require TLS (`sslmode=require`, `verify-ca`, or `verify-full`).

For the local Docker database, apply new checked-in migrations and ensure the
synthetic seed records exist with:

```bash
docker compose exec web pnpm --filter @digilicense/db db:migrate:deploy
docker compose exec web pnpm --filter @digilicense/db db:seed
```

The database listens only on `127.0.0.1:5432`. Its local-only credentials are
in the ignored root `.env` file. Docker uses a self-signed TLS certificate and
rejects non-TLS TCP connections at the PostgreSQL access-control layer. The
development URL deliberately uses `sslmode=require&uselibpqcompat=true`: the
connection is encrypted but the local certificate is not trusted. Production
must use `verify-ca` or `verify-full` with a provider-issued CA certificate.
Do not reuse these credentials or certificate settings outside local development.

To inspect local synthetic records in a browser, start Adminer with the Compose
stack and open [http://127.0.0.1:8080](http://127.0.0.1:8080). Choose
PostgreSQL, then sign in with server `db`, username `digilicense`, password
from `DIGILICENSE_LOCAL_DB_PASSWORD` in `.env`, and database `digilicense`.
Adminer listens only
on your local machine and is for development data only.

To rotate the local database password, update
`DIGILICENSE_LOCAL_DB_PASSWORD` in `.env`, then run this command and enter the
same password when prompted:

```bash
docker compose exec db psql -U digilicense -d digilicense -c '\\password digilicense'
```

Restart the web container after rotating the password:

```bash
docker compose up -d --force-recreate web
```

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

### Application-draft retention

`ApplicationDraft.formPayload` is temporary. PostgreSQL sets `expiresAt` to
seven days after creation and resets it only when form data is saved. The
retention migration indexes that deadline and the purge command deletes expired
drafts in locked batches, so concurrent scheduler runs cannot process the same
records twice. Each run continues until it finds no unlocked expired records.
There is no global batch cap, so a backlog of more than 10,000 drafts does not
wait for a later scheduled run.

Install [`deploy/cron/digilicense-draft-retention.cron`](deploy/cron/digilicense-draft-retention.cron)
in the production scheduler before release. It runs the following command
hourly with the same `DATABASE_URL` environment as the web service:

```bash
pnpm --filter @digilicense/db db:purge-expired-drafts
```

The task is safe to retry. It reports only its operation name, batch count, and
deleted count. It never logs form payloads or applicant identifiers. Treat a
failed run or a missing successful run as a retention incident: the deployment
must alert the on-call owner and retry the task until it succeeds. This scheduler
health alert, together with the uncapped purge, is the operational control for
the expiration target.

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

| Route | Description |
| --- | --- |
| `/` | Applicant-facing landing page. |
| `/applicant/login` | Synthetic applicant sign-in. |
| `/services/learner-licence` | Persisted guided learner application; payment UI wiring remains. |
| `/services/$serviceId` | Shared detail route for all ten service entries. |

The `/services` directory lists all ten service entries.

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
- Restart the dev server after heavy git operations such as branch switches,
  rebases, or merges (`docker compose restart web`). The running Vite process
  watches the bind-mounted repository, and files that appear or disappear
  mid-flight can leave its generated route tree referencing deleted routes,
  causing import-analysis errors until a restart clears the cache.
- Replace the placeholder service-page text and client-only tracking redirect
  when the real application and status APIs are available.

## Deploying to Render

DigiLicense includes a Render Blueprint (`render.yaml`) and a production
Dockerfile (`Dockerfile.render`). Render runs the web app and its maintenance
job. Neon supplies PostgreSQL. The AI service is not part of this Blueprint;
see the private AI service boundary below.

### Steps

1. Push `main` to GitHub.
2. In the [Render dashboard](https://dashboard.render.com), click **New** →
   **Blueprint** and connect the repository.
3. Render detects `render.yaml` and provisions a web service and a scheduled
   maintenance job.
4. During Blueprint creation, provide these secret values for both services
   when Render prompts for them:
   - **DATABASE_URL** — a Neon direct connection string with
     `sslmode=require`; use the same value for the web and maintenance services
5. Set the following web-service values in the Render dashboard:
   - **DIGILICENSE_PUBLIC_ORIGIN** — your Render service URL (for example
     `https://digilicense.onrender.com`)
   - **DIGILICENSE_DEMO_APPLICANT_OTP** — a random 6-digit sign-in passcode
     (rotate by updating the value and redeploying)
6. On every deploy, Render runs `prisma migrate deploy` as the web service's
   pre-deploy command. A failed migration leaves the previous release serving
   traffic. Render runs the synthetic seed as the initial deploy hook, once,
   after the first successful deploy.
7. Confirm that the `digilicense-maintenance` job completes successfully. It
   processes appointment offers, address reviews, and expired workflow records
   once per minute. Configure an alert for failed or missing runs.

Use Neon's direct connection string for migrations and this hackathon-scale
deployment. If the web service later moves to a pooled runtime connection,
add a separate direct migration URL rather than sending migration traffic
through the pooler.

### Private AI service boundary

Do not set `DIGILICENSE_AI_BASE_URL` until a private AI deployment with
service-to-service TLS is available. The web server requires an HTTPS AI origin
in production, and the AI service requires TLS plus authenticated requests.
Render private services use private HTTP networking by default, so deploying
the AI container there without an internal TLS certificate would weaken the
implemented boundary. Until that deployment exists, assistant requests fail
closed and the application returns its deterministic bilingual guidance.

### What gets built

`Dockerfile.render` uses a multi-stage build:

| Stage | Purpose |
| --- | --- |
| `base` | Install all dependencies, run Prisma generate, build the Vite production bundle |
| `production` | Install production dependencies and copy the built app, Prisma client, database source files, migrations, and runtime scripts; `srvx` serves static assets and the TanStack Start fetch handler |

### PostgreSQL operations

Use a dedicated Neon project that contains only synthetic DigiLicense records.
Enable Neon backups or point-in-time recovery before the first public demo.
Keep the database credentials in Render and Neon, never in the repository.

## Project status

The backend and database cover the ten MVP capabilities, the complete
learner-to-confirmed-appointment journey, applicant-scoped status, and the
private AI boundary. Fee/payment, renewal, and replacement still need their
dedicated frontend components; the server contracts are documented in
[the frontend/backend handoff](docs/frontend-backend-handoff.md). Browser and
PostgreSQL CI verify the implemented boundary, while deployment rehearsal,
real monitoring/alert routing, nonce-based CSP, and any operator review UI
remain future hardening work.

DigiLicense never connects to government identity, licence, payment, test,
appointment, document, or notification systems. All data and external-action
results are synthetic DigiLicense records.
