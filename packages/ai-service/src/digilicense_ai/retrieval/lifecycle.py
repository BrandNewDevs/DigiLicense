"""Explicit File Search evaluation-corpus upload, inspection, expiry, and deletion controls."""

from collections.abc import Awaitable
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Protocol

from digilicense_ai.corpus import PromotedCorpus


class FileSearchLifecycleClient(Protocol):
    @property
    def files(self) -> Any: ...

    @property
    def vector_stores(self) -> Any: ...

    async def close(self) -> None: ...


@dataclass(frozen=True, slots=True)
class UploadedSection:
    source_id: str
    section_id: str
    file_id: str


@dataclass(frozen=True, slots=True)
class EvaluationResourceManifest:
    """The explicit ownership record for one evaluation corpus upload."""

    vector_store_id: str
    uploaded: tuple[UploadedSection, ...]


class FileSearchCleanupError(RuntimeError):
    """Cleanup completed as far as possible but one or more operations failed."""

    def __init__(self, failures: tuple[str, ...]) -> None:
        self.failures = failures
        super().__init__(f"evaluation cleanup incomplete: {len(failures)} operation(s) failed")


def require_matching_vector_store(
    manifest: EvaluationResourceManifest,
    vector_store_id: str,
) -> None:
    if manifest.vector_store_id != vector_store_id:
        raise ValueError("resource manifest belongs to a different vector store")


async def upload_promoted_sections(
    client: FileSearchLifecycleClient,
    *,
    corpus: PromotedCorpus,
    vector_store_id: str,
    expires_after_days: int,
) -> tuple[UploadedSection, ...]:
    """Upload one checksummed reviewed section per file, with an explicit short expiry."""

    if not vector_store_id.startswith("vs_") or not 1 <= expires_after_days <= 30:
        raise ValueError("an explicit evaluation vector store and 1-30 day expiry are required")
    uploaded: list[UploadedSection] = []
    for source in corpus.manifest.sources:
        for section in source.sections:
            stream = BytesIO(section.text.encode("utf-8"))
            stream.name = f"{section.section_id}.md"
            file = await client.files.create(
                file=stream,
                purpose="user_data",
                expires_after={"anchor": "created_at", "days": expires_after_days},
            )
            await client.vector_stores.files.create(
                vector_store_id,
                file_id=file.id,
                attributes={
                    "source_id": source.source_id,
                    "section_id": section.section_id,
                    "corpus_version": corpus.version,
                },
            )
            uploaded.append(UploadedSection(source.source_id, section.section_id, file.id))
    return tuple(uploaded)


async def inspect_uploaded_sections(
    client: FileSearchLifecycleClient,
    *,
    vector_store_id: str,
    uploaded: tuple[UploadedSection, ...],
) -> tuple[str, ...]:
    """Return only completed resource IDs; never return or log document text."""

    if not vector_store_id.startswith("vs_"):
        raise ValueError("an explicit vector store ID is required")
    completed: list[str] = []
    for item in uploaded:
        resource = await client.vector_stores.files.retrieve(
            item.file_id,
            vector_store_id=vector_store_id,
        )
        if getattr(resource, "status", None) == "completed":
            completed.append(item.file_id)
    return tuple(completed)


async def delete_evaluation_corpus(
    client: FileSearchLifecycleClient,
    *,
    vector_store_id: str,
    uploaded: tuple[UploadedSection, ...],
    delete_vector_store: bool,
) -> None:
    """Delete attachment first, then every uploaded File, then optionally the vector store."""

    if not vector_store_id.startswith("vs_"):
        raise ValueError("an explicit vector store ID is required")
    failures: list[str] = []
    for item in uploaded:
        detached = await _cleanup_operation(
            f"detach:{item.file_id}",
            client.vector_stores.files.delete(item.file_id, vector_store_id=vector_store_id),
            failures,
        )
        if detached:
            await _cleanup_operation(
                f"delete_file:{item.file_id}",
                client.files.delete(item.file_id),
                failures,
            )
    if delete_vector_store:
        await _cleanup_operation(
            "delete_vector_store",
            client.vector_stores.delete(vector_store_id),
            failures,
        )
    if failures:
        raise FileSearchCleanupError(tuple(failures))


async def _cleanup_operation(
    operation_name: str,
    operation: Awaitable[object],
    failures: list[str],
) -> bool:
    try:
        await operation
    except Exception as error:
        if _is_not_found(error):
            return True
        failures.append(operation_name)
        return False
    return True


def _is_not_found(error: Exception) -> bool:
    status_code = getattr(error, "status_code", None)
    response = getattr(error, "response", None)
    return status_code == 404 or getattr(response, "status_code", None) == 404
