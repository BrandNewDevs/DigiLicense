"""Retriever and evidence contracts."""

from pydantic import AnyHttpUrl, Field

from digilicense_ai.schemas.base import ContractModel
from digilicense_ai.schemas.enums import CanonicalIntent, Locale, Topic


class RetrievalQuery(ContractModel):
    intent: CanonicalIntent
    topic: Topic
    locale: Locale
    allowed_source_ids: tuple[str, ...] = ()


class EvidenceChunk(ContractModel):
    source_id: str = Field(min_length=1, max_length=128)
    section_id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=200)
    url: AnyHttpUrl
    text: str = Field(min_length=1, max_length=4000)
    score: float = Field(ge=0, le=1)
