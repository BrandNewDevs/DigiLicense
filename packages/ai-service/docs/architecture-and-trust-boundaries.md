# Architecture and trust boundaries

## Purpose

The AI package is an explanation service, not an agent. It has no product-database credentials,
does not receive applicant records, and exposes no product action or workflow mutation tool.

## Boundaries

### Product server to private AI service

The future product server may send only:

- A bounded user question
- Locale
- Allowlisted service, page, and reason-code enums
- An optional signed semantic-context token

The AI endpoint must not be called directly from a browser in production. Phase 0 does not
implement product authentication; it only defines the AI boundary.

### Raw input to canonical AI request

Raw text may be inspected only by local DLP and local intent components. External-provider
interfaces accept `CanonicalProviderRequest`, which contains only allowlisted enums and reviewed
public evidence. This is enforced structurally and with runtime guards and tests.

### AI service to external providers

Phase 0 makes no external provider calls. Later production phases may add the OpenAI Responses
API behind the canonical provider interface. Gemini is an optional development dependency and
is rejected by production configuration.

### Retrieval

Phase 0 uses a fixed public evidence fixture. Production configuration accepts only local BM25.
File Search is reserved for evaluation and is rejected in production configuration.

### Storage and telemetry

The service is stateless and has no database configuration. Structured request logs include
only request ID, method, path, status, and latency. Questions, answers, evidence text, context
tokens, headers, and request bodies are not logged.

## Explicitly unavailable in Phase 0

- Real DLP recognition
- Signed semantic-context implementation
- Real intent classification
- BM25 corpus retrieval
- OpenAI requests
- Gemini requests
- File Search
- User authentication
- Product records or workflow access

Configuration names for later components are present so unsafe production combinations can be
rejected before those implementations exist. Selecting a later-phase backend during Phase 0
fails startup rather than silently substituting a fake.

