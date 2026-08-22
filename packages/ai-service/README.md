# DigiLicense AI service

This package is the private, stateless AI boundary for the DigiLicense prototype. Phase 0
provides contracts and a deterministic fake vertical slice only; it makes no external model,
retrieval, DLP, database, or product-workflow calls.

## Requirements

- Python 3.12
- [`uv`](https://docs.astral.sh/uv/)

## Install and run

```bash
uv sync --frozen --group dev --group security
uv run uvicorn digilicense_ai.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

The default `development` profile uses fake components and requires no API keys.

```bash
uv run pytest
uv run ruff check .
uv run mypy src
uv run bandit -c pyproject.toml -r src
uv run pip-audit
```

## Endpoints

- `POST /v1/assistant/messages`
- `GET /health/live`
- `GET /health/ready`

The public and internal contracts are documented in [`docs/contracts.md`](docs/contracts.md).
Trust boundaries are documented in
[`docs/architecture-and-trust-boundaries.md`](docs/architecture-and-trust-boundaries.md).

## Configuration profiles

All variables use the `DIGILICENSE_AI_` prefix.

| Profile | Phase 0 purpose |
| --- | --- |
| `development` | Local fake vertical slice |
| `test` | Deterministic automated tests |
| `evaluation` | Future controlled provider/retrieval comparison |
| `production` | Validates the final safe backend combination |

Production configuration is accepted only when it selects local DLP, local semantic context,
local intent routing, local BM25 retrieval, and OpenAI. Those production implementations are
deliberately not added in Phase 0.

