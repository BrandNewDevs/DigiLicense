"""In-process Presidio DLP gateway with fail-closed behavior."""

from __future__ import annotations

from typing import TYPE_CHECKING

import anyio
from presidio_analyzer import AnalyzerEngine

from digilicense_ai.dlp.normalization import NormalizedText, normalize_untrusted_text
from digilicense_ai.dlp.policy import DlpPolicy, load_dlp_policy
from digilicense_ai.dlp.recognizers import (
    DetectedSpan,
    build_presidio_analyzer,
    find_contextual_pii,
    find_structured_pii,
    scrub_text,
)
from digilicense_ai.schemas import DlpAction, DlpEntity, DlpResult, DlpScope

if TYPE_CHECKING:
    from collections.abc import Iterable


class DlpInitializationError(RuntimeError):
    """Safe startup error which never includes model-loader details."""


class LocalDlpGateway:
    """Analyze raw text locally and expose only spans, types, and scrubbed text."""

    def __init__(
        self,
        analyzer: AnalyzerEngine,
        timeout_ms: int = 250,
        policy: DlpPolicy | None = None,
    ) -> None:
        if timeout_ms <= 0:
            raise ValueError("DLP timeout must be positive")
        self._analyzer = analyzer
        self._policy = policy or load_dlp_policy()
        self._timeout_seconds = timeout_ms / 1000

    @classmethod
    def create(
        cls,
        *,
        model_name: str = "en_core_web_sm",
        timeout_ms: int = 250,
    ) -> LocalDlpGateway:
        try:
            policy = load_dlp_policy()
            analyzer = build_presidio_analyzer(model_name, policy)
        except Exception:
            raise DlpInitializationError("local DLP initialization failed") from None
        return cls(analyzer=analyzer, timeout_ms=timeout_ms, policy=policy)

    async def analyze(
        self,
        text: str,
        *,
        scope: DlpScope = DlpScope.INBOUND,
    ) -> DlpResult:
        try:
            normalized = normalize_untrusted_text(text)
            structured = find_structured_pii(normalized.text, self._analyzer.registry)
            threat_types = self._threat_types(normalized)

            if structured:
                return self._blocked_result(
                    scope=scope,
                    text=normalized.text,
                    findings=structured,
                    additional_types=threat_types,
                )

            if threat_types:
                return DlpResult(
                    action=DlpAction.UNSUPPORTED,
                    scope=scope,
                    entities=(),
                    entity_types=threat_types,
                    safe_routing_text="",
                    provider_allowed=False,
                )

            with anyio.fail_after(self._timeout_seconds):
                contextual = await anyio.to_thread.run_sync(
                    self._analyze_contextual,
                    normalized.text,
                    abandon_on_cancel=True,
                )
            if contextual:
                return self._blocked_result(
                    scope=scope,
                    text=normalized.text,
                    findings=contextual,
                )

            return DlpResult(
                action=DlpAction.ALLOW,
                scope=scope,
                entities=(),
                entity_types=(),
                safe_routing_text=normalized.text,
                provider_allowed=True,
            )
        except Exception:
            return DlpResult(
                action=DlpAction.FAIL_CLOSED,
                scope=scope,
                entities=(),
                entity_types=(),
                safe_routing_text="",
                provider_allowed=False,
            )

    def _analyze_contextual(self, text: str) -> tuple[DetectedSpan, ...]:
        return find_contextual_pii(text, self._analyzer, self._policy)

    @staticmethod
    def _blocked_result(
        *,
        scope: DlpScope,
        text: str,
        findings: Iterable[DetectedSpan],
        additional_types: tuple[str, ...] = (),
    ) -> DlpResult:
        resolved = tuple(findings)
        entity_types = tuple(
            sorted({*(finding.entity_type for finding in resolved), *additional_types})
        )
        return DlpResult(
            action=DlpAction.BLOCK_PROVIDER_WITH_LOCAL_HELP,
            scope=scope,
            entities=tuple(
                DlpEntity(
                    entity_type=finding.entity_type,
                    start=finding.start,
                    end=finding.end,
                    score=finding.score,
                )
                for finding in resolved
            ),
            entity_types=entity_types,
            safe_routing_text=scrub_text(text, resolved),
            provider_allowed=False,
        )

    @staticmethod
    def _threat_types(normalized: NormalizedText) -> tuple[str, ...]:
        threat_types: list[str] = []
        if normalized.has_invisible_obfuscation:
            threat_types.append("INVISIBLE_CHARACTER")
        if normalized.has_unsafe_bidi:
            threat_types.append("UNSAFE_BIDI_CONTROL")
        if normalized.has_suspicious_encoding:
            threat_types.append("SUSPICIOUS_ENCODED_PAYLOAD")
        return tuple(threat_types)
