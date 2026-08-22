# DigiLicense implementation plan

DigiLicense is a Delhi-only, independent driving-licence service prototype. The build will provide ten persisted synthetic capabilities, with the learner-to-permanent-licence appointment journey serving as the primary end-to-end demonstration.

## Product foundation

- [x] Add the independent-prototype, Delhi-only, and synthetic-data disclosures
- [x] Extend the TanStack Start application shell and accessible, mobile-first design system
- [x] Define TanStack Router route groups for isolated applicant, operator, and public experiences
- [x] Implement applicant login with a seeded synthetic mobile number and simulated OTP
- [x] Implement a separate operator login using synthetic username/password credentials
- [ ] Add server-side sessions, role authorization, rate limits, and security headers through TanStack Start server code (sessions and role checks done; rate limits and security headers outstanding)
- [x] Configure Neon-hosted PostgreSQL with Prisma 7.9.1, define the Prisma schema, generate and apply migrations, and create synthetic seed data
- [ ] Define shared application, workflow, document, payment, appointment, notification, and audit models (application, workflow-event, and audit-event models exist; document, payment, appointment, and notification models remain)

## Ten core capabilities

- [ ] 1. New learner's-licence application
- [ ] 2. Simulated learner's test, result, and retest flow
- [ ] 3. New permanent driving-licence application with waiting-period eligibility
- [ ] 4. Driving-licence renewal application
- [ ] 5. Duplicate or replacement driving-licence application
- [ ] 6. Driving-licence address-change application
- [ ] 7. Mobile-number update with simulated OTP and optional mock Aadhaar authentication
- [ ] 8. Application status, deadlines, blocking reasons, and history (basic applicant-scoped status lookup from PostgreSQL works; deadlines, blocking reasons, and applicant-visible history remain)
- [ ] 9. Fee schedule, calculated fees, simulated payment, and payment status
- [ ] 10. Appointment booking for applicable services, including the driving-test waitlist

## Featured appointment workflow

- [ ] Add appointment inventory, Delhi zones, vehicle classes, dates, and time preferences
- [ ] Add waitlist joining, editing, leaving, and status views
- [ ] Rank matching applicants by licence-expiry urgency and waitlist join time
- [ ] Create temporary offers with a 30-minute expiry and in-app notification
- [ ] Support offer acceptance, rejection, expiry, slot release, and reallocation
- [ ] Prevent active-offer conflicts and appointment double booking with transactions and constraints
- [ ] Show the confirmed appointment and preparation checklist

## Applicant frontend

- [ ] Build a dashboard centered on current status and one primary next action
- [ ] Build reusable guided-form, validation, document, payment, status, and appointment components
- [ ] Add clear mock labels, deadlines, locked-state explanations, notifications, and completed-step history
- [ ] Support keyboard navigation, visible focus, screen-reader status announcements, and reduced motion
- [ ] Add English and Hindi interface content required by the core journey

## Operator frontend

- [x] Build an isolated operator dashboard and navigation
- [x] Add controls for simulated verification, payments, learner-test outcomes, and approvals
- [ ] Add appointment inventory and cancellation simulation controls
- [ ] Show allocation reasoning, active offers, queue state, and audit history (queue state and workflow history are shown; allocation reasoning and offers depend on the appointment workflow)
- [x] Require confirmation and justification for consequential operator actions

## Backend and data

- [x] Add TanStack Start server functions or server routes for all privileged reads and mutations
- [x] Keep Prisma, session secrets, and external-service credentials in server-only modules
- [ ] Implement reusable server-validated workflow definitions for all ten capabilities (workflow definitions currently cover the operator verification-to-approval transitions only)
- [ ] Persist drafts, validation results, submissions, status changes, and immutable workflow events (submissions, status changes, and workflow events persist; drafts and validation results do not yet)
- [ ] Add mock document checks, payments, notifications, and government-action markers
- [ ] Implement transactional appointment allocation, offer expiry, and confirmation
- [x] Add append-only workflow and operator-action audit events
- [ ] Add safe logs, CSRF protection, input validation, secure cookies, and secret isolation (input validation, secure cookies, and secret isolation done; safe logs and CSRF outstanding)
- [x] Keep applicant and operator authorization checks at every server boundary

## Bilingual AI assistant

- [ ] Build a stateless FastAPI service using the official OpenAI SDK
- [ ] Curate approved public Delhi driving-licence guidance and stable source identifiers
- [ ] Accept only the question, locale, service, page, and public reason/context keys
- [ ] Reject or redact identity, contact, licence, document, and payment information
- [ ] Return a validated English or Hindi answer with citations, uncertainty, and escalation data
- [ ] Prevent the assistant from mutating state, deciding eligibility, or ranking applicants
- [ ] Add timeouts, rate limits, prompt-injection handling, and deterministic bilingual fallback guidance
- [ ] Keep the AI service stateless and isolated from PostgreSQL, and call it only from the TanStack Start server

## Testing and quality

- [ ] Test valid, invalid, and unauthorized workflow transitions (workflow state rules and validation schemas have unit tests; unauthorized-transition and server-boundary tests remain)
- [ ] Test learner-licence waiting-period and expiry boundaries
- [ ] Test drafts, validation, payments, notifications, and audit-event creation
- [ ] Test waitlist matching, priority ordering, offer lifecycle, and concurrent booking attempts
- [ ] Test AI citations, Hindi/English responses, privacy filtering, injection attempts, timeouts, and fallback
- [ ] Add end-to-end tests for the featured applicant journey and operator allocation journey
- [ ] Test the full core journey with AI unavailable
- [ ] Run accessibility, mobile viewport, slow-connection, and usability checks

## Delivery

- [ ] Deploy the TanStack Start app to an SSR and server-function capable runtime, along with the Neon database and private AI service
- [ ] Verify production security settings, mock labels, and independent-prototype disclosures
- [ ] Seed safe demo credentials and resettable synthetic scenarios
- [ ] Verify all public links and the complete demo flow while signed out
- [ ] Document what is functional, what is simulated, current limitations, and safe scale-up design
- [ ] Record the submission video around the learner-to-driving-test appointment journey
