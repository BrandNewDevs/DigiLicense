# DigiLicense implementation plan

DigiLicense is a Delhi-only, independent driving-licence service prototype. The build will provide ten persisted synthetic capabilities, with the learner-to-permanent-licence appointment journey serving as the primary end-to-end demonstration.

## Product foundation

- [x] Add the independent-prototype, Delhi-only, and synthetic-data disclosures
- [x] Extend the TanStack Start application shell and accessible, mobile-first design system
- [x] Define TanStack Router route groups for applicant and public experiences
- [x] Implement applicant login with a seeded synthetic mobile number and simulated OTP
- [x] Keep the demo focused on a single synthetic applicant login
- [x] Add server-side sessions, rate limits, CSRF/origin enforcement, and security headers through TanStack Start server code
- [x] Configure PostgreSQL with Prisma 7.9.1, define the Prisma schema, generate and apply migrations, and create synthetic seed data. Provide a reproducible local Docker PostgreSQL setup with a browser-based Adminer viewer.
- [x] Define shared application, workflow, document, payment, appointment, notification, and audit models

## Ten core capabilities

- [x] 1. New learner's-licence application (guided multi-step form, server-validated eligibility, persisted drafts with seven-day retention, transactional submission with duplicate-application guard)
- [x] 2. Simulated learner's test, result, and retest flow
- [x] 3. New permanent driving-licence application with waiting-period eligibility
- [x] 4. Driving-licence renewal application (owned licence, server-derived eligibility window, shared payment, and automatic DigiLicense-only completion)
- [x] 5. Duplicate or replacement driving-licence application (owned licence, declaration record, shared payment, and automatic DigiLicense-only completion)
- [x] 6. Driving-licence address-change application (owned licence verification, short-lived OTP challenge, persisted submission, and automatic DigiLicense-only proof review)
- [x] 7. Mobile-number update with simulated OTP and optional mock Aadhaar authentication
- [x] 8. Application status, deadlines, blocking reasons, history, document states, and application-scoped unread notifications
- [x] 9. Fee schedule, calculated fees, deterministic payment outcome, and persisted payment status
- [x] 10. Appointment booking for applicable services, including the driving-test waitlist

## Featured appointment workflow

- [x] Add appointment inventory, Delhi zones, vehicle classes, dates, and time preferences
- [x] Add waitlist joining, editing, leaving, and status views
- [x] Rank matching applicants by licence-expiry urgency and waitlist join time
- [x] Create temporary offers with a 30-minute expiry and in-app notification
- [x] Support offer acceptance, rejection, expiry, slot release, and reallocation
- [x] Prevent active-offer conflicts and appointment double booking with transactions and constraints
- [ ] Show the confirmed appointment and preparation checklist

## Applicant frontend

- [x] Build a dashboard centered on current status and one primary next action
- [ ] Build reusable guided-form, validation, document, payment, status, and appointment components
- [ ] Add clear mock labels, deadlines, locked-state explanations, notifications, and completed-step history
- [ ] Support keyboard navigation, visible focus, screen-reader status announcements, and reduced motion
- [ ] Add English and Hindi interface content required by the core journey

## Automated demo workflow

- [x] Remove operator-facing routes and simulated staff actions from the demo
- [x] Record automatic synthetic checks as system workflow events after learner-licence submission

## Backend and data

- [x] Add TanStack Start server functions or server routes for all privileged reads and mutations
- [x] Keep Prisma, session secrets, and external-service credentials in server-only modules
- [x] Implement server-validated workflow definitions for all ten capabilities
- [x] Persist drafts, submissions, status changes, application blockers/deadlines, and immutable workflow events (validation-result persistence remains service-specific)
- [x] Add applicable document, payment, notification, and exact service-boundary records across all ten workflows
- [x] Implement transactional appointment allocation, offer expiry, and confirmation
- [x] Add append-only workflow and application-submission audit events
- [x] Add safe logs, CSRF protection, input validation, secure cookies, and secret isolation (CSRF/origin enforcement, input validation, secure cookies, secret isolation, TLS-required database URLs, security headers, and structured dependency/security-failure logging done)
- [ ] Add broader metrics and alerts (the address-review worker currently emits sanitized completion/failure telemetry and exits non-zero on failure)
- [x] Keep applicant authorization checks at every server boundary

## AI engineering service

The AI service is a separate Python 3.12/FastAPI package under `packages/ai-service`. It is
stateless, has no product-database credentials, accepts only a question plus public enum/context
keys, and is not published to browser clients.

- [x] Phase 0 — Create the AI package, typed public/internal contracts, configuration profiles,
  deterministic fake path, health endpoints, structured sanitized logging, non-root container, and
  trust-boundary documentation.
- [x] Phase 1 — Implement in-process local PII DLP: Unicode and Devanagari normalization,
  invisible/bidi detection, Indian identifier/contact/payment recognizers, contextual name/address
  protection, inbound/provider/outbound scanning, fail-closed behavior, and safe local help.
- [x] Phase 2 — Implement short-lived signed semantic context tokens with rotation support. Tokens
  contain only the previous canonical intent/topic/locale, never raw chat history or identity.
- [x] Phase 3 — Add a reviewed, checksummed, versioned Delhi public-guidance corpus with stable
  source/section IDs, fact packets, promotion/rollback validation, and explicit separation of
  policy from simulated prototype behavior.
- [x] Phase 4 — Add production local BM25 retrieval using canonical queries and both source and
  section intent allowlists; add an evaluation-only File Search adapter and cleanup lifecycle.
- [x] Phase 5 — Add canonical-only OpenAI Responses API integration, a development-only Gemini
  smoke-test adapter, strict structured output, DLP payload scanning, timeouts, concurrency limits,
  circuit breaking, and deterministic provider-failure fallbacks.
- [x] Phase 6 — Add reviewed English/Hindi fallbacks, locale prompts, citation resolution, output
  DLP, plain-text/length checks, source/fact-ID validation, numeric value-and-unit verification,
  simulation disclosure, and affiliation-language rejection.
- [x] Phase 7 — Add service-to-service bearer authentication, TLS/proxy validation, browser/CORS
  rejection, bounded request/rate/daily-call controls, rotating context keys, readiness checks,
  sanitized metrics, restricted container deployment guidance, and AI-only CI/security/SBOM checks.
- [x] Phase 8 — Add synthetic English/Hindi/Hinglish DLP and intent-routing evaluation fixtures,
  acceptance reporting that identifies unevaluated controls, provider-disabled fallbacks, and
  concurrent fake-provider load coverage.
- [x] Harden the service after the complete AI audit: reject unsupported/wrong-jurisdiction input
  before retrieval/provider use; block separator-obfuscated identifiers; fail safely on weak or
  failed retrieval; clean up failed evaluation uploads; bound rate-limit state; and keep optional
  Gemini dependencies out of default pip/Conda installs.
- [x] Curate approved public Delhi driving-licence guidance with stable source identifiers.
- [x] Accept only the question, locale, service, page, reason code, and signed public semantic
  context. The provider contract has no raw-question field.
- [x] Reject or redact identity, contact, licence, document, payment, and contextual disclosure
  information before any provider call; raw text is excluded from logs and provider payloads.
- [x] Return validated English/Hindi answers with local citations, uncertainty, escalation data,
  and deterministic bilingual fallbacks.
- [x] Prevent the assistant from mutating state, deciding eligibility, ranking applicants, or
  implying government affiliation.
- [x] Add bounded timeouts, rate limits, prompt-injection handling, and deterministic bilingual
  fallback guidance.
- [x] Connect the private AI service only from authenticated TanStack Start server code with an allowlisted public-context contract and deterministic fallback.

## Testing and quality

- [x] Test valid, invalid, unauthorized, replay, and concurrent workflow transitions against PostgreSQL
- [x] Test learner-licence waiting-period and expiry boundaries
- [x] Test drafts, validation, payments, notifications, and audit-event creation
- [x] Test waitlist matching, priority ordering, offer lifecycle, and concurrent booking attempts
- [x] Test AI citations, Hindi/English responses, privacy filtering, injection attempts, timeouts,
  fallback, retrieval allowlists, context tampering, provider payload safety, output safety, and
  concurrent fake-provider behavior.
- [x] Add a PostgreSQL end-to-end test for the featured learner-to-confirmed-appointment journey
- [x] Test deterministic application guidance fallback when AI is unavailable
- [x] Run automated keyboard, mobile viewport, slow-asset, responsive-overflow, security-header, and applicant-session browser checks

## Delivery

- [ ] Deploy the TanStack Start app to an SSR and server-function capable runtime, along with the Neon database and private AI service
- [ ] Verify production security settings, mock labels, and independent-prototype disclosures
- [x] Seed safe demo credentials and resettable synthetic scenarios
- [ ] Verify all public links and the complete demo flow while signed out
- [ ] Document what is functional, what is simulated, current limitations, and safe scale-up design
- [ ] Record the submission video around the learner-to-driving-test appointment journey
