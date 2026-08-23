# AI architecture and trust boundaries

DigiLicense AI is a private, stateless explanation service. The product server is the only caller;
the browser never calls this service directly. The AI service has no product-database credentials and
cannot read or mutate application state.

```text
Product server
  -> authenticated private AI gateway
     -> request validation and normalization
     -> local DLP
     -> canonical context and intent
     -> allowlisted local retrieval
     -> provider-safe structured request
     -> provider response validation and outbound DLP
     -> deterministic fallback
```

Trust boundaries:

1. Product server to AI gateway: only validated question, locale, service, page, reason code, and
   opaque semantic context are accepted. User IDs, application records, documents, and chat history
   are outside the contract.
2. Raw input to local DLP: raw text exists transiently only for in-process inspection. Request bodies
   are not logged.
3. AI service to provider: only canonical intent, public enums, reviewed evidence, and prompt/corpus
   versions may leave the service. Provider payloads are scanned again before transmission.
4. Provider response to caller: schema, citations, numeric facts, locale equivalence, plain text,
   simulation disclosure, and output DLP are checked before release.

The service is an explanation boundary, not an agent: it cannot decide eligibility, rank applicants,
execute actions, use tools, search the open web, or query the product database.
