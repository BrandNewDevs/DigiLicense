# AI data flow and retention

## Request flow

1. The product server sends a question and public context enums over an authenticated private link.
2. The gateway normalizes Unicode and performs local DLP.
3. If PII or unsafe content is detected, the provider call is blocked and local deterministic help
   may be returned from the scrubbed transient text.
4. Safe requests are converted to canonical intent/provider data and matched to the promoted corpus.
5. Only canonical public content is sent to the selected provider.
6. The response is validated, scanned for output PII, and returned with bounded citations.

## Retention rules

- Raw questions and answers are transient process data; they are not written to application logs,
  metrics, files, databases, or analytics.
- Semantic context tokens contain only public enums, timestamps, and a key identifier; they expire
  and are not conversational history.
- Logs retain request ID, bounded public enums, source IDs, model/prompt versions, latency, token
  metadata, and fallback code only.
- Provider storage is disabled for Responses API calls. File Search resources are evaluation-only and
  must be explicitly inspected, expired, and deleted.
- Synthetic data is used for tests, demos, and evidence. Real identity, contact, payment, or licence
  data is prohibited.
