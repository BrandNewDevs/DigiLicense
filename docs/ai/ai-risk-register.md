# AI risk register

| Risk | Severity | Current treatment | Residual limitation | Owner/action |
| --- | --- | --- | --- | --- |
| Critical PII false negative | High | Local DLP plus provider canonical boundary and outbound scan | Recognition quality requires ongoing synthetic evaluation | AI engineering: expand cases before release |
| Provider outage or quota exhaustion | Medium | Timeouts, circuit breaker, daily budget, deterministic fallback | Fallback is general guidance | Operations: monitor fallback rate |
| Corpus becomes stale | Medium | Checksums, review status, versioned promotion and rollback | Review cadence is manual | Corpus reviewer: schedule refresh |
| Multi-worker quota divergence | High | One-worker prototype deployment | No shared atomic quota store yet | Operations: add shared store before scale-out |
| Proxy TLS misconfiguration | High | TLS required and forwarded headers untrusted by default | Deployment proxy must set ASGI HTTPS scheme | Operations: verify topology in deployment |
| Bilingual factual drift | Medium | Numeric/date equivalence and locale-specific fallbacks | Language coverage remains bounded | AI engineering: expand golden cases |
| Misleading official affiliation | High | Phrase checks, prototype labels, independent-product copy | Novel wording may evade rules | AI engineering: add red-team phrases |

The prototype does not claim GIGW compliance, STQC certification, CERT-In clearance, or government
production readiness.
