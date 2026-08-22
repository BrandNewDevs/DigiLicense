from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, cast

import pytest

from digilicense_ai.corpus import load_promoted_corpus
from digilicense_ai.retrieval.file_search import FileSearchClient, FileSearchRetriever
from digilicense_ai.retrieval.lifecycle import (
    FileSearchLifecycleClient,
    UploadedSection,
    delete_evaluation_corpus,
    inspect_uploaded_sections,
    upload_promoted_sections,
)
from digilicense_ai.schemas import CanonicalIntent, Locale, RetrievalQuery, Topic


@dataclass
class _Content:
    text: str


@dataclass
class _SearchResult:
    score: float
    attributes: dict[str, str]
    content: tuple[_Content, ...]


class _VectorStoreFiles:
    def __init__(self, calls: list[tuple[str, str]]) -> None:
        self.calls = calls

    async def create(self, vector_store_id: str, **kwargs: Any) -> None:
        self.calls.append(("attach", kwargs["file_id"]))
        assert vector_store_id == "vs_evaluation"

    async def retrieve(self, file_id: str, *, vector_store_id: str) -> object:
        self.calls.append(("inspect", file_id))
        assert vector_store_id == "vs_evaluation"
        return SimpleNamespace(status="completed")

    async def delete(self, file_id: str, *, vector_store_id: str) -> None:
        self.calls.append(("detach", file_id))
        assert vector_store_id == "vs_evaluation"


class _VectorStores:
    def __init__(self, results: tuple[_SearchResult, ...], calls: list[tuple[str, str]]) -> None:
        self._results = results
        self.files = _VectorStoreFiles(calls)
        self.calls = calls

    async def search(self, vector_store_id: str, **kwargs: Any) -> object:
        self.calls.append(("search", vector_store_id))
        assert kwargs["rewrite_query"] is False
        return SimpleNamespace(data=self._results)

    async def delete(self, vector_store_id: str) -> None:
        self.calls.append(("delete_store", vector_store_id))


class _Files:
    def __init__(self, calls: list[tuple[str, str]]) -> None:
        self.calls = calls
        self._index = 0

    async def create(self, **kwargs: Any) -> object:
        self._index += 1
        self.calls.append(("upload", str(self._index)))
        assert kwargs["purpose"] == "user_data"
        assert kwargs["expires_after"]["days"] == 7
        return SimpleNamespace(id=f"file_{self._index}")

    async def delete(self, file_id: str) -> None:
        self.calls.append(("delete_file", file_id))


class _Client:
    def __init__(self, results: tuple[_SearchResult, ...] = ()) -> None:
        self.calls: list[tuple[str, str]] = []
        self.vector_stores = _VectorStores(results, self.calls)
        self.files = _Files(self.calls)
        self.closed = False

    async def close(self) -> None:
        self.closed = True


def _query(*, allowed: tuple[str, ...] = ()) -> RetrievalQuery:
    return RetrievalQuery(
        intent=CanonicalIntent.WAITLIST_EXPLANATION,
        topic=Topic.WAITLIST,
        locale=Locale.ENGLISH,
        allowed_source_ids=allowed,
    )


async def test_file_search_maps_only_verified_allowlisted_results_to_evidence_chunks() -> None:
    corpus = load_promoted_corpus()
    client = _Client(
        (
            _SearchResult(
                score=0.92,
                attributes={
                    "source_id": "digilicense-prototype-behavior-v1",
                    "section_id": "prototype-waitlist-offers-v1",
                },
                content=(_Content("The waitlist is a simulated prototype workflow."),),
            ),
            _SearchResult(
                score=0.99,
                attributes={
                    "source_id": "delhi-driving-licence-guidance-2026",
                    "section_id": "delhi-permanent-licence-timing-v1",
                },
                content=(_Content("This must not cross the intent allowlist."),),
            ),
        )
    )
    retriever = FileSearchRetriever(
        client=cast(FileSearchClient, client),
        corpus=corpus,
        vector_store_id="vs_evaluation",
    )

    evidence = await retriever.retrieve(_query())

    assert len(evidence) == 1
    assert evidence[0].source_id == "digilicense-prototype-behavior-v1"
    assert evidence[0].section_id == "prototype-waitlist-offers-v1"
    assert evidence[0].model_dump().keys() == {
        "source_id",
        "section_id",
        "title",
        "url",
        "text",
        "score",
    }
    await retriever.close()
    assert client.closed


async def test_file_search_rejects_bad_metadata_low_scores_and_disallowed_sources() -> None:
    client = _Client(
        (
            _SearchResult(
                0.99,
                {"source_id": "unknown", "section_id": "unknown"},
                (_Content("x"),),
            ),
            _SearchResult(
                0.01,
                {
                    "source_id": "digilicense-prototype-behavior-v1",
                    "section_id": "prototype-waitlist-offers-v1",
                },
                (_Content("low relevance"),),
            ),
        )
    )
    retriever = FileSearchRetriever(
        client=cast(FileSearchClient, client),
        corpus=load_promoted_corpus(),
        vector_store_id="vs_evaluation",
    )

    assert await retriever.retrieve(_query()) == ()
    assert await retriever.retrieve(_query(allowed=("unknown",))) == ()


async def test_file_search_lifecycle_sets_expiry_inspects_and_deletes_all_resources() -> None:
    corpus = load_promoted_corpus()
    client = _Client()
    uploaded = await upload_promoted_sections(
        cast(FileSearchLifecycleClient, client),
        corpus=corpus,
        vector_store_id="vs_evaluation",
        expires_after_days=7,
    )

    assert len(uploaded) == sum(len(source.sections) for source in corpus.manifest.sources)
    assert await inspect_uploaded_sections(
        cast(FileSearchLifecycleClient, client),
        vector_store_id="vs_evaluation",
        uploaded=uploaded,
    ) == tuple(item.file_id for item in uploaded)
    await delete_evaluation_corpus(
        cast(FileSearchLifecycleClient, client),
        vector_store_id="vs_evaluation",
        uploaded=uploaded,
        delete_vector_store=True,
    )

    for item in uploaded:
        detach_index = client.calls.index(("detach", item.file_id))
        delete_index = client.calls.index(("delete_file", item.file_id))
        assert detach_index < delete_index
    assert client.calls[-1] == ("delete_store", "vs_evaluation")


@pytest.mark.parametrize("vector_store_id", ("", "store_wrong"))
async def test_file_search_lifecycle_requires_explicit_vector_store(vector_store_id: str) -> None:
    with pytest.raises(ValueError, match="vector store"):
        await delete_evaluation_corpus(
            cast(FileSearchLifecycleClient, _Client()),
            vector_store_id=vector_store_id,
            uploaded=(UploadedSection("source", "section", "file_1"),),
            delete_vector_store=False,
        )
