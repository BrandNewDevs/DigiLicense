"""Synthetic evaluation and red-team fixtures for the AI service."""

from digilicense_ai.evaluation.dataset import EVALUATION_CASES, EvaluationCase
from digilicense_ai.evaluation.report import AcceptanceSummary
from digilicense_ai.evaluation.runner import EvaluationReport, evaluate_dlp_cases

__all__ = [
    "EVALUATION_CASES",
    "AcceptanceSummary",
    "EvaluationCase",
    "EvaluationReport",
    "evaluate_dlp_cases",
]
