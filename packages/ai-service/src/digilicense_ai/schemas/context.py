"""Semantic-context contracts without raw conversation text."""

from pydantic import Field, model_validator

from digilicense_ai.schemas.base import ContractModel
from digilicense_ai.schemas.enums import CanonicalIntent, Locale, Topic


class ContextSeed(ContractModel):
    last_intent: CanonicalIntent
    topic: Topic
    locale: Locale


class SemanticContext(ContextSeed):
    issued_at: int = Field(alias="iat", ge=0)
    expires_at: int = Field(alias="exp", ge=0)
    version: int = Field(default=1, ge=1)
    key_id: str = Field(alias="keyId", min_length=1, max_length=64)

    @model_validator(mode="after")
    def expiry_follows_issue(self) -> "SemanticContext":
        if self.expires_at <= self.issued_at:
            raise ValueError("semantic context must expire after it is issued")
        return self
