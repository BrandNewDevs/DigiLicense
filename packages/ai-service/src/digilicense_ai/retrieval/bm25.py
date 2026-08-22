"""Deterministic local BM25 over the promoted corpus."""

import re
from dataclasses import dataclass
from time import perf_counter

import structlog
from rank_bm25 import BM25Okapi  # type: ignore[import-untyped]

from digilicense_ai.corpus import PromotedCorpus
from digilicense_ai.schemas import CanonicalIntent, EvidenceChunk, RetrievalQuery

logger = structlog.get_logger(__name__)

_MAX_RESULTS = 3
_MAX_EVIDENCE_TOKENS = 420
_MIN_SCORE = 0.12
_TOKEN = re.compile(r"[a-z0-9]+", re.IGNORECASE)

_INTENT_TERMS: dict[CanonicalIntent, str] = {
    CanonicalIntent.CURRENT_STEP_EXPLANATION: "current guided step public licence service",
    CanonicalIntent.LOCKED_ACTION_EXPLANATION: "prototype locked action reason guidance",
    CanonicalIntent.WAITING_PERIOD_EXPLANATION: "permanent licence waiting period 30 days learner",
    CanonicalIntent.LEARNER_LICENCE_EXPIRY_EXPLANATION: (
        "learner licence validity expiry six months"
    ),
    CanonicalIntent.NO_APPOINTMENT_EXPLANATION: "prototype no appointment availability simulated",
    CanonicalIntent.WAITLIST_EXPLANATION: "prototype appointment waitlist simulated workflow",
    CanonicalIntent.OFFER_EXPIRY_EXPLANATION: "prototype appointment offer timer simulated",
    CanonicalIntent.MOCK_VS_REAL_EXPLANATION: (
        "prototype simulated payment public policy separation"
    ),
    CanonicalIntent.PREPARATION_CHECKLIST_EXPLANATION: (
        "learner preparation vehicle controls road signs traffic rules"
    ),
    CanonicalIntent.UNSUPPORTED_QUESTION: "assistant scope evidence insufficient public guidance",
}


def canonical_query(query: RetrievalQuery) -> str:
    """Create a search string only from enum-controlled context, never user text."""

    if not isinstance(query, RetrievalQuery):
        raise TypeError("retrieval accepts only RetrievalQuery")
    return " ".join(
        (
            _INTENT_TERMS[query.intent],
            query.topic.value.replace("_", " "),
            "hindi" if query.locale.value == "hi" else "english",
        )
    )


def _tokens(value: str) -> list[str]:
    return _TOKEN.findall(value.lower())


def _token_count(value: str) -> int:
    return len(_tokens(value))


@dataclass(frozen=True, slots=True)
class _IndexedSection:
    source_id: str
    section_id: str
    title: str
    url: str
    text: str


class Bm25Retriever:
    """Local index initialized from one promoted, checksummed corpus release."""

    def __init__(self, corpus: PromotedCorpus, *, relevance_threshold: float = _MIN_SCORE) -> None:
        if not 0 <= relevance_threshold <= 1:
            raise ValueError("relevance threshold must be between zero and one")
        self._corpus = corpus
        self._relevance_threshold = relevance_threshold
        self._sections = tuple(
            _IndexedSection(
                source_id=source.source_id,
                section_id=section.section_id,
                title=source.title,
                url=str(source.public_url),
                text=section.text,
            )
            for source in corpus.manifest.sources
            for section in source.sections
        )
        if not self._sections:
            raise ValueError("promoted corpus has no searchable sections")
        self._index = BM25Okapi([_tokens(section.text) for section in self._sections])

    @property
    def corpus_version(self) -> str:
        return self._corpus.version

    async def retrieve(self, query: RetrievalQuery) -> tuple[EvidenceChunk, ...]:
        started = perf_counter()
        safe_query = canonical_query(query)
        allowed = set(query.allowed_source_ids) or set(
            self._corpus.allowed_source_ids(query.intent)
        )
        # A caller-provided allowlist can only narrow the corpus's intent allowlist.
        allowed &= set(self._corpus.allowed_source_ids(query.intent))
        raw_scores = self._index.get_scores(_tokens(safe_query))
        maximum = max((float(score) for score in raw_scores), default=0.0)
        candidates = [
            (self._normalise(float(score), maximum), section)
            for score, section in zip(raw_scores, self._sections, strict=True)
            if section.source_id in allowed
        ]
        candidates.sort(key=lambda item: (-item[0], item[1].source_id, item[1].section_id))

        evidence: list[EvidenceChunk] = []
        remaining_tokens = _MAX_EVIDENCE_TOKENS
        for score, section in candidates:
            if score < self._relevance_threshold or len(evidence) == _MAX_RESULTS:
                break
            token_count = _token_count(section.text)
            if token_count > remaining_tokens:
                continue
            evidence.append(
                EvidenceChunk(
                    source_id=section.source_id,
                    section_id=section.section_id,
                    title=section.title,
                    url=section.url,
                    text=section.text,
                    score=score,
                )
            )
            remaining_tokens -= token_count
        await logger.ainfo(
            "retrieval_completed",
            backend="bm25",
            corpus_version=self._corpus.version,
            intent=query.intent.value,
            source_ids=[item.source_id for item in evidence],
            scores=[item.score for item in evidence],
            result_count=len(evidence),
            duration_ms=round((perf_counter() - started) * 1000, 2),
        )
        return tuple(evidence)

    @staticmethod
    def _normalise(score: float, maximum: float) -> float:
        if maximum <= 0 or score <= 0:
            return 0.0
        return round(min(score / maximum, 1.0), 6)
