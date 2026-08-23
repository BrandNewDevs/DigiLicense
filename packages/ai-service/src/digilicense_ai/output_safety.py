"""Deterministic validation for provider answers after schema validation."""

import re
from dataclasses import dataclass

from digilicense_ai.corpus import CorpusError, PromotedCorpus
from digilicense_ai.schemas import CanonicalProviderRequest, ProviderResult

_HTML_OR_MARKDOWN = re.compile(r"<[^>]+>|```|!\[[^]]*\]\([^)]*\)|\[[^]]+\]\([^)]*\)")
_URL = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
_NUMBER = re.compile(r"\d+")
_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_AFFILIATION = (
    "official government",
    "government approved",
    "official government portal",
    "सरकारी आधिकारिक",
    "सरकार द्वारा अनुमोदित",
)
_SIMULATION_MARKERS = (
    "simulat",
    "prototype",
    "सिमुले",
    "प्रोटोटाइप",
    "कृत्रिम",
)


class OutputSafetyError(ValueError):
    """The provider result cannot be released to the caller."""


def _numbers(value: str) -> frozenset[str]:
    return frozenset(_NUMBER.findall(value.translate(_DEVANAGARI_DIGITS)))


def assert_locale_fact_equivalence(english: str, hindi: str) -> None:
    """Ensure paired reviewed answers retain the same numeric/date facts."""

    if _numbers(english) != _numbers(hindi):
        raise OutputSafetyError("locale answers do not preserve numeric facts")


@dataclass(frozen=True, slots=True)
class OutputSafetyValidator:
    corpus: PromotedCorpus

    def validate(
        self,
        result: ProviderResult,
        request: CanonicalProviderRequest,
    ) -> ProviderResult:
        answer = result.answer.strip()
        if not answer or len(answer) > 1200:
            raise OutputSafetyError("answer length is outside the bounded contract")
        if _HTML_OR_MARKDOWN.search(answer) or _URL.search(answer):
            raise OutputSafetyError("answer contains markup or an untrusted URL")
        lowered = answer.casefold()
        if any(phrase in lowered for phrase in _AFFILIATION):
            raise OutputSafetyError("answer implies government affiliation")

        known_fact_values: set[str] = set()
        known_sources = set()
        for source_id in result.source_ids:
            try:
                source = self.corpus.source(source_id)
            except CorpusError:
                continue
            known_sources.add(source_id)
            if request.intent not in source.allowed_intents:
                raise OutputSafetyError("source is not allowed for this intent")
            if source.kind.value == "prototype_behavior" and not any(
                marker in lowered for marker in _SIMULATION_MARKERS
            ):
                raise OutputSafetyError("prototype behavior lacks simulation disclosure")
            known_fact_values.update(
                fact.value.translate(_DEVANAGARI_DIGITS)
                for fact in self.corpus.manifest.fact_packets
                if fact.source_id == source_id and request.intent in fact.intents
            )

        if known_sources and known_fact_values:
            answer_numbers = _numbers(answer)
            if not answer_numbers.issubset(known_fact_values):
                raise OutputSafetyError("answer contains a numeric claim outside fact packets")
        return result.model_copy(update={"answer": answer})
