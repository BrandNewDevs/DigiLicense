# DigiLicense agent context

This file provides shared context and guardrails. It is not an instruction to build the entire prototype. Work only on the task explicitly assigned, preserve existing work, and use `PLAN.md` to understand how that task fits into the project.

## Hackathon brief

DigiLicense is being built for the Build What Moves India hackathon. The challenge is to choose a real problem in an Indian public-service website or digital service and build a simpler, clearer, more useful solution. Codex must be a meaningful part of how the prototype is built, or the product must be powered meaningfully by an OpenAI model.

This is not a cosmetic redesign challenge. A strong build must make the following obvious:

- Who faces the problem and what is difficult today
- What changed and why the new experience is better
- Whether a user can complete the main journey from start to finish
- What genuinely works and what is simulated
- How the backend, infrastructure, and operational process make the solution viable
- How the idea could handle sensitive data and larger-scale usage safely

Design for real Indian users, especially people on mobile devices, slow connections, or with limited digital-service experience. Prefer a working, understandable journey over decorative breadth.

## Vision

DigiLicense is an independent, Delhi-only prototype that rethinks digital driving-licence services. It must feel like a credible public-service product without presenting itself as an official government service.

The product should replace fragmented, terminology-heavy steps with guided workflows. At every point, an applicant should understand:

- Their current status
- The one action they should take next
- The relevant deadline or eligibility date
- Why an action is unavailable
- What is real within the prototype and what is simulated

The featured problem is the first-time licence journey: an applicant progresses from a learner's licence to a permanent-licence application but may repeatedly fail to find a suitable driving-test appointment. DigiLicense adds a transparent waitlist that can allocate a newly available or cancelled slot without requiring constant manual checking. The wider product demonstrates a coherent revamp of common licence services using shared workflows and infrastructure.

## Product scope

Build these ten capabilities using persisted synthetic workflows:

1. New learner's licence
2. Simulated learner's test
3. New permanent driving licence
4. Driving-licence renewal
5. Duplicate or replacement driving licence
6. Change of address on a driving licence
7. Mobile-number update with optional mock Aadhaar authentication
8. Application status
9. Fee schedule and simulated online payment
10. Appointment booking, including the driving-test waitlist

The primary demo journey is learner's licence through permanent driving-test appointment confirmation. Secondary services should reuse shared form, workflow, payment, document, status, and appointment capabilities instead of becoming disconnected mock pages.

## What not to do

- Do not access, test, automate, submit to, or interfere with a live government system.
- Do not reverse-engineer private systems or use undocumented/private APIs.
- Do not scrape personal, sensitive, or restricted information.
- Do not use real Aadhaar, PAN, licence, password, OTP, payment, health, identity, or contact data.
- Do not present DigiLicense as an official government product or imply approval, affiliation, or partnership.
- Do not use `Sarathi`, government names, or government branding in the product UI.
- Do not use code, assets, or data without permission.
- Do not hide simulations behind realistic success messages. Clearly label the product as an independent prototype and every external/government action as simulated.

Public official documentation may be used as evidence. Do not experiment with transactional government pages or connect the prototype to government systems.

## Engineering guardrails

- Use only synthetic seed, test, screenshot, demo, and log data.
- Enforce workflow transitions and applicant/operator roles on the server.
- Keep applicant and operator experiences on isolated routes with separate login flows.
- Persist product data in PostgreSQL/Neon; keep workflow and audit histories append-only.
- Use transactions and database constraints for appointment allocation and confirmation.
- Build mobile-first, accessible interfaces that also work on slow connections.
- Clearly distinguish implemented product behavior from mocked government actions in code, records, UI, documentation, and demos.

## Security and scalability

Treat security as a primary product requirement. This prototype rethinks a sensitive public service and should demonstrate how the design could safely support a large user base. Security checks must exist at server and data boundaries; hiding controls in the UI is never sufficient.

- Deny access by default. Enforce least-privilege applicant/operator authorization on every route, action, and record lookup, and prevent cross-user data access.
- Use secure, HTTP-only, same-site cookies, session expiry and rotation, CSRF protection, strict CORS, security headers, and a restrictive Content Security Policy.
- Validate and normalize all untrusted input at API boundaries with Zod or Pydantic. Safely encode output and reject unexpected fields, file types, and request sizes.
- Rate-limit authentication, OTP, AI, payment, operator, waitlist, and offer endpoints. Add lockouts or escalating cooldowns where abuse is likely.
- Keep secrets server-only, separated by environment, out of source control and logs, and suitable for rotation. Require TLS for all network and database connections.
- Minimize collected data and define short retention for temporary records. Never place sensitive values in URLs, analytics, exceptions, audit payloads, screenshots, or application logs.
- Record append-only security and operator audit events without recording secrets or prohibited personal data. Make consequential operator actions attributable and reviewable.
- Use parameterized ORM queries, database constraints, transactions, row locking where required, idempotency keys for retryable mutations, and uniqueness rules to prevent replay, double payment, duplicate offers, and double booking.
- Keep web and AI services stateless so instances can scale horizontally. Use bounded timeouts, safe retries with backoff, cancellation, health checks, and graceful fallback when a dependency is unavailable.
- Design database access with connection pooling, indexed query paths, pagination, bounded result sets, and no N+1 queries. Do not rely on in-process memory for durable workflow or allocation state.
- Cache only safe public/reference data. Never cache private responses in shared caches, and invalidate derived state deliberately.
- Add structured, sanitized logs, metrics, request correlation IDs, error monitoring, and alerts for authentication abuse, authorization failures, dependency errors, allocation conflicts, and latency regressions.
- Keep backups and migrations recoverable, tested, and compatible with rolling deployment. Do not make destructive schema changes without an explicit migration and recovery plan.
- Test authorization, injection, CSRF, replay, enumeration, privilege escalation, race conditions, dependency failure, load-sensitive paths, and accidental AI data disclosure before release.

## AI boundary

The bilingual English/Hindi assistant provides evidence-grounded explanations only. It receives a question and public context keys such as service, page, locale, and reason code. It must not receive user identity, application records, documents, contact information, or chat history. It cannot decide eligibility, rank applicants, mutate state, or execute actions. Always provide deterministic bilingual fallback guidance.

## Architecture

Use a Next.js/TypeScript web application for authentication, UI, workflows, appointments, notifications, operator tools, and auditing; PostgreSQL/Neon for product state; and a stateless Python/FastAPI service for AI. The AI service must have no product-database credentials and must be called server-to-server only.
