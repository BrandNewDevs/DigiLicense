from digilicense_ai.evaluation import AcceptanceSummary, EvaluationReport, IntentEvaluationReport
from digilicense_ai.schemas import CanonicalIntent


def test_acceptance_report_is_aggregate_only() -> None:
    report = AcceptanceSummary(
        dlp=EvaluationReport(10, 2, 2, 0, 8, 4.2, 0),
        intent=IntentEvaluationReport(
            total_cases=10,
            correct_cases=10,
            recall_by_intent={CanonicalIntent.CURRENT_STEP_EXPLANATION: 1.0},
        ),
        verified_controls=frozenset(
            {
                "provider_payload_conformance",
                "invalid_citation_rejection",
                "fallback_correctness",
                "primary_journey_without_provider",
                "bm25_file_search_comparison_documented",
            }
        ),
    )

    public = report.public_dump()

    assert public["criticalPiiRecall"] == 1.0
    assert public["acceptanceComplete"] is True
    assert "question" not in str(public)
    assert "answer" not in str(public)


def test_acceptance_report_identifies_unevaluated_controls() -> None:
    report = AcceptanceSummary(
        dlp=EvaluationReport(1, 1, 1, 0, 0, 1.0, 0),
        intent=IntentEvaluationReport(1, 1, {CanonicalIntent.CURRENT_STEP_EXPLANATION: 1.0}),
        verified_controls=frozenset(),
    )

    assert report.acceptance_complete is False
    assert "provider_payload_conformance" in report.missing_controls
