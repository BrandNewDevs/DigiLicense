from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, cast

import pytest

from digilicense_ai.corpus import load_promoted_corpus
from digilicense_ai.retrieval.file_search import FileSearchClient, FileSearchRetriever
from digilicense_ai.retrieval.lifecycle import (
    EvaluationResourceManifest,
    FileSearchCleanupError,
    FileSearchLifecycleClient,
    UploadedSection,
    delete_evaluation_corpus,
    inspect_uploaded_sections,
    require_matching_vector_store,
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
    def __init__(
        self,
        calls: list[tuple[str, str]],
        *,
        detach_failures: set[str],
        detach_missing: set[str],
    ) -> None:
        self.calls = calls
        self._detach_failures = detach_failures
        self._detach_missing = detach_missing

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
        if file_id in self._detach_failures:
            raise _CleanupFailure()
        if file_id in self._detach_missing:
            raise _NotFound()


class _VectorStores:
    def __init__(
        self,
        results: tuple[_SearchResult, ...],
        calls: list[tuple[str, str]],
        *,
        detach_failures: set[str],
        detach_missing: set[str],
        delete_store_failure: bool,
    ) -> None:
        self._results = results
        self.files = _VectorStoreFiles(
            calls,
            detach_failures=detach_failures,
            detach_missing=detach_missing,
        )
        self.calls = calls
        self._delete_store_failure = delete_store_failure

    async def search(self, vector_store_id: str, **kwargs: Any) -> object:
        self.calls.append(("search", vector_store_id))
        assert kwargs["rewrite_query"] is False
        return SimpleNamespace(data=self._results)

    async def delete(self, vector_store_id: str) -> None:
        self.calls.append(("delete_store", vector_store_id))
        if self._delete_store_failure:
            raise _CleanupFailure()


class _Files:
    def __init__(
        self,
        calls: list[tuple[str, str]],
        *,
        delete_failures: set[str],
        delete_missing: set[str],
    ) -> None:
        self.calls = calls
        self._index = 0
        self._delete_failures = delete_failures
        self._delete_missing = delete_missing

    async def create(self, **kwargs: Any) -> object:
        self._index += 1
        self.calls.append(("upload", str(self._index)))
        assert kwargs["purpose"] == "user_data"
        assert kwargs["expires_after"]["days"] == 7
        return SimpleNamespace(id=f"file_{self._index}")

    async def delete(self, file_id: str) -> None:
        self.calls.append(("delete_file", file_id))
        if file_id in self._delete_failures:
            raise _CleanupFailure()
        if file_id in self._delete_missing:
            raise _NotFound()


class _Client:
    def __init__(
        self,
        results: tuple[_SearchResult, ...] = (),
        *,
        detach_failures: set[str] | None = None,
        detach_missing: set[str] | None = None,
        delete_failures: set[str] | None = None,
        delete_missing: set[str] | None = None,
        delete_store_failure: bool = False,
    ) -> None:
        self.calls: list[tuple[str, str]] = []
        self.vector_stores = _VectorStores(
            results,
            self.calls,
            detach_failures=detach_failures or set(),
            detach_missing=detach_missing or set(),
            delete_store_failure=delete_store_failure,
        )
        self.files = _Files(
            self.calls,
            delete_failures=delete_failures or set(),
            delete_missing=delete_missing or set(),
        )
        self.closed = False

    async def close(self) -> None:
        self.closed = True


class _CleanupFailure(RuntimeError):
    pass


class _NotFound(RuntimeError):
    status_code = 404


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
    assert evidence[0].text == corpus.section_by_id["prototype-waitlist-offers-v1"][1]
    assert "simulated prototype workflow." not in evidence[0].text
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


def test_resource_manifest_must_match_the_configured_vector_store() -> None:
    manifest = EvaluationResourceManifest(
        vector_store_id="vs_original",
        uploaded=(UploadedSection("source", "section", "file_1"),),
    )

    with pytest.raises(ValueError, match="different vector store"):
        require_matching_vector_store(manifest, "vs_reconfigured")


async def test_cleanup_continues_after_failures_and_reports_sanitized_operations() -> None:
    client = _Client(detach_failures={"file_1"})
    uploaded = (
        UploadedSection("source-a", "section-a", "file_1"),
        UploadedSection("source-b", "section-b", "file_2"),
    )

    with pytest.raises(FileSearchCleanupError) as captured:
        await delete_evaluation_corpus(
            cast(FileSearchLifecycleClient, client),
            vector_store_id="vs_evaluation",
            uploaded=uploaded,
            delete_vector_store=True,
        )

    assert captured.value.failures == ("detach:file_1",)
    assert ("delete_file", "file_1") not in client.calls
    assert ("delete_file", "file_2") in client.calls
    assert ("delete_store", "vs_evaluation") in client.calls


async def test_cleanup_treats_already_deleted_resources_as_complete() -> None:
    client = _Client(detach_missing={"file_1"}, delete_missing={"file_1"})

    await delete_evaluation_corpus(
        cast(FileSearchLifecycleClient, client),
        vector_store_id="vs_evaluation",
        uploaded=(UploadedSection("source", "section", "file_1"),),
        delete_vector_store=False,
    )

    assert ("detach", "file_1") in client.calls
    assert ("delete_file", "file_1") in client.calls


@pytest.mark.parametrize("vector_store_id", ("", "store_wrong"))
async def test_file_search_lifecycle_requires_explicit_vector_store(vector_store_id: str) -> None:
    with pytest.raises(ValueError, match="vector store"):
        await delete_evaluation_corpus(
            cast(FileSearchLifecycleClient, _Client()),
            vector_store_id=vector_store_id,
            uploaded=(UploadedSection("source", "section", "file_1"),),
            delete_vector_store=False,
        )
