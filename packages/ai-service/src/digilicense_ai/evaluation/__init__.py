"""Synthetic evaluation and red-team fixtures for the AI service."""

from digilicense_ai.evaluation.dataset import (
    EVALUATION_CASES,
    INTENT_EVALUATION_CASES,
    EvaluationCase,
    IntentEvaluationCase,
)
from digilicense_ai.evaluation.report import AcceptanceSummary
from digilicense_ai.evaluation.runner import (
    EvaluationReport,
    IntentEvaluationReport,
    evaluate_dlp_cases,
    evaluate_intent_cases,
)

__all__ = [
    "EVALUATION_CASES",
    "INTENT_EVALUATION_CASES",
    "AcceptanceSummary",
    "EvaluationCase",
    "EvaluationReport",
    "IntentEvaluationCase",
    "IntentEvaluationReport",
    "evaluate_dlp_cases",
    "evaluate_intent_cases",
]
