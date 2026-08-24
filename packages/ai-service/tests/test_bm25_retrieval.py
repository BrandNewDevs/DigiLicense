import asyncio
from time import perf_counter
from typing import Any, cast

import pytest

from digilicense_ai.corpus import load_promoted_corpus
from digilicense_ai.retrieval.bm25 import Bm25Retriever, canonical_query
from digilicense_ai.schemas import CanonicalIntent, Locale, RetrievalQuery, Topic


class _FixedScores:
    def __init__(self, scores: list[float]) -> None:
        self._scores = scores

    def get_scores(self, tokens: list[str]) -> list[float]:
        del tokens
        return self._scores


def _query(intent: CanonicalIntent, *, allowed: tuple[str, ...] = ()) -> RetrievalQuery:
    return RetrievalQuery(
        intent=intent,
        topic=Topic.WAITLIST,
        locale=Locale.ENGLISH,
        allowed_source_ids=allowed,
    )


async def test_bm25_returns_reviewed_evidence_for_every_canonical_intent() -> None:
    corpus = load_promoted_corpus()
    retriever = Bm25Retriever(corpus)

    for intent in CanonicalIntent:
        result = await retriever.retrieve(_query(intent))
        assert result
        assert len(result) <= 3
        assert {item.source_id for item in result}.issubset(set(corpus.allowed_source_ids(intent)))
        assert all(item.score >= 0.12 for item in result)


async def test_bm25_prefilters_the_intent_allowlist_and_has_no_cross_intent_leakage() -> None:
    retriever = Bm25Retriever(load_promoted_corpus())

    result = await retriever.retrieve(_query(CanonicalIntent.WAITLIST_EXPLANATION))

    assert result
    assert {item.source_id for item in result} == {"digilicense-prototype-behavior-v1"}
    assert (
        await retriever.retrieve(
            _query(
                CanonicalIntent.WAITLIST_EXPLANATION,
                allowed=("delhi-driving-licence-guidance-2026",),
            )
        )
        == ()
    )


async def test_bm25_returns_no_evidence_when_no_allowlisted_source_can_match() -> None:
    retriever = Bm25Retriever(load_promoted_corpus())

    assert (
        await retriever.retrieve(
            _query(CanonicalIntent.WAITING_PERIOD_EXPLANATION, allowed=("unknown-source",))
        )
        == ()
    )


async def test_bm25_normalises_against_only_allowlisted_sections() -> None:
    retriever = Bm25Retriever(load_promoted_corpus())
    scores = [
        100.0 if section.source_id == "delhi-driving-licence-guidance-2026" else 0.0
        for section in retriever._sections
    ]
    first_allowed = next(
        index
        for index, section in enumerate(retriever._sections)
        if section.section_id == "prototype-waitlist-offers-v1"
    )
    scores[first_allowed] = 1.0
    retriever._index = cast(Any, _FixedScores(scores))

    result = await retriever.retrieve(_query(CanonicalIntent.WAITLIST_EXPLANATION))

    assert result
    assert result[0].score == 0.5


async def test_bm25_rejects_low_absolute_relevance_even_when_it_is_the_best_match() -> None:
    retriever = Bm25Retriever(load_promoted_corpus())
    retriever._index = cast(Any, _FixedScores([0.001] * len(retriever._sections)))

    result = await retriever.retrieve(_query(CanonicalIntent.WAITLIST_EXPLANATION))

    assert result == ()


def test_canonical_query_has_no_raw_question_input_surface() -> None:
    query = _query(CanonicalIntent.WAITING_PERIOD_EXPLANATION)

    assert "30 days" in canonical_query(query)
    with pytest.raises(TypeError, match="RetrievalQuery"):
        canonical_query("question with raw user text")  # type: ignore[arg-type]


async def test_bm25_result_bounds_and_stable_ranking() -> None:
    retriever = Bm25Retriever(load_promoted_corpus())
    query = _query(CanonicalIntent.CURRENT_STEP_EXPLANATION)

    first = await retriever.retrieve(query)
    second = await retriever.retrieve(query)

    assert first == second
    assert len(first) <= 3
    assert sum(len(item.text.split()) for item in first) <= 420


@pytest.mark.performance
async def test_bm25_retrieval_p95_is_below_twenty_milliseconds() -> None:
    retriever = Bm25Retriever(load_promoted_corpus())
    query = _query(CanonicalIntent.WAITING_PERIOD_EXPLANATION)
    durations: list[float] = []

    for _ in range(100):
        started = perf_counter()
        await retriever.retrieve(query)
        durations.append((perf_counter() - started) * 1000)
    durations.sort()

    assert durations[94] < 20


async def test_bm25_is_safe_under_prototype_concurrency() -> None:
    retriever = Bm25Retriever(load_promoted_corpus())

    results = await asyncio.gather(
        *(retriever.retrieve(_query(CanonicalIntent.WAITLIST_EXPLANATION)) for _ in range(20))
    )

    assert all(result for result in results)
