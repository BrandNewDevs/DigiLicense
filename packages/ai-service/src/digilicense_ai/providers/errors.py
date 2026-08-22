"""Sanitized provider failures safe to handle outside provider adapters."""

from enum import StrEnum


class ProviderFailureReason(StrEnum):
    TIMEOUT = "timeout"
    RATE_LIMITED = "rate_limited"
    NETWORK = "network"
    INVALID_OUTPUT = "invalid_output"
    UNAVAILABLE = "unavailable"
    CIRCUIT_OPEN = "circuit_open"
    UNSAFE_PAYLOAD = "unsafe_payload"


class ProviderFailure(RuntimeError):
    """Provider failure containing a fixed reason and no upstream error content."""

    def __init__(self, reason: ProviderFailureReason) -> None:
        self.reason = reason
        super().__init__(f"provider failure: {reason.value}")
