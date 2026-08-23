# AI threat model

## Assets

- Provider credentials and project identifiers
- Reviewed corpus integrity and citation mappings
- Synthetic context signing keys
- Raw questions during their short in-memory lifetime
- Provider budget and availability
- Accuracy of bilingual public guidance

## Threats and controls

| Threat | Control | Evidence |
| --- | --- | --- |
| PII reaches a provider | Local Presidio/regex DLP, provider-payload scan, canonical-only provider contract | DLP and provider spy tests |
| Raw text reaches logs | Allowlisted structured logging and sanitized exception paths | Logging sentinel tests |
| Prompt injection changes provider behavior | No tools, canonical prompts, reviewed evidence only, output validation | Provider contract tests |
| Forged semantic context | HMAC signing, expiry, current/previous key rotation, unknown-key rejection | Context security tests |
| Credential brute force | TLS, bearer authentication, peer and credential rate limits | Security perimeter tests |
| Quota bypass across workers | Prototype is explicitly one-worker; shared atomic store required before scale-out | Deployment manifest and README |
| False citations or numeric hallucinations | Corpus source allowlists, fact packets, bounded evidence, output validator | Corpus/output tests |
| Provider outage | Circuit breaker, bounded timeout, deterministic bilingual fallback | Provider failure tests |
| Government-affiliation misrepresentation | Output phrase checks and prototype disclosures | Output safety tests |

Residual risks are recorded in `ai-risk-register.md`; this prototype is not a government-certified
deployment.
