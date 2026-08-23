"""Sanitized acceptance-report composition for offline evaluation runs."""

from dataclasses import dataclass

from digilicense_ai.evaluation.runner import EvaluationReport, IntentEvaluationReport


@dataclass(frozen=True, slots=True)
class AcceptanceSummary:
    dlp: EvaluationReport
    intent: IntentEvaluationReport
    verified_controls: frozenset[str]

    _REQUIRED_CONTROLS = frozenset(
        {
            "provider_payload_conformance",
            "invalid_citation_rejection",
            "fallback_correctness",
            "primary_journey_without_provider",
            "bm25_file_search_comparison_documented",
        }
    )

    @property
    def missing_controls(self) -> tuple[str, ...]:
        return tuple(sorted(self._REQUIRED_CONTROLS - self.verified_controls))

    @property
    def acceptance_complete(self) -> bool:
        return (
            self.dlp.passes_dlp_gates
            and self.intent.passes_intent_gates
            and not self.missing_controls
        )

    def public_dump(self) -> dict[str, object]:
        """Return only aggregate booleans and measurements; never case text."""

        return {
            "totalCases": self.dlp.total_cases,
            "criticalPiiRecall": self.dlp.pii_recall,
            "benignFalsePositiveRate": self.dlp.false_positive_rate,
            "dlpP95Ms": self.dlp.dlp_p95_ms,
            "rawInputLeakage": self.dlp.raw_input_leakage,
            "intentMacroRecall": self.intent.macro_recall,
            "intentRecallByIntent": {
                intent.value: recall for intent, recall in self.intent.recall_by_intent.items()
            },
            "verifiedControls": sorted(self.verified_controls),
            "missingControls": self.missing_controls,
            "acceptanceComplete": self.acceptance_complete,
        }
