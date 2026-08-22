"""Canonical local intent-routing contracts."""

from pydantic import Field

from digilicense_ai.schemas.base import ContractModel
from digilicense_ai.schemas.enums import CanonicalIntent, Topic


class IntentResult(ContractModel):
    intent: CanonicalIntent
    topic: Topic
    confidence: float = Field(ge=0, le=1)
