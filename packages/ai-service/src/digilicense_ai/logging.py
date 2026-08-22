"""Structured logging that deliberately excludes request content."""

import logging
import re
from collections.abc import Mapping
from typing import Any

import structlog

_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


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


def sanitized_event(event: str, **metadata: Any) -> Mapping[str, Any]:
    """Build an event from explicitly supplied non-content metadata."""

    return {"event": event, **metadata}
