# AI service contracts

## Public endpoint

`POST /v1/assistant/messages` accepts only a question and allowlisted public context.

```json
{
  "question": "Why can I not book my driving test?",
  "locale": "en",
  "service": "permanent-driving-licence",
  "page": "appointment-waitlist",
  "reasonCode": "NO_MATCHING_SLOT",
  "contextToken": null
}
```

Unknown fields are rejected. The question is limited to 500 characters, the optional context
token to 1,024 characters, and the full request body to 4 KiB.

Phase 0 returns a deterministic response:

```json
{
  "answer": "This is deterministic Phase 0 guidance. No external AI service was called.",
  "intent": "NO_APPOINTMENT_EXPLANATION",
  "sources": [
    {
      "id": "phase0-public-guidance",
      "title": "Phase 0 public guidance fixture",
      "url": "https://example.invalid/digilicense/phase-0-guidance"
    }
  ],
  "uncertain": false,
  "escalation": null,
  "fallbackUsed": false,
  "blockedReason": null,
  "contextToken": null
}
```

## Internal contracts

The pipeline uses distinct immutable Pydantic types for:

- Raw HTTP requests
- DLP decisions
- Semantic-context seeds and verified context
- Canonical intent results
- Retrieval queries and evidence chunks
- Canonical provider requests
- Provider results
- Validated HTTP responses

`CanonicalProviderRequest` intentionally has no raw-question, user, identity, document,
application, contact, or history field. Provider implementations accept only this type and
perform an additional runtime type check.

## Phase 0 component behavior

```text
AssistantMessageRequest
  → FakeDlpGateway
  → FakeSemanticContextManager
  → FakeIntentRouter
  → FakeRetriever
  → CanonicalProviderRequest
  → FakeProvider
  → AssistantMessageResponse
```

The fake provider is deterministic and does not read an API key or make a network request.

