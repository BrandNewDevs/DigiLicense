"""Small, process-local circuit breaker for bounded provider requests."""

import asyncio
from collections.abc import Callable
from time import monotonic

from digilicense_ai.providers.errors import ProviderFailure, ProviderFailureReason


class ProviderCircuitBreaker:
    """Open after consecutive provider failures and allow one recovery probe."""

    def __init__(
        self,
        *,
        failure_threshold: int,
        reset_seconds: float,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._failure_threshold = failure_threshold
        self._reset_seconds = reset_seconds
        self._clock = clock
        self._failures = 0
        self._opened_at: float | None = None
        self._recovery_probe_in_flight = False
        self._lock = asyncio.Lock()

    async def allow_request(self) -> None:
        """Fail without an upstream call while the circuit is open."""

        async with self._lock:
            if self._opened_at is None:
                return
            if self._clock() - self._opened_at < self._reset_seconds:
                raise ProviderFailure(ProviderFailureReason.CIRCUIT_OPEN)
            if self._recovery_probe_in_flight:
                raise ProviderFailure(ProviderFailureReason.CIRCUIT_OPEN)
            self._recovery_probe_in_flight = True

    async def record_success(self) -> None:
        async with self._lock:
            self._failures = 0
            self._opened_at = None
            self._recovery_probe_in_flight = False

    async def record_failure(self) -> None:
        async with self._lock:
            self._failures += 1
            self._recovery_probe_in_flight = False
            if self._failures >= self._failure_threshold:
                self._opened_at = self._clock()

    async def release_recovery_probe(self) -> None:
        """Release a cancelled half-open probe without changing circuit failure state."""

        async with self._lock:
            self._recovery_probe_in_flight = False
