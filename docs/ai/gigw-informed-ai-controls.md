# GIGW-informed AI controls

DigiLicense uses relevant public-service security principles as design input: server-side access
control, TLS, least privilege, data minimization, auditable changes, safe error handling, accessibility
awareness, and explicit privacy boundaries.

This document deliberately does not claim GIGW compliance, STQC certification, CERT-In clearance,
government approval, or production-government readiness. A formal compliance assessment would require
an authorized scope, deployment evidence, organizational controls, and an independent review beyond
this prototype.

Implemented AI controls include:

- private server-to-server bearer authentication;
- non-root, read-only-capable minimal container configuration;
- local PII inspection and fail-closed provider boundaries;
- reviewed, checksummed, allowlisted evidence;
- bounded timeouts, concurrency, quotas, and circuit breaking;
- sanitized logs and aggregate evaluation reports;
- deterministic bilingual fallbacks and explicit simulation disclosures;
- no product database access, action tools, web search, or user-document ingestion.
