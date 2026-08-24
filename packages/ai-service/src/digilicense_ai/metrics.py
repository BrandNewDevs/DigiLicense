"""Bounded, sanitized in-process metrics for the stateless prototype."""

from collections import Counter, deque
from dataclasses import dataclass, field


@dataclass
class SanitizedMetrics:
    _counters: Counter[tuple[str, ...]] = field(default_factory=Counter)
    _events: deque[dict[str, object]] = field(default_factory=lambda: deque(maxlen=1024))

    def record_answer(
        self,
        *,
        request_id: str,
        intent: str,
        source_ids: tuple[str, ...],
        model: str,
        fallback_code: str,
    ) -> None:
        """Record only bounded enums/IDs; never accept question or answer content."""

        safe_sources = tuple(sorted(source_ids[:3]))
        self._counters[(intent, safe_sources.__repr__(), model, fallback_code)] += 1
        self._events.append(
            {
                "request_id": request_id,
                "intent": intent,
                "source_ids": safe_sources,
                "model": model,
                "prompt_version": "phase6-output-safety-v1",
                "fallback_code": fallback_code,
            }
        )

    def record_dependency_failure(
        self,
        *,
        request_id: str,
        dependency: str,
        category: str,
    ) -> None:
        """Record a bounded dependency failure without request or exception content."""

        self._counters[("dependency_failure", dependency, category)] += 1
        self._events.append(
            {
                "request_id": request_id,
                "dependency": dependency,
                "category": category,
            }
        )

    def snapshot(self) -> dict[tuple[str, ...], int]:
        return dict(self._counters)

    def events(self) -> tuple[dict[str, object], ...]:
        return tuple(self._events)
