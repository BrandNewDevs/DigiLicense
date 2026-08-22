"""Explicit File Search evaluation-corpus upload, inspection, expiry, and deletion controls."""

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
    for item in uploaded:
        await client.vector_stores.files.delete(item.file_id, vector_store_id=vector_store_id)
        await client.files.delete(item.file_id)
    if delete_vector_store:
        await client.vector_stores.delete(vector_store_id)
