"""Evaluation-only OpenAI vector-store adapter over the promoted corpus."""

from time import perf_counter
from typing import Any, Protocol

import structlog

from digilicense_ai.corpus import PromotedCorpus
from digilicense_ai.retrieval.bm25 import (
    _MAX_EVIDENCE_TOKENS,
    _MAX_RESULTS,
    _token_count,
    canonical_query,
)
from digilicense_ai.schemas import EvidenceChunk, RetrievalQuery

logger = structlog.get_logger(__name__)


class FileSearchClient(Protocol):
    @property
    def vector_stores(self) -> Any: ...

    async def close(self) -> None: ...


class FileSearchRetriever:
    """Maps evaluation search results to the same bounded EvidenceChunk contract as BM25."""

    def __init__(
        self,
        *,
        client: FileSearchClient,
        corpus: PromotedCorpus,
        vector_store_id: str,
        relevance_threshold: float = 0.12,
    ) -> None:
        if not vector_store_id.startswith("vs_"):
            raise ValueError("evaluation File Search requires a vector store ID")
        self._client = client
        self._corpus = corpus
        self._vector_store_id = vector_store_id
        self._relevance_threshold = relevance_threshold

    @property
    def corpus_version(self) -> str:
        return self._corpus.version

    async def retrieve(self, query: RetrievalQuery) -> tuple[EvidenceChunk, ...]:
        started = perf_counter()
        canonical = canonical_query(query)
        allowed = set(query.allowed_source_ids) or set(
            self._corpus.allowed_source_ids(query.intent)
        )
        allowed &= set(self._corpus.allowed_source_ids(query.intent))
        page = await self._client.vector_stores.search(
            self._vector_store_id,
            query=canonical,
            max_num_results=_MAX_RESULTS,
            rewrite_query=False,
        )
        evidence: list[EvidenceChunk] = []
        remaining_tokens = _MAX_EVIDENCE_TOKENS
        for result in getattr(page, "data", ()):
            attributes = getattr(result, "attributes", None) or {}
            source_id = attributes.get("source_id")
            section_id = attributes.get("section_id")
            if not isinstance(source_id, str) or not isinstance(section_id, str):
                continue
            if source_id not in allowed:
                continue
            section = self._corpus.section_by_id.get(section_id)
            if section is None or section[0].source_id != source_id:
                continue
            score = float(getattr(result, "score", 0.0))
            if not 0 <= score <= 1 or score < self._relevance_threshold:
                continue
            reviewed_text = section[1]
            if _token_count(reviewed_text) > remaining_tokens:
                continue
            source = self._corpus.source(source_id)
            evidence.append(
                EvidenceChunk(
                    source_id=source_id,
                    section_id=section_id,
                    title=source.title,
                    url=source.public_url,
                    text=reviewed_text,
                    score=round(score, 6),
                )
            )
            remaining_tokens -= _token_count(reviewed_text)
            if len(evidence) == _MAX_RESULTS:
                break
        await logger.ainfo(
            "retrieval_completed",
            backend="file_search",
            corpus_version=self._corpus.version,
            intent=query.intent.value,
            source_ids=[item.source_id for item in evidence],
            scores=[item.score for item in evidence],
            result_count=len(evidence),
            duration_ms=round((perf_counter() - started) * 1000, 2),
        )
        return tuple(evidence)

    async def close(self) -> None:
        await self._client.close()
