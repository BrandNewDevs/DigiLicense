# Evaluation methodology

The evaluation corpus is synthetic English, Hindi, and Hinglish only. It covers all supported intents,
referential follow-ups, unsupported and wrong-jurisdiction questions, critical PII, prompt injection,
encoded/invisible/bidi attacks, citation manipulation, hallucinated facts, provider failures, context
tampering, retrieval failures, and DLP failures.

The runner records aggregate-only results: total cases, explicit PII recall, false-positive rate over
explicit expected-ALLOW cases, DLP p95, and raw-input leakage observed in supplied egress artifacts.
It never writes case text into reports. Security gates require complete critical PII blocking, zero
raw leakage, valid citations, deterministic fallbacks, bounded latency, and safe behavior with the
provider disabled.

Evaluation changes require a versioned test or fixture update. Results are reproducible with the
pinned Python/uv environment and the service's no-network fake provider path.
