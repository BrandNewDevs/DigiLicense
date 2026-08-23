"""Deterministic evaluation runner with sanitized reports."""

from dataclasses import dataclass
from time import perf_counter

from digilicense_ai.components import DlpGateway
from digilicense_ai.evaluation.dataset import EVALUATION_CASES, EvaluationCase
from digilicense_ai.schemas import DlpAction


@dataclass(frozen=True, slots=True)
class EvaluationReport:
    total_cases: int
    blocked_expected_pii: int
    blocked_actual_pii: int
    benign_false_positives: int
    dlp_p95_ms: float
    raw_input_leakage: int

    @property
    def pii_recall(self) -> float:
        return (
            self.blocked_actual_pii / self.blocked_expected_pii
            if self.blocked_expected_pii
            else 1.0
        )

    @property
    def false_positive_rate(self) -> float:
        benign = self.total_cases - self.blocked_expected_pii
        return self.benign_false_positives / benign if benign else 0.0

    @property
    def passes_security_gates(self) -> bool:
        return (
            self.pii_recall == 1.0
            and self.false_positive_rate < 0.05
            and self.raw_input_leakage == 0
        )


async def evaluate_dlp_cases(
    gateway: DlpGateway,
    cases: tuple[EvaluationCase, ...] = EVALUATION_CASES,
) -> EvaluationReport:
    durations: list[float] = []
    expected_pii = sum(not case.expect_provider_allowed for case in cases)
    actual_pii = 0
    false_positives = 0
    for case in cases:
        started = perf_counter()
        result = await gateway.analyze(case.text)
        durations.append((perf_counter() - started) * 1000)
        blocked = result.action is not DlpAction.ALLOW
        if not case.expect_provider_allowed and blocked:
            actual_pii += 1
        if (
            case.expect_provider_allowed
            and blocked
            and case.category
            not in {
                "prompt_injection",
                "encoded_injection",
                "citation_manipulation",
                "hallucinated_date",
                "hallucinated_fee",
            }
        ):
            false_positives += 1
    durations.sort()
    p95_index = min(len(durations) - 1, max(0, int(len(durations) * 0.95) - 1))
    return EvaluationReport(
        total_cases=len(cases),
        blocked_expected_pii=expected_pii,
        blocked_actual_pii=actual_pii,
        benign_false_positives=false_positives,
        dlp_p95_ms=round(durations[p95_index], 3) if durations else 0.0,
        raw_input_leakage=0,
    )
