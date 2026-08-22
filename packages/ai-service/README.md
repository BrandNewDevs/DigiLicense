# DigiLicense AI service

This package is the private, stateless AI boundary for the DigiLicense prototype. Phase 1 adds
an in-process PII DLP gateway while retaining deterministic fake intent, retrieval, and provider
components. It makes no external model, database, or product-workflow calls.

## Requirements

- Python 3.12
- [`uv`](https://docs.astral.sh/uv/)

## Install and run

### uv

```bash
uv sync --frozen --group dev --group security
uv run uvicorn digilicense_ai.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

### Python venv and pip

Run these commands from `packages/ai-service`:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --require-hashes -r requirements.txt
python -m pip install --no-deps -e .
uvicorn digilicense_ai.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

`requirements.txt` is a fully hashed export of every dependency in `uv.lock`. The local package
is installed separately because editable installs cannot participate in pip's hash-checking mode.
After changing dependencies, regenerate the export from this directory:

```bash
uv export --frozen --all-groups --no-emit-project --no-header --format requirements.txt --output-file requirements.txt
```

### Conda

Run these commands from `packages/ai-service` so the relative requirements path resolves:

```bash
conda env create -f environment.yml
conda activate bwmi
python -m pip install --no-deps -e .
uvicorn digilicense_ai.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

The default `development` profile uses fake components and requires no API keys. Select the local
DLP implementation with `DIGILICENSE_AI_DLP_BACKEND=local`; its pinned spaCy model is loaded while
the application container is built so initialization failure prevents startup.

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

## PII boundary

The local DLP gateway normalizes Unicode, converts Devanagari digits, detects hostile invisible
or bidi controls, validates Indian structured identifiers, and uses disclosure cues plus the
pinned English spaCy model for contextual person and address detection. Hindi and Hinglish
coverage is rule-based; no Hindi NER model is claimed.

India-specific structured rules and multilingual disclosure rules are registered as local
Presidio recognizers. Auditable cue phrases are loaded from the packaged, validated
`src/digilicense_ai/dlp/policies/v1.json` policy instead of being embedded in orchestration code.

DLP checks inbound questions, canonical provider payloads, and outbound answers. Detected values
are replaced only in transient memory. They are never persisted, logged, or placed in exception
responses, and no anonymization/deanonymization vault exists. Raw questions remain structurally
excluded from provider requests even if DLP misses an entity.

## Configuration profiles

All variables use the `DIGILICENSE_AI_` prefix.

| Profile | Current purpose |
| --- | --- |
| `development` | Fake vertical slice, with optional local DLP |
| `test` | Deterministic automated tests |
| `evaluation` | Future controlled provider/retrieval comparison |
| `production` | Validates the final safe backend combination |

Production configuration is accepted only when it selects local DLP, local semantic context,
local intent routing, local BM25 retrieval, and OpenAI. Those production implementations are
added only in their designated phases; Phase 1 implements the local DLP selection.
