"""Deterministic evaluation runner with sanitized reports."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from time import perf_counter

from digilicense_ai.components import DlpGateway, IntentRouter
from digilicense_ai.evaluation.dataset import (
    EVALUATION_CASES,
    INTENT_EVALUATION_CASES,
    EvaluationCase,
    IntentEvaluationCase,
)
from digilicense_ai.schemas import AssistantMessageRequest, CanonicalIntent, DlpAction


@dataclass(frozen=True, slots=True)
class EvaluationReport:
    total_cases: int
    blocked_expected_pii: int
    blocked_actual_pii: int
    benign_false_positives: int
    expected_allow_cases: int
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
        return (
            self.benign_false_positives / self.expected_allow_cases
            if self.expected_allow_cases
            else 0.0
        )

    @property
    def passes_dlp_gates(self) -> bool:
        return (
            self.pii_recall == 1.0
            and self.false_positive_rate < 0.05
            and self.raw_input_leakage == 0
        )


@dataclass(frozen=True, slots=True)
class IntentEvaluationReport:
    total_cases: int
    correct_cases: int
    recall_by_intent: dict[CanonicalIntent, float]

    @property
    def macro_recall(self) -> float:
        return (
            sum(self.recall_by_intent.values()) / len(self.recall_by_intent)
            if self.recall_by_intent
            else 0.0
        )

    @property
    def passes_intent_gates(self) -> bool:
        return self.macro_recall >= 0.90 and all(
            recall >= 0.85 for recall in self.recall_by_intent.values()
        )


async def evaluate_dlp_cases(
    gateway: DlpGateway,
    cases: tuple[EvaluationCase, ...] = EVALUATION_CASES,
    egress_by_case: Mapping[str, Sequence[str]] | None = None,
) -> EvaluationReport:
    durations: list[float] = []
    expected_pii = sum(
        case.expected_dlp_action is DlpAction.BLOCK_PROVIDER_WITH_LOCAL_HELP for case in cases
    )
    expected_allow_cases = sum(case.expected_dlp_action is DlpAction.ALLOW for case in cases)
    actual_pii = 0
    false_positives = 0
    for case in cases:
        started = perf_counter()
        result = await gateway.analyze(case.text)
        durations.append((perf_counter() - started) * 1000)
        blocked = result.action is not DlpAction.ALLOW
        if case.expected_dlp_action is DlpAction.BLOCK_PROVIDER_WITH_LOCAL_HELP and blocked:
            actual_pii += 1
        if (
            case.expected_dlp_action is DlpAction.ALLOW
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
    raw_input_leakage = sum(
        any(case.text in artifact for artifact in (egress_by_case or {}).get(case.case_id, ()))
        for case in cases
    )
    durations.sort()
    p95_index = min(len(durations) - 1, max(0, int(len(durations) * 0.95) - 1))
    return EvaluationReport(
        total_cases=len(cases),
        blocked_expected_pii=expected_pii,
        blocked_actual_pii=actual_pii,
        benign_false_positives=false_positives,
        expected_allow_cases=expected_allow_cases,
        dlp_p95_ms=round(durations[p95_index], 3) if durations else 0.0,
        raw_input_leakage=raw_input_leakage,
    )


async def evaluate_intent_cases(
    router: IntentRouter,
    cases: tuple[IntentEvaluationCase, ...] = INTENT_EVALUATION_CASES,
) -> IntentEvaluationReport:
    """Measure the deterministic router against synthetic supported and rejected requests."""

    expected_by_intent: dict[CanonicalIntent, int] = {}
    correct_by_intent: dict[CanonicalIntent, int] = {}
    correct_cases = 0
    for case in cases:
        request = AssistantMessageRequest(
            question=case.text,
            locale=case.locale,
            service=case.service,
            page=case.page,
            reason_code=case.reason_code,
        )
        result = await router.route(request, case.text, case.context)
        expected_by_intent[case.expected_intent] = (
            expected_by_intent.get(case.expected_intent, 0) + 1
        )
        if result.intent is case.expected_intent:
            correct_cases += 1
            correct_by_intent[case.expected_intent] = (
                correct_by_intent.get(case.expected_intent, 0) + 1
            )
    recall_by_intent = {
        intent: correct_by_intent.get(intent, 0) / expected_count
        for intent, expected_count in expected_by_intent.items()
    }
    return IntentEvaluationReport(
        total_cases=len(cases),
        correct_cases=correct_cases,
        recall_by_intent=recall_by_intent,
    )
