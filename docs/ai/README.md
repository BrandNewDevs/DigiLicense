# DigiLicense AI chatbot guide

This guide explains how to run, test, operate, and deploy the DigiLicense
guidance assistant. It covers all three provider modes, the browser-to-provider
data flow, local development, automated verification, failure diagnosis, and
production hardening.

The assistant is a public-information explanation feature. It does not decide
eligibility, rank applicants, inspect application records, mutate workflows,
contact a government service, or act on behalf of an applicant.

## Contents

- [Architecture](#architecture)
- [Provider modes](#provider-modes)
- [Public data contract](#public-data-contract)
- [Local prerequisites](#local-prerequisites)
- [Prepare the local application](#prepare-the-local-application)
- [Run the fake provider](#run-the-fake-provider)
- [Run the Gemini provider](#run-the-gemini-provider)
- [Run the OpenAI provider](#run-the-openai-provider)
- [Connect and test the web chatbot](#connect-and-test-the-web-chatbot)
- [Test the FastAPI endpoint directly](#test-the-fastapi-endpoint-directly)
- [Automated test suites](#automated-test-suites)
- [Security and fallback checks](#security-and-fallback-checks)
- [Troubleshooting](#troubleshooting)
- [Deployment architecture](#deployment-architecture)
- [Production configuration](#production-configuration)
- [Deployment procedure](#deployment-procedure)
- [Operations, scaling, and rotation](#operations-scaling-and-rotation)
- [Release checklist](#release-checklist)

## Architecture

The browser never calls an AI provider or the FastAPI service directly.

```text
Signed-in applicant browser
        |
        | same-origin TanStack server function
        v
TanStack Start product server
  - authenticates the applicant
  - rate-limits the applicant
  - rejects sensitive questions early
  - allowlists public context fields
  - applies an 8-second dependency deadline
        |
        | HTTPS + service bearer credential
        v
Private FastAPI guidance service
  - rejects browser Origin and OPTIONS requests
  - validates the request schema and body size
  - performs inbound local DLP
  - derives a canonical intent and topic
  - retrieves reviewed public evidence
  - scans the canonical provider payload
        |
        | canonical public context and reviewed evidence only
        v
Selected provider: fake, Gemini, or OpenAI
        |
        v
FastAPI output schema, citation, numeric-fact, disclosure, and DLP checks
        |
        v
Validated answer or deterministic bilingual fallback
```

The AI service has no product-database credential. It cannot read applicants,
applications, licences, appointments, documents, payments, sessions, or audit
records. Both services are stateless with respect to chat history.

Related design records:

- [Architecture and trust boundaries](architecture-and-trust-boundaries.md)
- [Data flow and retention](data-flow-and-retention.md)
- [PII and DLP policy](pii-dlp-policy.md)
- [Threat model](threat-model.md)
- [Source governance](source-governance.md)
- [Evaluation methodology](evaluation-methodology.md)

## Provider modes

| Mode     | Profile                      | External request | Intended use                                                            | Credential                       |
| -------- | ---------------------------- | ---------------- | ----------------------------------------------------------------------- | -------------------------------- |
| `fake`   | `development` or `test`      | No               | Deterministic development, CI, browser tests, and fallback verification | None                             |
| `gemini` | `development` only           | Yes              | Optional low-cost development smoke test                                | `DIGILICENSE_AI_GEMINI_API_KEY`  |
| `openai` | `evaluation` or `production` | Yes              | Controlled evaluation and the main deployed assistant                   | Dedicated API key and project ID |

The providers are alternatives, not a fallback chain. A Gemini failure does not
retry through OpenAI, and an OpenAI failure does not retry through Gemini. The
service returns reviewed deterministic guidance when the selected provider is
unavailable or its output is unsafe.

### Fake

The fake provider is the default. It requires no external credential, produces
repeatable results, and is the only provider used by normal CI and Playwright
tests. It proves the complete browser, TanStack Start, FastAPI, schema,
authentication, citation, and fallback wiring without network cost or provider
variability.

### Gemini

Gemini is an optional development-only adapter using
`gemini-2.5-flash-lite`. It receives the same canonical public payload and
reviewed evidence as OpenAI. It cannot be selected in `evaluation` or
`production`, is not included in the production container dependency set, and
requires the optional `gemini` dependency group.

### OpenAI

OpenAI is the production provider. Evaluation uses the same provider adapter
without enabling the production TLS and perimeter checks, which makes it the
appropriate profile for localhost smoke tests.

The current adapter pins `gpt-5.4-mini-2026-03-17`, disables provider storage,
uses strict structured output, performs no automatic SDK retries, supplies no
tools, and limits output to 500 tokens. Confirm that the dedicated project can
access the exact pinned model before deployment. Do not silently replace it
with an unpinned alias during a release.

## Public data contract

The browser may send only:

```ts
{
  question: string // 1–500 characters
  locale: "en" | "hi"
  service: AssistantService
  page: AssistantPage
  reasonCode: AssistantReasonCode
  contextToken?: string // opaque token returned by a previous answer
}
```

The following data is prohibited:

- applicant or operator IDs;
- session or cookie contents;
- application numbers, application records, or workflow histories;
- licence numbers or licence records;
- names, addresses, mobile numbers, email addresses, Aadhaar values, or OTPs;
- documents, filenames, document references, or document contents;
- payment or appointment records;
- chat history;
- arbitrary browser state or analytics identifiers.

The `contextToken` is signed, expires, and contains only public intent/topic
enums, locale, timestamps, and a key ID. It is not conversation storage. The UI
clears it when the route, locale, or selected topic changes.

### Route-derived context

The chatbot derives `service` and `page` from the current route. Workflow
components may override only known public reason codes such as:

- `WAITING_PERIOD_ACTIVE`;
- `NO_MATCHING_SLOT`;
- `WAITLIST_ACTIVE`;
- `OFFER_PENDING`;
- `OFFER_EXPIRED`;
- `PREPARATION_REQUIRED`;
- `ACTION_LOCKED`.

Unknown application blocking codes collapse to `ACTION_LOCKED`; internal
records are never forwarded.

## Local prerequisites

- Git
- Node.js 20 or newer
- pnpm 10.33.4
- Python 3.12
- `uv`
- Docker with Compose v2 for PostgreSQL
- a Gemini key only for Gemini smoke testing
- a dedicated OpenAI project key and project ID only for OpenAI smoke testing

Never commit provider credentials or add them to a `VITE_` variable. Provider
and service credentials are server-only.

Check out the branch or revision being tested, then install workspace
dependencies. For a pull request, switch to that pull request's branch instead
of `main`:

```bash
git fetch origin
git switch main
git pull --ff-only
pnpm install --frozen-lockfile
```

## Prepare the local application

From the repository root:

```bash
pnpm dev:setup
```

This creates ignored local environment files, starts TLS-enabled PostgreSQL,
applies checked-in migrations, and seeds synthetic applicant records.

The Compose web container cannot use host loopback to reach a FastAPI process
running on the host. Stop only that container and leave PostgreSQL running:

```bash
docker compose stop web
```

The host-side web process started later will connect to PostgreSQL through
`apps/web/.env` and to FastAPI through `127.0.0.1:8000`.

Use this local-only credential in both the web and AI terminals:

```bash
export DIGILICENSE_AI_SERVICE_BEARER_TOKEN="local-only-ai-bearer-2026-change-me"
```

It must match exactly on both services. Generate a different credential for
every real environment.

## Run the fake provider

Use this mode first. It proves local connectivity without an external account.

In terminal 1:

```bash
cd packages/ai-service
uv sync --frozen --group dev

export DIGILICENSE_AI_PROFILE=development
export DIGILICENSE_AI_PROVIDER_BACKEND=fake
export DIGILICENSE_AI_SERVICE_BEARER_TOKEN="local-only-ai-bearer-2026-change-me"

uv run uvicorn digilicense_ai.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --workers 1 \
  --no-access-log
```

The default development components are all fake. This is intentional for a
fast connectivity check. To exercise the local DLP, intent router, BM25 corpus,
and signed context while retaining deterministic provider output, add:

```bash
export DIGILICENSE_AI_DLP_BACKEND=local
export DIGILICENSE_AI_INTENT_BACKEND=local
export DIGILICENSE_AI_RETRIEVAL_BACKEND=bm25
export DIGILICENSE_AI_CONTEXT_BACKEND=local
export DIGILICENSE_AI_CONTEXT_SIGNING_CURRENT_KEY="local-only-context-signing-key-change-me"
```

Restart FastAPI after changing component settings.

Verify readiness:

```bash
curl --fail --silent http://127.0.0.1:8000/health/ready | python -m json.tool
```

The response must report `"provider": "fake"`.

## Run the Gemini provider

Gemini is for local development smoke checks only. Do not put a Gemini key in
the web environment.

In terminal 1:

```bash
cd packages/ai-service
uv sync --frozen --group dev --group gemini
```

In `zsh`, read the key without writing it into shell history:

```bash
read -s "DIGILICENSE_AI_GEMINI_API_KEY?Gemini API key: "
echo
export DIGILICENSE_AI_GEMINI_API_KEY
```

Configure the provider and the production-like local processing components:

```bash
export DIGILICENSE_AI_PROFILE=development
export DIGILICENSE_AI_PROVIDER_BACKEND=gemini
export DIGILICENSE_AI_RETRIEVAL_BACKEND=bm25
export DIGILICENSE_AI_DLP_BACKEND=local
export DIGILICENSE_AI_CONTEXT_BACKEND=local
export DIGILICENSE_AI_INTENT_BACKEND=local
export DIGILICENSE_AI_SERVICE_BEARER_TOKEN="local-only-ai-bearer-2026-change-me"
export DIGILICENSE_AI_CONTEXT_SIGNING_CURRENT_KEY="local-only-context-signing-key-change-me"

uv run uvicorn digilicense_ai.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --workers 1 \
  --no-access-log
```

Verify that readiness reports:

```json
{
  "profile": "development",
  "components": {
    "dlp": "local",
    "context": "local",
    "intent": "local",
    "retrieval": "bm25",
    "provider": "gemini"
  }
}
```

A released Gemini answer produces the sanitized event
`gemini_provider_completed`. Provider failure produces
`gemini_provider_failed` and deterministic guidance.

## Run the OpenAI provider

Use `evaluation` on localhost. Do not weaken the `production` profile to permit
unencrypted local HTTP.

Stop the current FastAPI process, then read the dedicated credentials without
committing them:

```bash
cd packages/ai-service

read -s "DIGILICENSE_AI_OPENAI_API_KEY?OpenAI API key: "
echo
export DIGILICENSE_AI_OPENAI_API_KEY

read "DIGILICENSE_AI_OPENAI_PROJECT_ID?OpenAI project ID: "
export DIGILICENSE_AI_OPENAI_PROJECT_ID
```

Configure the evaluation process:

```bash
export DIGILICENSE_AI_PROFILE=evaluation
export DIGILICENSE_AI_PROVIDER_BACKEND=openai
export DIGILICENSE_AI_RETRIEVAL_BACKEND=bm25
export DIGILICENSE_AI_DLP_BACKEND=local
export DIGILICENSE_AI_CONTEXT_BACKEND=local
export DIGILICENSE_AI_INTENT_BACKEND=local
export DIGILICENSE_AI_SERVICE_BEARER_TOKEN="local-only-ai-bearer-2026-change-me"
export DIGILICENSE_AI_CONTEXT_SIGNING_CURRENT_KEY="local-only-context-signing-key-change-me"

uv run uvicorn digilicense_ai.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --workers 1 \
  --no-access-log
```

Readiness must report `"profile": "evaluation"` and
`"provider": "openai"`.

A released answer produces `openai_provider_completed`. A provider timeout,
rate limit, network failure, inaccessible model, malformed output, invalid
citation, or unsafe result produces `openai_provider_failed` and a reviewed
fallback. The service never returns raw provider errors to the browser.

Before release, confirm the exact pinned model using the same dedicated project
and production credential. A successful service startup proves configuration
shape, not model access; the provider is contacted only when an eligible
question reaches it.

## Connect and test the web chatbot

Keep FastAPI running. In terminal 2, from the repository root:

```bash
set -a
source apps/web/.env
set +a

export DIGILICENSE_AI_BASE_URL="http://127.0.0.1:8000"
export DIGILICENSE_AI_SERVICE_BEARER_TOKEN="local-only-ai-bearer-2026-change-me"

pnpm --filter web dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in using only the
seeded synthetic applicant:

- mobile: `9000000001`
- OTP: `123456`

Then:

1. Open `/services/appointments`.
2. Select **Get guidance**.
3. Confirm the selected topic is **Driving-test appointment**.
4. Ask `How does the appointment waitlist work?`.
5. Confirm the response has a heading and, for a released answer, a reviewed
   source.
6. Change to Hindi and ask `अपॉइंटमेंट वेटलिस्ट कैसे काम करती है?`.
7. Navigate to permanent-licence and application-status pages and confirm the
   selected topic/reason follows the visible page state.

### Interpret the UI result

| UI state            | Meaning                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| **Answer**          | A provider result passed schema, evidence, citation, fact, disclosure, and DLP checks       |
| **Guidance**        | A deterministic fallback was returned                                                       |
| **Sources**         | Source metadata was resolved from the reviewed local corpus, never invented by the provider |
| Uncertainty message | The validated result states that available evidence may not fully cover the question        |
| Sign-in prompt      | No valid applicant session was present                                                      |

The fake provider answer explicitly says that no external AI service was
called. Gemini and OpenAI answers should correspond to a provider-completion
event in the FastAPI terminal. Do not infer provider success merely because
the UI displayed text; fallbacks are intentionally user-readable.

### Safe manual question set

Use questions containing no personal information:

- `How does the appointment waitlist work?`
- `Why is the permanent licence action unavailable?`
- `What happens when an appointment offer expires?`
- `What should I prepare before my learner test?`
- `Which actions are recorded only by DigiLicense?`
- `अपॉइंटमेंट ऑफर कब समाप्त होता है?`

Do not use real names, mobile numbers, Aadhaar values, application references,
addresses, documents, or payment details while testing.

## Test the FastAPI endpoint directly

Health endpoints:

```bash
curl --fail --silent http://127.0.0.1:8000/health/live | python -m json.tool
curl --fail --silent http://127.0.0.1:8000/health/ready | python -m json.tool
```

Server-to-server request:

```bash
curl --fail-with-body --silent --show-error \
  --request POST \
  --url http://127.0.0.1:8000/v1/assistant/messages \
  --header "Authorization: Bearer ${DIGILICENSE_AI_SERVICE_BEARER_TOKEN}" \
  --header "Content-Type: application/json" \
  --header "X-Request-ID: local-assistant-check" \
  --data '{
    "question": "How does the appointment waitlist work?",
    "locale": "en",
    "service": "appointment-waitlist",
    "page": "appointment-waitlist",
    "reasonCode": "WAITLIST_ACTIVE"
  }' | python -m json.tool
```

Expected response fields include:

- `answer`;
- `intent`;
- up to three `sources`;
- `uncertain`;
- `fallbackUsed`;
- optional `blockedReason`, `escalation`, and `contextToken`.

Do not add an `Origin` header. The endpoint is intentionally not a browser API
and rejects browser-originated and preflight requests.

## Automated test suites

### FastAPI unit, safety, and contract suite

```bash
cd packages/ai-service
uv sync --frozen --group dev --group security
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy src
uv run bandit -q -c pyproject.toml -r src
uv run pip-audit
```

These tests use controlled provider doubles. They verify provider payloads,
timeouts, DLP blocking, citation enforcement, invalid output, context tokens,
configuration gates, fallback behavior, and sanitized telemetry without making
live paid requests.

### TanStack-to-FastAPI integration suite

Start a fake FastAPI fixture in terminal 1:

```bash
cd packages/ai-service
export DIGILICENSE_AI_PROFILE=test
export DIGILICENSE_AI_SERVICE_BEARER_TOKEN="integration-only-ai-service-credential-12345"
uv run uvicorn digilicense_ai.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --workers 1 \
  --no-access-log
```

Run the guarded cross-service suite from the repository root:

```bash
DIGILICENSE_AI_INTEGRATION_TEST=true \
DIGILICENSE_AI_BASE_URL=http://127.0.0.1:8000 \
DIGILICENSE_AI_SERVICE_BEARER_TOKEN=integration-only-ai-service-credential-12345 \
pnpm test:ai-integration
```

The test refuses non-loopback hosts and non-8000 ports. It calls the real
TypeScript dependency client, validates the FastAPI response, and proves that a
mismatched bearer credential is rejected.

### Playwright browser suite

Keep the fake FastAPI fixture and seeded PostgreSQL database running. From the
repository root:

```bash
set -a
source apps/web/.env
set +a

export DIGILICENSE_AI_BASE_URL=http://127.0.0.1:8000
export DIGILICENSE_AI_SERVICE_BEARER_TOKEN=integration-only-ai-service-credential-12345

pnpm test:e2e
```

The assistant browser test signs in, opens the appointment page, opens the
chatbot, asks a question, and verifies a deterministic answer and source.

Do not change normal CI to call Gemini or OpenAI. Live providers introduce
cost, external availability, rate limits, nondeterminism, and secret handling.
Run controlled live smoke tests manually or in an explicitly protected release
environment with strict budgets.

## Security and fallback checks

Run these checks using synthetic inputs only.

### Authentication

- Open the chatbot while signed out.
- Submit a question.
- Confirm the UI requests applicant sign-in and FastAPI receives no request.

### Sensitive-input blocking

- Enter a clearly synthetic contact or identity-shaped value.
- Confirm the response heading is **Guidance**.
- Confirm no `gemini_provider_completed` or `openai_provider_completed` event
  appears.
- Never use a real identifier for this test.

### Invalid service credential

```bash
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  --request POST \
  --url http://127.0.0.1:8000/v1/assistant/messages \
  --header "Authorization: Bearer deliberately-wrong-local-credential" \
  --header "Content-Type: application/json" \
  --data '{
    "question": "How does the waitlist work?",
    "locale": "en",
    "service": "appointment-waitlist",
    "page": "appointment-waitlist",
    "reasonCode": "WAITLIST_ACTIVE"
  }'
```

Expected status: `401`.

### Browser-origin rejection

```bash
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  --request POST \
  --url http://127.0.0.1:8000/v1/assistant/messages \
  --header "Origin: http://localhost:3000" \
  --header "Authorization: Bearer ${DIGILICENSE_AI_SERVICE_BEARER_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{}'
```

Expected status: `403`. No CORS allow headers should be emitted.

### Method and content-type rejection

- `OPTIONS` must return `403`.
- A message request without `application/json` must return `415`.
- An invalid or extra-field payload must return a generic `422`.
- An oversized request must be rejected before normal request parsing.

### Dependency failure

- Stop FastAPI while keeping the web application running.
- Ask a question.
- Confirm deterministic bilingual guidance appears within the bounded timeout.
- Restart FastAPI and confirm a user-triggered retry succeeds.

The web client does not automatically retry provider mutations. This avoids
amplifying an outage or creating unexpected provider cost.

## Troubleshooting

| Symptom                                         | Likely cause                                                                           | Check or correction                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| UI always shows **Guidance**                    | AI service variables missing from the web server                                       | Set both `DIGILICENSE_AI_BASE_URL` and the matching bearer token, then restart Vite          |
| FastAPI returns `401`                           | Bearer values differ                                                                   | Set the exact same token on both server processes                                            |
| FastAPI returns `403`                           | Request contains `Origin` or uses `OPTIONS`                                            | Call FastAPI only from TanStack Start or a server-side test                                  |
| FastAPI returns `415`                           | Missing or incorrect content type                                                      | Send `Content-Type: application/json`                                                        |
| FastAPI returns `426`                           | Production requires TLS                                                                | Terminate TLS correctly and propagate a trusted HTTPS scheme; do not disable the requirement |
| FastAPI returns `429`                           | Service or provider limit reached                                                      | Wait for the window; do not add automatic retries                                            |
| Web response times out                          | FastAPI or provider exceeded eight seconds                                             | Inspect sanitized dependency category and provider health                                    |
| `google.genai` import fails                     | Optional Gemini group is absent                                                        | Run `uv sync --frozen --group dev --group gemini`                                            |
| Gemini startup is rejected                      | Wrong profile or missing key                                                           | Use `development`, select `gemini`, and set `DIGILICENSE_AI_GEMINI_API_KEY`                  |
| OpenAI startup is rejected                      | Missing key/project or unsafe production combination                                   | Set both dedicated project values and use the profile-compatible local components            |
| OpenAI logs `unavailable`                       | Invalid credential, inaccessible pinned model, provider outage, or project restriction | Verify the exact model with the dedicated project and review provider status/budget controls |
| Provider completes but UI receives **Guidance** | Output failed citation, fact, disclosure, schema, or outbound DLP checks               | Treat this as correct fail-closed behavior; inspect only sanitized failure categories        |
| No source is displayed                          | Unsupported/no-evidence/fallback result                                                | Ask an in-scope public guidance question and check corpus retrieval status                   |
| Applicant cannot sign in                        | PostgreSQL or seed data unavailable                                                    | Re-run `pnpm dev:setup` and use only the documented synthetic account                        |
| Cross-service test refuses to run               | Guard variables or local URL are wrong                                                 | Set the integration flag and use `http://127.0.0.1:8000` or `http://localhost:8000`          |

Never print credentials, raw questions, answers, context tokens, request bodies,
or provider exception messages while troubleshooting.

## Deployment architecture

This guide intentionally does not select or recommend a deployment vendor. Use
infrastructure that can provide the following boundaries:

```text
Public HTTPS ingress
  -> TanStack Start web service
       -> PostgreSQL over verified TLS
       -> private/server-only HTTPS route
            -> FastAPI AI service
                 -> restricted TLS egress to selected provider API
```

Required properties:

- deploy web and AI as separate stateless services;
- expose only the web service as a browser application;
- keep the AI URL and bearer credential server-only;
- use TLS for browser-to-web, web-to-AI, database, and provider connections;
- give the AI service no product database or session credentials;
- deny arbitrary outbound network access from the AI service;
- permit only the selected provider endpoint over port 443;
- run containers as non-root with dropped capabilities, read-only filesystems,
  bounded temporary storage, and resource limits;
- provide separate liveness and readiness probes;
- keep at least the currently required eight-second web dependency budget in
  mind when configuring proxy and load-balancer timeouts;
- support atomic secret references or coordinated rollout for the shared
  service bearer;
- retain sanitized logs and metrics in access-controlled operational storage.

An externally routable AI address is not a browser API. If infrastructure
cannot provide a private network route with verified TLS, protect the HTTPS
endpoint with network policy and application bearer authentication, reject
browser traffic, and expose no service documentation or credentials to the
client bundle.

## Production configuration

### FastAPI service

Production accepts only this component combination:

```dotenv
DIGILICENSE_AI_PROFILE=production
DIGILICENSE_AI_PROVIDER_BACKEND=openai
DIGILICENSE_AI_RETRIEVAL_BACKEND=bm25
DIGILICENSE_AI_DLP_BACKEND=local
DIGILICENSE_AI_CONTEXT_BACKEND=local
DIGILICENSE_AI_INTENT_BACKEND=local
DIGILICENSE_AI_OPENAI_BUDGET_CONTROLS_CONFIRMED=true
DIGILICENSE_AI_REQUIRE_TLS=true
```

Supply these through an encrypted secret/configuration system, never source
control:

```dotenv
DIGILICENSE_AI_SERVICE_BEARER_TOKEN=<random-rotated-value-at-least-32-characters>
DIGILICENSE_AI_CONTEXT_SIGNING_CURRENT_KEY=<random-signing-key-at-least-32-characters>
DIGILICENSE_AI_OPENAI_API_KEY=<dedicated-project-key>
DIGILICENSE_AI_OPENAI_PROJECT_ID=<dedicated-project-id>
```

Optional context-key rotation values:

```dotenv
DIGILICENSE_AI_CONTEXT_SIGNING_PREVIOUS_KEY=<previous-key-during-rotation>
DIGILICENSE_AI_CONTEXT_CURRENT_KEY_ID=<new-key-id>
DIGILICENSE_AI_CONTEXT_PREVIOUS_KEY_ID=<previous-key-id>
```

If TLS terminates at a reverse proxy, either present the ASGI request as HTTPS
or configure only the proxy's exact literal IP addresses:

```dotenv
DIGILICENSE_AI_TRUSTED_PROXY_IPS=["10.0.0.10"]
```

Do not trust wildcard proxy addresses or client-supplied forwarding headers.

### TanStack Start web service

Set:

```dotenv
DIGILICENSE_AI_BASE_URL=https://<private-or-protected-ai-origin>
DIGILICENSE_AI_SERVICE_BEARER_TOKEN=<same-service-bearer-value>
```

The base URL must be an HTTPS origin with no credentials, path, query, or
fragment. Never prefix either variable with `VITE_` and never serialize them
through loaders, route data, HTML, source maps, client logs, or analytics.

### Provider controls

Before setting `DIGILICENSE_AI_OPENAI_BUDGET_CONTROLS_CONFIRMED=true`:

1. Create a dedicated provider project used only by this service.
2. Restrict project members and API-key permissions.
3. Configure spending alerts and a hard operational budget outside the app.
4. Confirm the pinned model is available to that project.
5. Record the approved model, prompt version, corpus version, and evaluation
   result in the release evidence.
6. Define credential rotation and emergency revocation ownership.

The confirmation flag is a deployment gate, not a substitute for real provider
controls.

## Deployment procedure

Use a staged release rather than enabling the browser before the dependency is
healthy.

1. Build from a reviewed commit using the locked dependency files.
2. Generate an SBOM and run unit, type, lint, audit, and container scans.
3. Provision the AI service without product-database credentials.
4. Configure the exact provider, corpus, DLP, context, intent, TLS, and budget
   settings.
5. Configure the AI service bearer and context-signing key through secret
   management.
6. Start one AI worker and wait for `/health/ready`.
7. From the web service's server network, perform an authenticated synthetic
   request. Never perform this check from browser JavaScript.
8. Verify a provider-completion event or an understood fail-closed result.
9. Configure the web server with the AI HTTPS origin and matching bearer.
10. Deploy the web service and verify that secrets are absent from client
    bundles and server-rendered HTML.
11. Sign in with an approved synthetic applicant and run English and Hindi
    smoke questions.
12. Verify source links, route context, fallback copy, and service-boundary
    disclosure.
13. Monitor latency, failure category, fallback rate, rate limiting, and
    provider budget during the release window.
14. Roll back the web configuration first if the AI service is unhealthy; the
    web layer will continue returning deterministic guidance.

Do not run schema migration commands or grant database access to the AI service.
It has no durable application state to migrate or back up.

## Operations, scaling, and rotation

### Current scaling limit

The FastAPI gateway rate limiter and daily provider-call budget are currently
process-local. Multiple workers or multiple service instances would multiply
those limits and make enforcement inconsistent.

Until a shared atomic quota store is implemented:

- run one Uvicorn worker;
- run one AI service instance;
- keep the web service horizontally scalable;
- alert before CPU, memory, latency, or concurrency saturation;
- do not solve provider errors by increasing worker count.

Before scaling AI horizontally, move the gateway limiter, daily budget, and
circuit state that requires coordination to a shared atomic system and add
concurrency/load tests.

### Service-bearer rotation

The current perimeter accepts one bearer value. Rotate it through an atomic
shared secret reference or a coordinated AI/web rollout. If the infrastructure
cannot update both sides atomically, schedule a controlled maintenance window
or first implement a bounded previous-key overlap. Never leave two permanent
credentials active informally.

### Context-signing rotation

Context tokens support current and previous signing keys:

1. Move the old current key into the previous-key field.
2. generate a new current key and new current key ID;
3. keep current and previous IDs distinct;
4. deploy and retain the previous key only for the maximum token TTL;
5. remove the previous key after all old tokens have expired.

### Corpus releases

The BM25 corpus is packaged into the application artifact. For every corpus
change:

- use stable source and section IDs;
- update retrieval/publication metadata and checksums;
- complete reviewer approval;
- update structured fact packets for numeric claims;
- run evaluation, leakage, citation, and bilingual fact-preservation tests;
- deploy corpus and code as one versioned artifact;
- retain the previous artifact for rollback.

No runtime scraping, arbitrary URL ingestion, or applicant document ingestion
is permitted.

### Telemetry and alerts

Record only bounded operational fields:

- generated request/correlation ID;
- dependency name and fixed failure category;
- HTTP method and sanitized route;
- canonical intent and bounded source IDs;
- model, prompt, and corpus versions;
- latency and provider token counts;
- whether a fallback was used.

Alert on:

- sustained readiness failures;
- authentication failures or unexpected browser-origin attempts;
- increased timeout, invalid-output, DLP, or rate-limit results;
- high fallback percentage;
- provider budget approaching its limit;
- model/corpus version mismatch;
- p95/p99 latency regression;
- unexpected outbound destinations.

Never log raw questions, evidence text, answers, context tokens, cookies,
applicant IDs, application data, provider keys, bearer values, or exception
messages containing untrusted content.

## Release checklist

### Code and contract

- [ ] Browser calls only the authenticated TanStack Start server function.
- [ ] Request validation remains strict and rejects extra fields.
- [ ] Route, page, and reason-code mapping uses public allowlisted values.
- [ ] No product data or chat history is forwarded.
- [ ] Provider adapters accept only canonical public requests.
- [ ] Citations and numeric facts are validated against reviewed evidence.
- [ ] English and Hindi deterministic fallbacks pass tests.

### Tests

- [ ] Web unit tests, lint, typecheck, and production build pass.
- [ ] FastAPI tests, typecheck, lint, security scan, and dependency audit pass.
- [ ] Cross-service fake-provider integration test passes.
- [ ] Signed-in Playwright chatbot test passes.
- [ ] Controlled Gemini smoke test passes when Gemini is part of the release
      evaluation.
- [ ] Controlled OpenAI smoke test passes with the dedicated project and exact
      pinned model.
- [ ] PII, invalid bearer, browser-origin, timeout, rate-limit, malformed
      output, and provider-unavailable paths fail closed.

### Infrastructure and secrets

- [ ] AI and web services are separately deployed.
- [ ] Every network hop uses TLS.
- [ ] AI has no product-database credentials.
- [ ] AI egress is restricted to the selected provider endpoint.
- [ ] Bearer, context key, provider key, and project ID are server-only.
- [ ] Secret rotation and emergency revocation are documented.
- [ ] Containers run non-root with minimal capabilities and bounded resources.
- [ ] One worker/instance is enforced until quotas become shared and atomic.

### Provider and operations

- [ ] Dedicated-project access to the exact pinned model is confirmed.
- [ ] Provider budget and alerts are configured outside the application.
- [ ] Reviewed corpus, prompt, model, and evaluation versions are recorded.
- [ ] Health probes, sanitized telemetry, dashboards, and alerts are active.
- [ ] Rollback retains deterministic guidance and the previous reviewed corpus.
- [ ] Test and operational records contain synthetic/public information only.

## Cleanup after local testing

Stop FastAPI and Vite with `Ctrl+C`, then remove provider secrets from the
current shell:

```bash
unset DIGILICENSE_AI_GEMINI_API_KEY
unset DIGILICENSE_AI_OPENAI_API_KEY
unset DIGILICENSE_AI_OPENAI_PROJECT_ID
unset DIGILICENSE_AI_SERVICE_BEARER_TOKEN
unset DIGILICENSE_AI_CONTEXT_SIGNING_CURRENT_KEY
```

Stop the local application while preserving PostgreSQL data:

```bash
pnpm dev:stop
```

Use `pnpm dev:reset` only when intentionally deleting all local synthetic
database data.
