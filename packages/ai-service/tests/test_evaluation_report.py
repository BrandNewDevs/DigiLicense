from digilicense_ai.evaluation import AcceptanceSummary, EvaluationReport


def test_acceptance_report_is_aggregate_only() -> None:
    report = AcceptanceSummary(
        dlp=EvaluationReport(10, 2, 2, 0, 4.2, 0),
        provider_payload_conformance=True,
        invalid_citation_rejection=True,
        fallback_correctness=True,
        primary_journey_without_provider=True,
        bm25_file_search_comparison_documented=True,
    )

    public = report.public_dump()

    assert public["criticalPiiRecall"] == 1.0
    assert "question" not in str(public)
    assert "answer" not in str(public)
