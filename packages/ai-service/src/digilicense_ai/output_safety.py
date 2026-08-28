"""Deterministic validation for provider answers after schema validation."""

import re
import unicodedata
from dataclasses import dataclass

from digilicense_ai.corpus import CorpusError, PromotedCorpus
from digilicense_ai.corpus.models import FactPacket
from digilicense_ai.schemas import CanonicalProviderRequest, ProviderResult

_HTML_OR_MARKDOWN = re.compile(
    r"<[^>]+>|[`*_~]|!\[[^]]*\]|\[[^]]+\]\([^)]*\)|^\s{0,3}#{1,6}\s|^\s*>\s",
    re.MULTILINE,
)
_URL = re.compile(r"(?:\b[a-z][a-z0-9+.-]{1,31}:(?://|[^\s])|www\.)\S*", re.IGNORECASE)
_NUMBER = re.compile(r"\d+")
_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_SIMPLE_ENGLISH_NUMBER_WORDS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
}
_ENGLISH_TENS = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}
_HINDI_NUMBER_WORDS = {
    "एक": 1,
    "दो": 2,
    "तीन": 3,
    "चार": 4,
    "पांच": 5,
    "पाँच": 5,
    "छह": 6,
    "सात": 7,
    "आठ": 8,
    "नौ": 9,
    "दस": 10,
    "बीस": 20,
    "तीस": 30,
}
_ENGLISH_SPELLED_NUMBER = re.compile(
    r"\b(?:(?P<tens>twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)"
    r"(?:[-\s]+(?P<ones>one|two|three|four|five|six|seven|eight|nine))?"
    r"|(?P<simple>zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
    r"thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen))\b",
    re.IGNORECASE,
)
_HINDI_SPELLED_NUMBER = re.compile(
    r"(?<![\u0900-\u097f])(?:एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस|बीस|तीस)(?![\u0900-\u097f])"
)
_UNPARSED_ENGLISH_QUANTITY = re.compile(
    r"\b(?:hundred|thousand|million|billion|dozen)(?:[-\s]+[a-z]+){0,2}\s+"
    r"(?:days?|months?|years?|inr|rupees?)\b|"
    r"\bhalf\s+(?:an?\s+)?(?:days?|months?|years?)\b|"
    r"\b(?:an?\s+)?(?:days?|months?|years?)\s+and\s+(?:an?\s+)?half\b|"
    r"\b(?:a|an|couple|few|several|many)\s+(?:days?|months?|years?)\b",
    re.IGNORECASE,
)
_HINDI_WORD_BEFORE_UNIT = re.compile(r"(?P<word>[\u0900-\u097f]+)\s*(?:दिन|महीने?|साल|वर्ष|रुपये?)")
_HINDI_NON_QUANTITY_UNIT_MODIFIERS = frozenset({"इस", "पिछले", "अगले", "हर", "प्रत्येक"})
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
_EXTERNAL_DIRECTION = re.compile(
    r"\b(?:visit|go\s+to|open|check|use|refer\s+to)\s+(?:the\s+)?"
    r"(?:official|government|external)\s+(?:website|site|portal|service)\b|"
    r"(?:सरकारी|आधिकारिक)\s+(?:वेबसाइट|साइट|पोर्टल)\s+(?:पर|का)\s*(?:जाएं|जाइए|देखें)",
    re.IGNORECASE,
)


class OutputSafetyError(ValueError):
    """The provider result cannot be released to the caller."""


def _numbers(value: str) -> tuple[str, ...]:
    return tuple(_NUMBER.findall(_normalize_spelled_numbers(value)))


def _normalize_spelled_numbers(value: str) -> str:
    normalized = value.translate(_DEVANAGARI_DIGITS)

    def english_value(match: re.Match[str]) -> str:
        simple = match.group("simple")
        if simple is not None:
            return str(_SIMPLE_ENGLISH_NUMBER_WORDS[simple.casefold()])
        tens = _ENGLISH_TENS[match.group("tens").casefold()]
        ones = match.group("ones")
        return str(tens + (_SIMPLE_ENGLISH_NUMBER_WORDS[ones.casefold()] if ones else 0))

    normalized = _ENGLISH_SPELLED_NUMBER.sub(english_value, normalized)
    return _HINDI_SPELLED_NUMBER.sub(
        lambda match: str(_HINDI_NUMBER_WORDS[match.group()]), normalized
    )


def _numeric_claims(value: str) -> tuple[tuple[str, str | None], ...]:
    normalized = _normalize_spelled_numbers(value)
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


def _has_unparsed_hindi_quantity(value: str) -> bool:
    return any(
        match.group("word") not in _HINDI_NON_QUANTITY_UNIT_MODIFIERS
        for match in _HINDI_WORD_BEFORE_UNIT.finditer(value)
    )


def _fact_unit(unit: str) -> str:
    return _UNIT_ALIASES.get(unit.casefold(), unit.casefold())


def _is_numeric_fact(fact: FactPacket) -> bool:
    return _NUMBER.search(_normalize_spelled_numbers(fact.value)) is not None


def _contains_reviewed_text_fact(answer: str, fact: FactPacket) -> bool:
    normalized_answer = " ".join(unicodedata.normalize("NFKC", answer).casefold().split())
    normalized_phrase = " ".join(
        unicodedata.normalize("NFKC", f"{fact.value} {fact.unit}").casefold().split()
    )
    return re.search(
        rf"(?<!\w){re.escape(normalized_phrase)}(?!\w)", normalized_answer
    ) is not None


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
        if _EXTERNAL_DIRECTION.search(answer):
            raise OutputSafetyError("answer directs the user outside DigiLicense")

        permitted_source_ids = {item.source_id for item in request.evidence}
        if not result.source_ids or not set(result.source_ids).issubset(permitted_source_ids):
            raise OutputSafetyError("answer cites a source outside retrieved evidence")

        evidence_sections = {(item.source_id, item.section_id) for item in request.evidence}
        expected_facts = {
            fact.fact_id: fact
            for fact in self.corpus.manifest.fact_packets
            if (fact.source_id, fact.section_id) in evidence_sections
            and request.intent in fact.intents
        }
        for source_id in result.source_ids:
            try:
                source = self.corpus.source(source_id)
            except CorpusError as error:
                raise OutputSafetyError("answer cites an unknown source") from error
            if request.intent not in source.allowed_intents:
                raise OutputSafetyError("source is not allowed for this intent")
            if source.kind.value == "prototype_behavior" and not any(
                marker in lowered for marker in _SIMULATION_MARKERS
            ):
                raise OutputSafetyError("prototype behavior lacks simulation disclosure")

        supplied_facts = {fact.fact_id: fact for fact in request.facts}
        if set(supplied_facts) != set(expected_facts):
            raise OutputSafetyError("provider fact payload does not match retrieved evidence")
        for fact_id, fact in supplied_facts.items():
            expected = expected_facts[fact_id]
            if (
                fact.source_id != expected.source_id
                or fact.section_id != expected.section_id
                or fact.label != expected.label
                or fact.value != expected.value
                or fact.unit != expected.unit
            ):
                raise OutputSafetyError("provider fact payload does not match reviewed fact")

        if len(set(result.fact_ids)) != len(result.fact_ids):
            raise OutputSafetyError("answer returned duplicate fact IDs")
        if not set(result.fact_ids).issubset(supplied_facts):
            raise OutputSafetyError("answer cites a fact outside retrieved evidence")
        if any(
            supplied_facts[fact_id].source_id not in result.source_ids
            for fact_id in result.fact_ids
        ):
            raise OutputSafetyError("answer cites a fact outside its cited source")

        normalized_answer = _normalize_spelled_numbers(answer)
        numeric_claims = _numeric_claims(answer)
        if _UNPARSED_ENGLISH_QUANTITY.search(answer):
            raise OutputSafetyError("answer contains an unsupported spelled numeric claim")
        if _has_unparsed_hindi_quantity(normalized_answer):
            raise OutputSafetyError("answer contains an unsupported Hindi numeric claim")
        if numeric_claims and not result.fact_ids:
            raise OutputSafetyError("numeric answer omits reviewed fact IDs")
        cited_facts = tuple(expected_facts[fact_id] for fact_id in result.fact_ids)
        numeric_cited_facts = tuple(fact for fact in cited_facts if _is_numeric_fact(fact))
        textual_cited_facts = tuple(fact for fact in cited_facts if not _is_numeric_fact(fact))
        for value, unit in numeric_claims:
            if not any(
                fact.value.translate(_DEVANAGARI_DIGITS) == value
                and unit is not None
                and _fact_unit(fact.unit) == unit
                for fact in numeric_cited_facts
            ):
                raise OutputSafetyError("answer contains a numeric claim outside fact packets")
        if any(
            not any(
                fact.value.translate(_DEVANAGARI_DIGITS) == value
                and unit is not None
                and _fact_unit(fact.unit) == unit
                for value, unit in numeric_claims
            )
            for fact in numeric_cited_facts
        ):
            raise OutputSafetyError("answer cites a fact without using its reviewed value and unit")
        if any(
            not _contains_reviewed_text_fact(answer, fact) for fact in textual_cited_facts
        ):
            raise OutputSafetyError("answer cites a fact without using its reviewed value and unit")
        return result.model_copy(update={"answer": answer})
