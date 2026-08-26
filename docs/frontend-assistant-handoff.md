# Assistant server-function handoff

The backend now exposes the authenticated TanStack Start server function in
`apps/web/src/server-functions/assistant.ts`:

```ts
askAssistant({
  question,
  locale, // "en" | "hi"
  service,
  page,
  reasonCode,
  contextToken?,
})
```

The request is strict. Send only these fields; do not add applicant IDs,
application numbers, licence details, addresses, contact data, documents,
payment data, session state, or chat history. `contextToken` is optional and
is an opaque token returned by an earlier successful answer. It is not a place
to store browser state.

The result is one of:

- `{ kind: "answered", response }` — a validated response from the private
  guidance service.
- `{ kind: "fallback", reason, response, retryAfterSeconds? }` — deterministic
  English/Hindi local guidance for configuration, timeout, dependency,
  malformed-response, or rate-limit conditions. Render `response.answer` and
  any `response.escalation`; do not show raw technical errors.
- `{ kind: "authentication-required", message }` — prompt the user through
  the existing applicant sign-in flow.

`response` has `answer`, `intent`, at most three `sources`, `uncertain`,
`escalation`, `fallbackUsed`, `blockedReason`, and an optional next
`contextToken`. Source URLs are validated service output; the assistant still
does not determine eligibility, rank applications, or perform any action.

The caller is rate-limited to ten questions per fifteen minutes. Avoid automatic
retries on a fallback or rate limit; a user-triggered retry after the supplied
`retryAfterSeconds` is appropriate. The backend uses a strict eight-second
deadline.

The assistant interface, its layout, localisation presentation, accessibility
states, and interaction design remain owned by the frontend team. Any affected
screen must state that DigiLicense records or explains only its own prototype
behaviour and does not contact a government service.
