"""Canonical external-provider contracts."""

from pydantic import Field

from digilicense_ai.schemas.base import ContractModel
from digilicense_ai.schemas.enums import CanonicalIntent, Locale, Page, ReasonCode, Service, Topic
from digilicense_ai.schemas.retrieval import EvidenceChunk


class CanonicalProviderRequest(ContractModel):
    """Provider-safe request that deliberately has no raw-question field."""

    intent: CanonicalIntent
    topic: Topic
    service: Service
    page: Page
    reason_code: ReasonCode
    locale: Locale
    evidence: tuple[EvidenceChunk, ...] = Field(max_length=3)
    facts: tuple["ProviderFact", ...] = Field(default=(), max_length=3)
    prompt_version: str = Field(min_length=1, max_length=64)
    corpus_version: str = Field(min_length=1, max_length=64)


class ProviderResult(ContractModel):
    answer: str = Field(min_length=1, max_length=1200)
    source_ids: tuple[str, ...] = Field(min_length=1, max_length=3)
    fact_ids: tuple[str, ...] = Field(max_length=3)
    uncertain: bool


class ProviderFact(ContractModel):
    """Bounded reviewed fact supplied with the exact evidence section that permits it."""

    fact_id: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9-]+$")
    source_id: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9-]+$")
    section_id: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9-]+$")
    label: str = Field(min_length=1, max_length=200)
    value: str = Field(min_length=1, max_length=100)
    unit: str = Field(min_length=1, max_length=40)
