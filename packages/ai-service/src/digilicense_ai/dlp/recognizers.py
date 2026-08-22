"""India-specific structured and contextual PII recognizers."""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from presidio_analyzer import (
    AnalyzerEngine,
    LocalRecognizer,
    RecognizerRegistry,
    RecognizerResult,
)
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_analyzer.predefined_recognizers import SpacyRecognizer

from digilicense_ai.dlp.policy import DlpPolicy, load_dlp_policy, phrase_alternation

if TYPE_CHECKING:
    from presidio_analyzer.nlp_engine import NlpArtifacts

_COMPACT_SEPARATORS = re.compile(r"[\s./-]+")


@dataclass(frozen=True, slots=True)
class DetectedSpan:
    entity_type: str
    start: int
    end: int
    score: float


@dataclass(frozen=True, slots=True)
class StructuredRule:
    entity_type: str
    pattern: re.Pattern[str]
    score: float = 1.0
    group: str | int = 0
    validator: Callable[[str], bool] | None = None


_AADHAAR_PATTERN = re.compile(r"(?<!\d)(?P<value>[2-9](?:[\s./-]?\d){11})(?!\d)")
_PAN_PATTERN = re.compile(
    r"(?<![A-Z0-9])(?P<value>[A-Z]{5}[\s-]?\d{4}[\s-]?[A-Z])(?![A-Z0-9])",
    re.IGNORECASE,
)
_MOBILE_PATTERN = re.compile(
    r"(?<!\d)(?P<value>(?:(?:\+|00)?91[\s.-]?)?[6-9](?:[\s.-]?\d){9})(?!\d)"
)
_EMAIL_PATTERN = re.compile(
    r"(?<![\w.+-])(?P<value>[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]+\.[A-Z]{2,63})(?![\w.-])",
    re.IGNORECASE,
)
_UPI_PATTERN = re.compile(
    r"(?<![\w.-])(?P<value>[A-Z0-9._-]{2,64}@[A-Z]{2,32})(?![\w.-])",
    re.IGNORECASE,
)
_IFSC_PATTERN = re.compile(r"(?<![A-Z0-9])(?P<value>[A-Z]{4}0[A-Z0-9]{6})(?![A-Z0-9])", re.I)
_DRIVING_LICENCE_PATTERN = re.compile(
    r"(?<![A-Z0-9])(?P<value>[A-Z]{2}[\s-]?\d{2}[\s-]?\d{4}[\s-]?\d{7})(?![A-Z0-9])",
    re.IGNORECASE,
)
_LEARNER_LICENCE_PATTERN = re.compile(
    r"(?<![A-Z0-9])(?P<value>LL[\s/-]?[A-Z0-9](?:[A-Z0-9\s/-]{5,18}[A-Z0-9]))(?![A-Z0-9])",
    re.IGNORECASE,
)
_VEHICLE_REGISTRATION_PATTERN = re.compile(
    r"(?<![A-Z0-9])(?P<value>(?:[A-Z]{2}[\s-]?\d{1,2}[A-Z]?[\s-]?[A-Z]{1,2}"
    r"[\s-]?\d{4}|\d{2}[\s-]?BH[\s-]?\d{4}[\s-]?[A-Z]{1,2}))(?![A-Z0-9])",
    re.IGNORECASE,
)
_OTP_PATTERN = re.compile(
    r"(?:\botp\b|one[\s-]?time password|verification code|security code|"
    r"\bcode\b|ओटीपी|सत्यापन कोड|वेरिफिकेशन कोड|"
    r"(?:mera|merā|मेरा)\s+(?:otp|code))"
    r"\s*(?:(?:is|hai|है)\s*)?[:=-]?\s*(?P<value>\d{4,8})(?!\d)",
    re.IGNORECASE,
)
_APPLICATION_PATTERN = re.compile(
    r"(?:application|आवेदन|aavedan)\s*(?:number|no\.?|id|संख्या|नंबर)?\s*[:#=-]?\s*"
    r"(?P<value>[A-Z0-9](?:[A-Z0-9/-]{5,23}[A-Z0-9]))",
    re.IGNORECASE,
)
_RECEIPT_PATTERN = re.compile(
    r"(?:receipt|transaction|payment reference|रसीद|भुगतान संदर्भ)\s*"
    r"(?:number|no\.?|id|संख्या|नंबर)?\s*[:#=-]?\s*"
    r"(?P<value>[A-Z0-9](?:[A-Z0-9/-]{5,23}[A-Z0-9]))",
    re.IGNORECASE,
)
_BANK_ACCOUNT_PATTERN = re.compile(
    r"(?:bank\s+)?(?:account|a/c|खाता)\s*(?:number|no\.?|संख्या|नंबर)?\s*[:#=-]?\s*"
    r"(?P<value>\d(?:[\s-]?\d){8,17})(?!\d)",
    re.IGNORECASE,
)
_PASSPORT_PATTERN = re.compile(
    r"(?:passport|पासपोर्ट)\s*(?:number|no\.?|संख्या|नंबर)?\s*[:#=-]?\s*"
    r"(?P<value>[A-Z][1-9]\d{6})(?![A-Z0-9])",
    re.IGNORECASE,
)
_VOTER_ID_PATTERN = re.compile(
    r"(?:voter(?:\s+id)?|epic|मतदाता(?:\s+पहचान)?)\s*"
    r"(?:number|no\.?|संख्या|नंबर)?\s*[:#=-]?\s*"
    r"(?P<value>[A-Z]{3}\d{7})(?![A-Z0-9])",
    re.IGNORECASE,
)

_STRUCTURED_RULES = (
    StructuredRule(
        "AADHAAR_NUMBER",
        _AADHAAR_PATTERN,
        validator=lambda value: is_valid_aadhaar(value),
    ),
    StructuredRule("PAN_NUMBER", _PAN_PATTERN),
    StructuredRule("EMAIL_ADDRESS", _EMAIL_PATTERN),
    StructuredRule("INDIAN_MOBILE_NUMBER", _MOBILE_PATTERN),
    StructuredRule("OTP", _OTP_PATTERN, group="value"),
    StructuredRule("DRIVING_LICENCE_NUMBER", _DRIVING_LICENCE_PATTERN),
    StructuredRule(
        "LEARNER_LICENCE_NUMBER",
        _LEARNER_LICENCE_PATTERN,
        validator=lambda value: any(character.isdigit() for character in value),
    ),
    StructuredRule(
        "APPLICATION_REFERENCE",
        _APPLICATION_PATTERN,
        group="value",
        validator=lambda value: any(character.isdigit() for character in value),
    ),
    StructuredRule(
        "RECEIPT_REFERENCE",
        _RECEIPT_PATTERN,
        group="value",
        validator=lambda value: any(character.isdigit() for character in value),
    ),
    StructuredRule("IFSC_CODE", _IFSC_PATTERN),
    StructuredRule("BANK_ACCOUNT_NUMBER", _BANK_ACCOUNT_PATTERN, group="value"),
    StructuredRule("INDIAN_PASSPORT_NUMBER", _PASSPORT_PATTERN, group="value"),
    StructuredRule("VOTER_ID", _VOTER_ID_PATTERN, group="value"),
    StructuredRule("VEHICLE_REGISTRATION", _VEHICLE_REGISTRATION_PATTERN),
    StructuredRule("UPI_ID", _UPI_PATTERN),
)
_STRUCTURED_ENTITIES = tuple(rule.entity_type for rule in _STRUCTURED_RULES)


class IndiaStructuredRecognizer(LocalRecognizer):
    """Presidio recognizer for validated India-specific structured identifiers."""

    RECOGNIZER_NAME = "IndiaStructuredRecognizer"

    def __init__(self) -> None:
        super().__init__(
            supported_entities=list(_STRUCTURED_ENTITIES),
            name=self.RECOGNIZER_NAME,
            supported_language="en",
            version="1.0.0",
            country_code="IN",
        )

    def load(self) -> None:
        return None

    def analyze(
        self,
        text: str,
        entities: list[str],
        nlp_artifacts: NlpArtifacts | None = None,
    ) -> list[RecognizerResult]:
        del nlp_artifacts
        requested = set(entities)
        results: list[RecognizerResult] = []
        for rule in _STRUCTURED_RULES:
            if rule.entity_type not in requested:
                continue
            for match in rule.pattern.finditer(text):
                value = match.group(rule.group)
                if rule.validator is not None and not rule.validator(value):
                    continue
                results.append(
                    RecognizerResult(
                        entity_type=rule.entity_type,
                        start=match.start(rule.group),
                        end=match.end(rule.group),
                        score=rule.score,
                        recognition_metadata={
                            RecognizerResult.RECOGNIZER_NAME_KEY: self.RECOGNIZER_NAME,
                            RecognizerResult.RECOGNIZER_IDENTIFIER_KEY: self.id,
                        },
                    )
                )
        return results


class MultilingualDisclosureRecognizer(LocalRecognizer):
    """Presidio recognizer driven by the versioned multilingual cue policy."""

    RECOGNIZER_NAME = "MultilingualDisclosureRecognizer"

    def __init__(self, policy: DlpPolicy) -> None:
        super().__init__(
            supported_entities=["PERSON_NAME", "PERSONAL_ADDRESS"],
            name=self.RECOGNIZER_NAME,
            supported_language="en",
            version=policy.version,
            country_code="IN",
        )
        self._patterns = {
            "PERSON_NAME": _disclosure_pattern(
                cues=policy.name_cues,
                terminators=policy.name_terminators,
                minimum_length=2,
                maximum_length=60,
                excluded_punctuation=r",.;!?।",
                exclude_digits=True,
            ),
            "PERSONAL_ADDRESS": _disclosure_pattern(
                cues=policy.address_cues,
                terminators=policy.address_terminators,
                minimum_length=5,
                maximum_length=120,
                excluded_punctuation=r";!?।",
                exclude_digits=False,
            ),
        }

    def load(self) -> None:
        return None

    def analyze(
        self,
        text: str,
        entities: list[str],
        nlp_artifacts: NlpArtifacts | None = None,
    ) -> list[RecognizerResult]:
        del nlp_artifacts
        requested = set(entities)
        results: list[RecognizerResult] = []
        for entity_type, pattern in self._patterns.items():
            if entity_type not in requested:
                continue
            results.extend(
                RecognizerResult(
                    entity_type=entity_type,
                    start=match.start("value"),
                    end=match.end("value"),
                    score=0.95,
                    recognition_metadata={
                        RecognizerResult.RECOGNIZER_NAME_KEY: self.RECOGNIZER_NAME,
                        RecognizerResult.RECOGNIZER_IDENTIFIER_KEY: self.id,
                    },
                )
                for match in pattern.finditer(text)
            )
        return results


_VERHOEFF_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_VERHOEFF_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)


def build_recognizer_registry(policy: DlpPolicy | None = None) -> RecognizerRegistry:
    resolved_policy = policy or load_dlp_policy()
    return RecognizerRegistry(
        recognizers=[
            IndiaStructuredRecognizer(),
            MultilingualDisclosureRecognizer(resolved_policy),
            SpacyRecognizer(
                supported_language="en",
                supported_entities=["PERSON", "LOCATION"],
            ),
        ],
        supported_languages=["en"],
    )


def build_presidio_analyzer(
    model_name: str = "en_core_web_sm",
    policy: DlpPolicy | None = None,
) -> AnalyzerEngine:
    """Load the pinned local spaCy model and minimal Presidio registry."""

    resolved_policy = policy or load_dlp_policy()
    provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": model_name}],
        }
    )
    nlp_engine = provider.create_engine()
    return AnalyzerEngine(
        registry=build_recognizer_registry(resolved_policy),
        nlp_engine=nlp_engine,
        supported_languages=["en"],
        default_score_threshold=0.5,
    )


def find_structured_pii(
    text: str,
    registry: RecognizerRegistry,
) -> tuple[DetectedSpan, ...]:
    findings: list[DetectedSpan] = []
    recognizers = registry.get_recognizers(language="en", entities=list(_STRUCTURED_ENTITIES))
    for recognizer in recognizers:
        if not isinstance(recognizer, IndiaStructuredRecognizer):
            continue
        findings.extend(
            DetectedSpan(
                entity_type=result.entity_type,
                start=result.start,
                end=result.end,
                score=result.score,
            )
            for result in recognizer.analyze(text, list(_STRUCTURED_ENTITIES))
        )
    return resolve_overlaps(findings)


def find_contextual_pii(
    text: str,
    analyzer: AnalyzerEngine,
    policy: DlpPolicy,
) -> tuple[DetectedSpan, ...]:
    findings: list[DetectedSpan] = []
    name_cue = policy.name_cue_pattern()
    address_cue = policy.address_cue_pattern()
    for result in analyzer.analyze(
        text=text,
        language="en",
        entities=["PERSON_NAME", "PERSONAL_ADDRESS", "PERSON", "LOCATION"],
        score_threshold=0.5,
    ):
        prefix = text[max(0, result.start - 64) : result.start]
        if result.entity_type in {"PERSON_NAME", "PERSONAL_ADDRESS"}:
            findings.append(
                DetectedSpan(result.entity_type, result.start, result.end, result.score)
            )
        elif result.entity_type == "PERSON" and name_cue.search(prefix):
            findings.append(DetectedSpan("PERSON_NAME", result.start, result.end, result.score))
        elif result.entity_type == "LOCATION" and address_cue.search(prefix):
            findings.append(
                DetectedSpan("PERSONAL_ADDRESS", result.start, result.end, result.score)
            )
    return resolve_overlaps(findings)


def is_valid_aadhaar(value: str) -> bool:
    compact = _COMPACT_SEPARATORS.sub("", value)
    if len(compact) != 12 or not compact.isascii() or not compact.isdigit():
        return False
    if compact[0] in {"0", "1"}:
        return False

    checksum = 0
    for index, character in enumerate(reversed(compact)):
        checksum = _VERHOEFF_D[checksum][_VERHOEFF_P[index % 8][int(character)]]
    return checksum == 0


def resolve_overlaps(findings: Iterable[DetectedSpan]) -> tuple[DetectedSpan, ...]:
    selected: list[DetectedSpan] = []
    prioritized = sorted(
        findings,
        key=lambda item: (-item.score, -(item.end - item.start), item.start, item.entity_type),
    )
    for candidate in prioritized:
        overlaps = any(
            candidate.start < existing.end and candidate.end > existing.start
            for existing in selected
        )
        if overlaps:
            continue
        selected.append(candidate)
    return tuple(sorted(selected, key=lambda item: (item.start, item.end)))


def scrub_text(text: str, findings: Iterable[DetectedSpan]) -> str:
    scrubbed = text
    for finding in sorted(findings, key=lambda item: item.start, reverse=True):
        scrubbed = scrubbed[: finding.start] + f"<{finding.entity_type}>" + scrubbed[finding.end :]
    return scrubbed


def _disclosure_pattern(
    *,
    cues: tuple[str, ...],
    terminators: tuple[str, ...],
    minimum_length: int,
    maximum_length: int,
    excluded_punctuation: str,
    exclude_digits: bool,
) -> re.Pattern[str]:
    cue_expression = phrase_alternation(cues)
    terminator_expression = phrase_alternation(terminators)
    excluded_characters = rf"\d{excluded_punctuation}" if exclude_digits else excluded_punctuation
    return re.compile(
        rf"(?:{cue_expression})\s*[:=-]?\s*"
        rf"(?P<value>[^{excluded_characters}]{{{minimum_length},{maximum_length}}}?)"
        rf"(?=\s+(?:{terminator_expression})(?=\s|[{excluded_punctuation}]|$)|"
        rf"[{excluded_punctuation}]|$)",
        re.IGNORECASE,
    )
