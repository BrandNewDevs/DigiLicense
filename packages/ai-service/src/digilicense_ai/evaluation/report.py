"""Sanitized acceptance-report composition for offline evaluation runs."""

from dataclasses import dataclass

from digilicense_ai.evaluation.runner import EvaluationReport


@dataclass(frozen=True, slots=True)
class AcceptanceSummary:
    dlp: EvaluationReport
    provider_payload_conformance: bool
    invalid_citation_rejection: bool
    fallback_correctness: bool
    primary_journey_without_provider: bool
    bm25_file_search_comparison_documented: bool

    def public_dump(self) -> dict[str, object]:
        """Return only aggregate booleans and measurements; never case text."""

        return {
            "totalCases": self.dlp.total_cases,
            "criticalPiiRecall": self.dlp.pii_recall,
            "benignFalsePositiveRate": self.dlp.false_positive_rate,
            "dlpP95Ms": self.dlp.dlp_p95_ms,
            "rawInputLeakage": self.dlp.raw_input_leakage,
            "providerPayloadConformance": self.provider_payload_conformance,
            "invalidCitationRejection": self.invalid_citation_rejection,
            "fallbackCorrectness": self.fallback_correctness,
            "primaryJourneyWithoutProvider": self.primary_journey_without_provider,
            "bm25FileSearchComparisonDocumented": self.bm25_file_search_comparison_documented,
        }
