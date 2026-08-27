# Frontend/backend handoff

This is the stable wiring guide for the applicant interface. All privileged
functions below are TanStack Start server functions. Browser code must import
them from `apps/web/src/server-functions`, call them through `useServerFn`, and
must never import a `*.server.ts` module or Prisma.

Every private response is applicant-scoped and `private, no-store`. Unsafe
requests are protected by the global origin/CSRF middleware. Preserve the
generic `not-found` response; do not try to distinguish an unknown reference
from another applicant's reference.

## Retry and disclosure rules

- Create a UUID with `crypto.randomUUID()` for each retryable action.
- Keep that UUID stable while retrying the same action after a timeout. Create
  a new UUID only after the applicant deliberately begins another action.
- Disable a mutation control while its request is pending, but do not rely on
  that control for integrity; the server and PostgreSQL enforce it.
- Display the returned blocker, deadline, and `nextAction` instead of
  recreating workflow rules in the browser.
- Place the returned disclosure beside every payment, identity, address,
  appointment-delivery, renewal, and replacement result. These records belong
  to DigiLicense only; no government service or payment/notification provider
  was contacted.
- Never ask for a real licence, mobile, Aadhaar, address, document, payment
  card, email address, or government credential.

## Shared fee and payment flow

Exports from `server-functions/payment.ts`:

```ts
getFeeQuote({ service })
readApplicationPayment({ applicationNumber })
startApplicationPayment({ applicationNumber, idempotencyKey })
resolveApplicationPayment({
  applicationNumber,
  paymentId,
  outcome: "SUCCESS" | "FAILURE",
  idempotencyKey,
})
```

Supported fee keys are `learner-licence`, `permanent-licence`,
`address-change`, `renewal`, and `replacement`. Amounts and catalogue versions
are server-derived; no amount field exists on a payment mutation.

After any fee-bearing application is submitted:

1. Show the application reference and fetch its quote.
2. Start the payment once and retain both its returned ID and retry UUID.
3. Let the applicant choose the deterministic prototype outcome, success or
   failure. No card or bank input is required or permitted.
4. Submit the outcome with a separate stable resolution UUID.
5. On failure, retain the application and offer a fresh start action.
6. On success, refetch application status. The server atomically advances to
   the correct service-specific next state.

## Existing first-time journey

### Learner's licence and test

The learner form calls `submitLearnerLicenceApplication`. A successful
submission now enters `PAYMENT_REVIEW`; wire the shared payment flow before
linking to the test. Payment success finishes DigiLicense document checks and
returns `DOCUMENTS_VERIFIED`.

The learner-test functions remain unchanged. A pass records `TEST_PASSED`; a
failure records `TEST_FAILED` and allows a retest. Answers and grading remain
server-side.

### Permanent licence and appointment

Exports from `server-functions/permanent-licence.ts` and
`server-functions/appointment.ts`:

```ts
readPermanentLicenceState()
submitPermanentLicenceApplication({ vehicleClass, idempotencyKey })
readAppointmentJourney({ applicationNumber? })
saveAppointmentPreferences({
  applicationNumber,
  zones,
  notificationChannels,
  idempotencyKey,
})
leaveAppointmentWaitlist({ applicationNumber, idempotencyKey })
acceptAppointmentOffer({ applicationNumber, offerId, idempotencyKey })
rejectAppointmentOffer({ applicationNumber, offerId, idempotencyKey })
```

Permanent submission also enters `PAYMENT_REVIEW`. Payment success changes it
to `WAITLISTED` with `APPOINTMENT_PREFERENCES_REQUIRED`. Collect one to three
distinct ranked Delhi zones and at least one of `SMS` or `EMAIL`; these are
synthetic delivery channels and do not collect recipient values.

While an entry is active, refetch at most once a minute and after restored
focus. When an offer is active, display the slot, score explanation, and exact
expiry time, and expose accept/reject actions. Refetch immediately after an
action and when the 30-minute deadline passes. Confirmation, rejection,
expiry, cooldown, and reallocation are server-owned states.

## Address change

Keep the existing OTP, draft, and submission wiring. Submission now enters
`PAYMENT_REVIEW`. Payment success starts `DOCUMENT_REVIEW`, changes the proof
to `UNDER_REVIEW`, and records an expected review time one minute later. The
scheduled worker completes the DigiLicense-only update; poll application
status around the deadline rather than using a browser timer to change state.

`licence-busy` means the same licence already has an active address, renewal,
or replacement workflow. Show the server message and link to application
status.

## Renewal

Exports from `server-functions/renewal.ts`:

```ts
readRenewalState({})
submitRenewalApplication({
  licenceRecordId,
  reason: "EXPIRING_SOON" | "RECENTLY_EXPIRED",
  declarationAccepted: true,
  idempotencyKey,
})
```

Render only the returned owned licences. Display `validUntil`, `opensAt`,
`closesAt`, and eligibility kind as server-held DigiLicense dates. Never add an
expiry input. Disable submission outside the window for clarity, while still
rendering server errors because the server rechecks eligibility.

After submission, use the shared payment flow. Success automatically approves
the DigiLicense renewal and updates its server-held validity. Application
status returns a `serviceOutcome` with the before/after dates.

## Duplicate or replacement licence

Exports from `server-functions/replacement.ts`:

```ts
readReplacementState({})
submitReplacementApplication({
  licenceRecordId,
  reason: "LOST" | "DAMAGED" | "UNREADABLE",
  declarationAccepted: true,
  idempotencyKey,
})
```

No upload is required: the backend creates an application-scoped DigiLicense
declaration record. After the shared payment succeeds, application status
returns the DigiLicense-only replacement reference in `serviceOutcome`. The
licence number does not change.

## Status and notifications

Use `lookupApplicationStatus` and
`markApplicationNotificationRead` from
`server-functions/application-status.ts`. The projection contains:

- application status label, next action, version, and timestamps;
- blocker and expected deadline;
- bounded history, safe document states, and unread notifications;
- latest safe payment state;
- appointment offer/score/deadline or confirmed slot;
- renewal or replacement outcome when applicable.

Do not display internal enum codes as primary copy. Use semantic lists and
`time` elements, announce lookup/mutation results in a live region, and refetch
after marking a notification read.

## Mobile update and assistant

The mobile-update UI remains wired to its OTP and optional mock Aadhaar
contracts. Do not add an Aadhaar-number input. Only the fixed assertion choices
are accepted.

The assistant UI calls authenticated `askAssistant`. It may send only question,
locale, service, page, reason code, and optional signed public context token.
Never construct AI context from application, session, licence, contact,
address, document, payment, or chat-history data.

## Frontend work still required

Backend contracts are complete, but these generic forms still need replacement
by the frontend team:

- the shared fee/payment outcome step;
- renewal;
- duplicate/replacement.

The existing status screen should also render its new `payment` and
`serviceOutcome` fields. These are component-wiring tasks; no new backend route
or database access is required.
