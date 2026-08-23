FROM ghcr.io/astral-sh/uv:0.11.19 AS uv

FROM python:3.12-slim-bookworm AS builder

COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app

COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev

FROM python:3.12-slim-bookworm AS runtime

RUN groupadd --gid 10001 digilicense \
    && useradd --uid 10001 --gid digilicense --no-create-home \
        --home-dir /nonexistent --shell /usr/sbin/nologin digilicense

WORKDIR /app
COPY --from=builder --chown=digilicense:digilicense /app/.venv /app/.venv
COPY --chown=digilicense:digilicense src ./src

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD ["/app/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=2)"]

CMD ["uvicorn", "digilicense_ai.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
