"""Strict schema for the reviewed, release-time corpus manifest."""

from datetime import date
from enum import StrEnum

from pydantic import AnyHttpUrl, Field, model_validator

from digilicense_ai.schemas.base import ContractModel
from digilicense_ai.schemas.enums import CanonicalIntent


class SourceKind(StrEnum):
    PUBLIC_POLICY = "public_policy"
    PROTOTYPE_BEHAVIOR = "prototype_behavior"


class ReviewStatus(StrEnum):
    DRAFT = "draft"
    REVIEWED = "reviewed"
    PROMOTED = "promoted"


class CorpusSection(ContractModel):
    section_id: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9-]+$")
    heading: str = Field(min_length=1, max_length=160)
    claim_kind: SourceKind
    text: str = Field(min_length=1, max_length=2500)


class FactPacket(ContractModel):
    fact_id: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9-]+$")
    source_id: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9-]+$")
    section_id: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9-]+$")
    claim_kind: SourceKind
    label: str = Field(min_length=1, max_length=200)
    value: str = Field(min_length=1, max_length=100)
    unit: str = Field(min_length=1, max_length=40)
    intents: tuple[CanonicalIntent, ...] = Field(min_length=1, max_length=10)


class CorpusSource(ContractModel):
    source_id: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9-]+$")
    markdown_file: str = Field(
        min_length=4,
        max_length=160,
        pattern=r"^[a-z0-9-]+\.md$",
    )
    title: str = Field(min_length=1, max_length=200)
    publisher: str = Field(min_length=1, max_length=200)
    jurisdiction: str = Field(min_length=1, max_length=100)
    public_url: AnyHttpUrl
    publication_date: date | None = None
    retrieved_date: date
    sha256: str = Field(min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$")
    reviewer: str = Field(min_length=1, max_length=100)
    review_status: ReviewStatus
    corpus_version: str = Field(min_length=1, max_length=64)
    kind: SourceKind
    sections: tuple[CorpusSection, ...] = Field(min_length=1, max_length=30)
    allowed_intents: tuple[CanonicalIntent, ...] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_section_kinds(self) -> "CorpusSource":
        if self.retrieved_date > date.today():
            raise ValueError("retrieved date cannot be in the future")
        if self.publication_date is not None and self.publication_date > self.retrieved_date:
            raise ValueError("publication date cannot be after retrieved date")
        if any(section.claim_kind is not self.kind for section in self.sections):
            raise ValueError("a source cannot mix policy and prototype claims")
        return self


class CorpusManifest(ContractModel):
    corpus_version: str = Field(min_length=1, max_length=64)
    sources: tuple[CorpusSource, ...] = Field(min_length=1, max_length=50)
    fact_packets: tuple[FactPacket, ...] = Field(default=(), max_length=100)
    citation_url_allowlist: tuple[AnyHttpUrl, ...] = Field(min_length=1, max_length=50)
