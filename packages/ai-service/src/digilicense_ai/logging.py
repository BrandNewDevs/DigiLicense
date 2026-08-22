"""Structured logging that deliberately excludes request content."""

import logging
import re
from collections.abc import Mapping
from typing import Any

import structlog

_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_ALLOWED_REQUEST_PATHS = frozenset(
    {
        "/v1/assistant/messages",
        "/health/live",
        "/health/ready",
        "/openapi.json",
        "/docs",
        "/docs/oauth2-redirect",
        "/redoc",
    }
)


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", level=level.upper(), force=True)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def safe_request_id(candidate: str | None) -> str | None:
    if candidate and _REQUEST_ID_PATTERN.fullmatch(candidate):
        return candidate
    return None


def safe_request_path(path: str) -> str:
    """Return only allowlisted route names so arbitrary URL content cannot enter logs."""

    return path if path in _ALLOWED_REQUEST_PATHS else "unmatched"


def sanitized_event(event: str, **metadata: Any) -> Mapping[str, Any]:
    """Build an event from explicitly supplied non-content metadata."""

    return {"event": event, **metadata}
