# Evaluation results

Latest local run on the merged AI service:

- 193 tests passed
- 91.15% total coverage (minimum configured threshold: 85%)
- Ruff lint and format passed
- mypy passed
- Bandit passed
- pip-audit reported no known vulnerabilities
- The bundled spaCy model is not independently auditable by pip-audit because it is not a PyPI
  package; its pinned SHA-256 is verified by the uv lock and requirements export.

The result is sanitized and aggregate-only. It contains no questions, answers, evidence text,
credentials, provider payloads, or personal data. These are prototype engineering results, not a
production readiness or government certification claim.
