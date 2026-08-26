# Appointment workflow frontend handoff

Phase 2 exposes authenticated TanStack Start server functions from
`apps/web/src/server-functions/appointment.ts`. The frontend owns the
appointment interface and should replace the generic appointments form only
when it is ready to wire these contracts.

## Contracts

- `readAppointmentJourney({ applicationNumber })` returns owned preferences,
  active offer timing and ranking explanation, or a confirmed appointment.
- `saveAppointmentPreferences({ applicationNumber, idempotencyKey, zones, notificationChannels })`
  accepts one to three distinct ordered Delhi zones and at least one of `SMS`
  or `EMAIL`. It never accepts a mobile number or email address.
- `leaveAppointmentWaitlist({ applicationNumber, idempotencyKey })` leaves the
  active queue entry. A later preference save creates a new entry.
- `acceptAppointmentOffer({ applicationNumber, offerId, idempotencyKey })` and
  `rejectAppointmentOffer(...)` act only on an owned, active, unexpired offer.

All mutations can return `authentication-required`, `ineligible`, `not-found`,
`offer-pending`, `offer-unavailable`, `rate-limited`, or `unavailable`. Treat
`not-found` identically for unavailable and cross-applicant resources.

## Refresh and accessibility

- Read on page entry, after every successful mutation, when the window regains
  focus, and every 60 seconds while an offer is active.
- Show the offer deadline as a local `<time>` value and disable accept/reject
  after it passes; the server remains authoritative.
- Announce mutation outcomes and refreshed offer state through an accessible
  live region. Do not display database IDs, delivery aliases, policy internals,
  or raw status codes as the main applicant-facing text.

## Required disclosure

The channel selection is a delivery preference only. Display this exact
boundary adjacent to the choice and offer result: “DigiLicense records this
notification only; no SMS, email, or government service is contacted.”
