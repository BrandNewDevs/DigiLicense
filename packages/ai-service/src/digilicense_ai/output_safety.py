"""Deterministic validation for provider answers after schema validation."""

import re
from dataclasses import dataclass

from digilicense_ai.corpus import CorpusError, PromotedCorpus
from digilicense_ai.schemas import CanonicalProviderRequest, ProviderResult

_HTML_OR_MARKDOWN = re.compile(
    r"<[^>]+>|[`*_~]|!\[[^]]*\]|\[[^]]+\]\([^)]*\)|^\s{0,3}#{1,6}\s|^\s*>\s",
    re.MULTILINE,
)
_URL = re.compile(r"(?:\b[a-z][a-z0-9+.-]{1,31}:(?://|[^\s])|www\.)\S*", re.IGNORECASE)
_NUMBER = re.compile(r"\d+")
_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_NUMBER_WORDS = {
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "eleven": "11",
    "twelve": "12",
    "एक": "1",
    "दो": "2",
    "तीन": "3",
    "चार": "4",
    "पांच": "5",
    "पाँच": "5",
    "छह": "6",
    "सात": "7",
    "आठ": "8",
    "नौ": "9",
    "दस": "10",
}
_NUMBER_WORD = re.compile(
    r"\b(?:"
    + "|".join(re.escape(word) for word in _NUMBER_WORDS if word.isascii())
    + r")\b|"
    + "|".join(re.escape(word) for word in _NUMBER_WORDS if not word.isascii()),
    re.IGNORECASE,
)
_UNIT = re.compile(
    r"\b(?P<unit>days?|months?|years?|inr|rupees?)\b|(?P<hindi>दिन|महीने?|साल|वर्ष|रुपये?)",
    re.IGNORECASE,
)
_UNIT_ALIASES = {
    "day": "days",
    "days": "days",
    "दिन": "days",
    "month": "months",
    "months": "months",
    "महीना": "months",
    "महीने": "months",
    "year": "years",
    "years": "years",
    "साल": "years",
    "वर्ष": "years",
    "inr": "inr",
    "rupee": "inr",
    "rupees": "inr",
    "रुपया": "inr",
    "रुपये": "inr",
}
_AFFILIATION = (
    "official government",
    "government approved",
    "official government portal",
    "government-run",
    "government portal",
    "government website",
    "run by the government",
    "सरकारी आधिकारिक",
    "सरकार द्वारा अनुमोदित",
    "सरकारी पोर्टल",
    "सरकार द्वारा संचालित",
)
_AFFILIATION_CONTEXT = re.compile(
    r"(?:digilicense|this\s+(?:service|portal|site|website)|our\s+(?:service|portal|site|website)|"
    r"यह\s+(?:सेवा|पोर्टल)|हमारी\s+(?:सेवा|पोर्टल)).{0,48}"
    r"(?:official|government|सरकारी|आधिकारिक)|"
    r"(?:official|government|सरकारी|आधिकारिक).{0,48}"
    r"(?:digilicense|this\s+(?:service|portal|site|website)|our\s+(?:service|portal|site|website)|"
    r"यह\s+(?:सेवा|पोर्टल)|हमारी\s+(?:सेवा|पोर्टल))",
    re.IGNORECASE,
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


def _numbers(value: str) -> tuple[str, ...]:
    normalized = value.translate(_DEVANAGARI_DIGITS)
    normalized = _NUMBER_WORD.sub(lambda match: _number_word_value(match.group()), normalized)
    return tuple(_NUMBER.findall(normalized))


def _number_word_value(value: str) -> str:
    return _NUMBER_WORDS.get(value.casefold(), _NUMBER_WORDS.get(value, value))


def _numeric_claims(value: str) -> tuple[tuple[str, str | None], ...]:
    normalized = value.translate(_DEVANAGARI_DIGITS)
    normalized = _NUMBER_WORD.sub(lambda match: _number_word_value(match.group()), normalized)
    claims: list[tuple[str, str | None]] = []
    for match in _NUMBER.finditer(normalized):
        following = normalized[match.end() : match.end() + 24]
        unit_match = _UNIT.match(following.lstrip())
        unit = None
        if unit_match is not None:
            raw_unit = unit_match.group("unit") or unit_match.group("hindi")
            unit = _UNIT_ALIASES[raw_unit.casefold()]
        claims.append((match.group(), unit))
    return tuple(claims)


def _fact_unit(unit: str) -> str:
    return _UNIT_ALIASES.get(unit.casefold(), unit.casefold())


def _implies_affiliation(value: str) -> bool:
    lowered = value.casefold()
    if any(phrase in lowered for phrase in _AFFILIATION):
        has_english_denial = re.search(r"\bnot\s+(?:an?\s+)?official\b", lowered) is not None
        return not has_english_denial and "सरकारी नहीं" not in lowered
    for match in _AFFILIATION_CONTEXT.finditer(value):
        prefix = value[max(0, match.start() - 12) : match.start()].casefold()
        if "not " not in prefix and "नहीं" not in prefix:
            return True
    return False


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
        if _implies_affiliation(answer):
            raise OutputSafetyError("answer implies government affiliation")

        permitted_source_ids = {item.source_id for item in request.evidence}
        if not result.source_ids or not set(result.source_ids).issubset(permitted_source_ids):
            raise OutputSafetyError("answer cites a source outside retrieved evidence")

        allowed_facts = {}
        known_sources = set()
        for source_id in result.source_ids:
            try:
                source = self.corpus.source(source_id)
            except CorpusError as error:
                raise OutputSafetyError("answer cites an unknown source") from error
            known_sources.add(source_id)
            if request.intent not in source.allowed_intents:
                raise OutputSafetyError("source is not allowed for this intent")
            if source.kind.value == "prototype_behavior" and not any(
                marker in lowered for marker in _SIMULATION_MARKERS
            ):
                raise OutputSafetyError("prototype behavior lacks simulation disclosure")
            allowed_facts.update(
                {
                    fact.fact_id: fact
                    for fact in self.corpus.manifest.fact_packets
                    if fact.source_id == source_id and request.intent in fact.intents
                }
            )

        if len(set(result.fact_ids)) != len(result.fact_ids):
            raise OutputSafetyError("answer returned duplicate fact IDs")
        if not set(result.fact_ids).issubset(allowed_facts):
            raise OutputSafetyError("answer cites a fact outside retrieved evidence")

        numeric_claims = _numeric_claims(answer)
        if numeric_claims and not result.fact_ids:
            raise OutputSafetyError("numeric answer omits reviewed fact IDs")
        cited_facts = tuple(allowed_facts[fact_id] for fact_id in result.fact_ids)
        for value, unit in numeric_claims:
            if not any(
                fact.value.translate(_DEVANAGARI_DIGITS) == value
                and unit is not None
                and _fact_unit(fact.unit) == unit
                for fact in cited_facts
            ):
                raise OutputSafetyError("answer contains a numeric claim outside fact packets")
        if result.fact_ids and not numeric_claims:
            raise OutputSafetyError("answer cites a fact without using its reviewed value and unit")
        return result.model_copy(update={"answer": answer})
