# DigiLicense AI service

This package is the private, stateless AI boundary for the DigiLicense prototype. It contains the
in-process PII DLP gateway and a bounded OpenAI provider adapter while retaining deterministic fake
components for offline development and fallback testing. It has no product-database credentials
and makes no product-workflow calls.

For the complete provider-mode, localhost testing, deployment, security, and operations runbook,
see the [AI chatbot guide](../../docs/ai/README.md).

## Requirements

- Python 3.12
- [`uv`](https://docs.astral.sh/uv/)

## Install and run

### uv

```bash
uv sync --frozen --group dev --group security
uv run uvicorn digilicense_ai.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

### Python venv and pip

Run these commands from `packages/ai-service`:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --require-hashes -r requirements.txt
python -m pip install --no-deps -e .
uvicorn digilicense_ai.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

`requirements.txt` is a fully hashed export of the default, development, and security dependency
groups in `uv.lock`. The local package is installed separately because editable installs cannot
participate in pip's hash-checking mode. It deliberately excludes the optional Gemini smoke-test
adapter. After changing default dependencies, regenerate the export from this directory:

```bash
uv export --frozen --group dev --group security --no-emit-project --no-header --format requirements.txt --output-file requirements.txt
```

### Conda

Run these commands from `packages/ai-service` so the relative requirements path resolves:

```bash
conda env create -f environment.yml
conda activate bwmi
python -m pip install --no-deps -e .
uvicorn digilicense_ai.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

The default `development` profile uses fake components and requires no API keys. Select the local
DLP implementation with `DIGILICENSE_AI_DLP_BACKEND=local`; its pinned spaCy model is loaded while
the application container is built so initialization failure prevents startup.

```bash
uv run pytest
uv run ruff check .
uv run mypy src
uv run bandit -c pyproject.toml -r src
uv run pip-audit
```

## Endpoints

- `POST /v1/assistant/messages`
- `GET /health/live`
- `GET /health/ready`

## PII boundary

The local DLP gateway normalizes Unicode, converts Devanagari digits, detects hostile invisible
or bidi controls, validates Indian structured identifiers, and uses disclosure cues plus the
pinned English spaCy model for contextual person and address detection. Hindi and Hinglish
coverage is rule-based; no Hindi NER model is claimed.

India-specific structured rules and multilingual disclosure rules are registered as local
Presidio recognizers. Auditable cue phrases are loaded from the packaged, validated
`src/digilicense_ai/dlp/policies/v1.json` policy instead of being embedded in orchestration code.

DLP checks inbound questions, canonical provider payloads, and outbound answers. Both external
provider adapters repeat the canonical-payload scan immediately before transmission. Detected values
are replaced only in transient memory. They are never persisted, logged, or placed in exception
responses, and no anonymization/deanonymization vault exists. Raw questions remain structurally
excluded from provider requests even if DLP misses an entity.

## Provider and retrieval boundaries

Phase 5 adds production adapters for the official OpenAI Python SDK and Responses API. The adapter accepts
only `CanonicalProviderRequest`, so raw questions, context tokens, identities, and application
records cannot be passed to it. Calls use the pinned `gpt-5.4-mini-2026-03-17` snapshot with:

- `store=false`
- foreground-only calls with no conversation, prior-response, user, or safety-identifier fields
- `reasoning.effort=none`
- strict JSON Schema output
- a 500-token maximum output limit
- a two-second connection timeout and eight-second total deadline
- a ten-request concurrency limit and process-local circuit breaker
- zero automatic SDK retries
- no tools or runtime web/File Search access
- citation IDs validated against the evidence supplied in that request

Provider output is validated before outbound DLP runs. Timeout, rate-limit, network, provider, and
invalid-output failures return deterministic English or Hindi fallback guidance. Logs contain only
the configured model ID, token counts, latency, a fixed failure category, and whether fallback was
used; prompts, evidence text, answers, exception messages, and API keys are excluded.

For controlled evaluation, set these server-only variables:

```bash
export DIGILICENSE_AI_PROFILE=evaluation
export DIGILICENSE_AI_PROVIDER_BACKEND=openai
export DIGILICENSE_AI_OPENAI_API_KEY='<dedicated-project-key>'
export DIGILICENSE_AI_OPENAI_PROJECT_ID='<dedicated-project-id>'
```

Do not put these values in frontend configuration or commit them. Before production deployment,
an operator must configure spending alerts and a hard operational budget in the dedicated OpenAI
project, then set `DIGILICENSE_AI_OPENAI_BUDGET_CONTROLS_CONFIRMED=true`. This flag is an explicit
deployment gate, not a substitute for configuring the controls in the provider dashboard.

Gemini is an optional, development-only smoke-test adapter. It uses separate development
credentials, receives the same canonical public payload and reviewed evidence as OpenAI, and is
not a fallback. Install it only with `uv sync --group gemini`; it is not part of the default pip
or Conda installation. It cannot be selected in evaluation or production, and the deployed
prototype requires no Gemini credential.

### DigiLicense-only workflow guidance

The assistant explains the DigiLicense journey, not external services. Its provider instruction includes
an allowlisted workflow map for all supported product paths:

- learner's licence form, fee step, learner's test, and the permanent-licence eligibility date
- permanent driving-licence form, fee step, appointment preferences, waitlist, offer expiry, and
  confirmed appointment
- renewal, duplicate or replacement, address change, and mobile update guided forms
- dashboard, application status, and fee views

The map is static product context. The request still carries only the enum-controlled `service`,
`page`, `reasonCode`, and `locale` values. It never adds an applicant record, identity, document,
contact detail, payment, application number, raw chat history, or any other private workflow state.
The current page and reason code tell the assistant which part of the static map to explain.

Provider instructions permit next-step directions only to a DigiLicense page, control, or step in
that map. They prohibit naming, linking to, or directing someone to a government, official, or
other external website, portal, or service. The provider payload strips the retrieval URL from every
evidence chunk before it leaves the service. The browser receives plain source IDs and titles for
traceability, not URLs, and renders those titles without anchors.

`OutputSafetyValidator` enforces the same rule after model output is parsed. It rejects all URLs and
markup, affiliation claims, and URL-free external directions. The direction matcher is
case-insensitive and covers English instructions such as "Navigate to the external portal" and
"Follow the external service", plus Hindi instructions such as "सरकारी वेबसाइट देखें" and
"आधिकारिक पोर्टल पर जाएं". Rejected output is replaced with deterministic bilingual guidance that
points the person to the next action shown in DigiLicense.

Regression coverage lives in `tests/test_output_safety.py`. It tests URL, markup, affiliation,
English external-direction, and Hindi external-direction rejection. `tests/test_openai_provider.py`
also verifies that `canonical_input()` omits evidence URLs before a provider request is made.

### Answer release safety

English and Hindi instructions are locale-specific and require preservation of dates, numbers,
waiting periods, fees, uncertainty, and simulation disclosures. The service validates provider
answers after schema validation and before outbound DLP: answer length is capped at 1,200
characters, markup and arbitrary URLs are rejected, government-affiliation language is blocked,
citations must resolve through local corpus metadata, and every numeric claim must cite a reviewed
fact ID with its exact value and unit. Hindi and English numeric facts are independently checked
against that same reviewed fact packet. Prototype-behavior evidence must be described as simulated.
Unsafe output becomes a
reviewed bilingual fallback with one of the bounded escalation codes; model-generated URLs are
never returned to callers.

The deterministic local router recognizes English, Hindi, and common Hinglish follow-up terms
without forwarding raw text to a provider. The public response includes only source IDs and titles
resolved from the promoted corpus; it never includes source URLs.

### Service perimeter and operations

Production configuration requires a server-to-server bearer credential, TLS, dedicated OpenAI
project credentials, local DLP, local signed context, local intent routing, and BM25. Requests
with browser Origin headers, preflight methods, invalid content types, missing credentials, or
non-TLS production transport are rejected before FastAPI parsing. The gateway applies a maximum
of 60 requests per minute per service credential, while a daily provider budget caps the prototype
at 1,500 external calls. Provider concurrency remains capped at ten.

Semantic context tokens contain only the last canonical intent, topic, locale, issue/expiry times,
and a key ID. They are HMAC-signed, expire, and accept both current and previous signing keys
during rotation. They never contain raw questions, identities, or conversation history.

Readiness checks cover DLP, deterministic fallbacks, intent routing, and retrieval before traffic
is marked ready. Operational metrics retain only request IDs, canonical intents, bounded source IDs,
model version, prompt version, and fallback codes; questions, answers, evidence text, credentials,
and context tokens are excluded.

### Evaluation and red-team fixtures

The packaged evaluation dataset contains synthetic English, Hindi, and Hinglish cases for all ten
supported intents, referential follow-ups, wrong jurisdiction, missing evidence, structured PII,
prompt injection, encoded and invisible Unicode attacks, bidi manipulation, citation manipulation,
hallucinated dates/fees, provider failures, context-token tampering, retrieval failure, and DLP
failure. The runner reports only aggregate PII recall, false-positive rate, latency, and leakage
counts. It never writes case text, answers, or identifiers to reports.

Existing deterministic tests provide the remaining acceptance evidence: canonical provider payload
conformance, citation and numeric-claim rejection, bilingual fact preservation, fallback behavior,
context-token rotation, and a twenty-request provider-disabled load. BM25 remains the production
retrieval path; File Search is evaluated only through its existing controlled adapter and shared
EvidenceChunk contract, so comparisons can measure relevance, citation validity, latency, cost,
and lifecycle complexity without changing production retrieval.

### Reviewed corpus and production BM25

Reviewed sources are packaged under `src/digilicense_ai/corpus/data/v1/`. Each release has stable
source and section IDs, publication/retrieval metadata, reviewer status, SHA-256 checksums, source
allowlists, and structured fact packets. The loader accepts only that bundled release; it has no
HTTP fetch, scraping, user-file, or arbitrary-path ingestion interface. Public-policy sources and
internal prototype-behavior sources are distinct, so a simulated waitlist or payment flow cannot
be cited as public policy.

`DIGILICENSE_AI_RETRIEVAL_BACKEND=bm25` builds the local index during container startup. Retrieval
uses only a canonical intent/topic/locale template, intersects the intent source allowlist, returns
at most three chunks within a 420-token budget, and returns a deterministic no-evidence fallback
without calling the provider when the threshold is not met. Retrieval logs backend, latency,
source IDs, and scores only—never query or evidence text.

### Controlled File Search evaluation

File Search is prohibited in production. It can be selected only with all of the following
server-only evaluation settings:

```bash
export DIGILICENSE_AI_PROFILE=evaluation
export DIGILICENSE_AI_RETRIEVAL_BACKEND=file_search
export DIGILICENSE_AI_FILE_SEARCH_ENABLED=true
export DIGILICENSE_AI_FILE_SEARCH_VECTOR_STORE_ID='vs_<evaluation-store>'
export DIGILICENSE_AI_OPENAI_API_KEY='<dedicated-project-key>'
export DIGILICENSE_AI_OPENAI_PROJECT_ID='<dedicated-project-id>'
```

The evaluation adapter uses the same canonical query and `EvidenceChunk` contract as BM25, and
validates File Search metadata against the promoted local corpus before returning any chunk. It
never runs alongside BM25 for a request. `scripts/file_search_corpus.py` provides explicit
`upload`, `inspect`, `expire`, and `delete` commands. Uploads receive a 1–30 day expiry; expiry or
deletion requires `--confirm`, removes each vector-store attachment before its uploaded file, and
can then delete the vector store with `--delete-vector-store`. The resource manifest printed by
`upload` must be stored in approved operational tooling, never in application logs.

## Configuration profiles

All variables use the `DIGILICENSE_AI_` prefix.

| Profile | Current purpose |
| --- | --- |
| `development` | Fake vertical slice, with optional local DLP |
| `test` | Deterministic automated tests |
| `evaluation` | Controlled OpenAI comparison with fake upstream fixtures available |
| `production` | Validates the final safe backend combination |

Production configuration is accepted only when it selects local DLP, signed local semantic
context, local intent routing, local BM25 retrieval, OpenAI, dedicated project credentials, and
confirmed provider budget controls. The root Render Blueprint deploys this container separately,
uses Render-managed HTTPS, generates the service credential once, and injects the same credential
into the TanStack Start server without exposing it to the browser.
The prototype deployment runs one Uvicorn worker because the Phase 7 rate-limit and daily-budget
guards are process-local; multiple workers require a shared atomic quota store before scaling out.
When TLS terminates at a reverse proxy, that proxy must be the trusted component that sets the
ASGI HTTPS scheme. Configure its IP through `DIGILICENSE_AI_TRUSTED_PROXY_IPS`; only a listed proxy
may supply `X-Forwarded-Proto: https`. On Render, set
`DIGILICENSE_AI_TRUST_RENDER_TLS_PROXY=true` instead because Render's managed ingress has no stable
proxy address inside the container. The service accepts that setting only when Render supplies its
platform-controlled `RENDER=true` environment variable. Render readiness probes may use HTTP after
TLS termination; the health endpoints return no applicant or provider data.

An AI-only hardened Compose example is in `deploy/compose.ai.yaml`. It exposes no host port, keeps
internal traffic on an isolated `ai-private` network, and attaches the service to a separately
provisioned `ai-egress` network. The egress network must be restricted by the host or cloud firewall
to TLS traffic for `api.openai.com:443` only; it must not be a general-purpose application network.
This preserves a working OpenAI path without allowing arbitrary outbound destinations. Drops Linux
capabilities, enables `no-new-privileges`, uses a read-only root with a bounded `/tmp`, applies one
CPU/1 GiB memory limits, and reads secrets from an untracked `.env.ai`. Provision the external
network before starting Compose, then pass the non-secret network name to Compose interpolation,
for example `docker compose --env-file .env.ai -f deploy/compose.ai.yaml up -d`. The egress network
must be restricted by host/cloud firewall policy to `api.openai.com:443`; it is never a general
application network. Start from `deploy/.env.ai.example`; never commit the populated secret file.
