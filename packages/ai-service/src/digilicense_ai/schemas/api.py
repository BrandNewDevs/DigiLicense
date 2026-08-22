"""Public HTTP request and response contracts."""

from typing import Annotated

from pydantic import AnyHttpUrl, Field, field_validator

from digilicense_ai.schemas.base import ContractModel
from digilicense_ai.schemas.enums import (
    BlockedReason,
    CanonicalIntent,
    EscalationCode,
    Locale,
    Page,
    ReasonCode,
    Service,
)


class AssistantMessageRequest(ContractModel):
    question: Annotated[str, Field(min_length=1, max_length=500)]
    locale: Locale
    service: Service
    page: Page
    reason_code: ReasonCode
    context_token: Annotated[str | None, Field(max_length=1024)] = None

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        """
        Validate that the question is not empty.
        
        Parameters:
            value (str): The question value to validate.
        
        Returns:
            str: The original question value.
        
        Raises:
            ValueError: If the question is empty.
        """
        if not value:
            raise ValueError("question must not be blank")
        return value


class SourceReference(ContractModel):
    id: Annotated[str, Field(min_length=1, max_length=128)]
    title: Annotated[str, Field(min_length=1, max_length=200)]
    url: AnyHttpUrl


class Escalation(ContractModel):
    code: EscalationCode
    message: Annotated[str, Field(min_length=1, max_length=300)]


class AssistantMessageResponse(ContractModel):
    answer: Annotated[str, Field(min_length=1, max_length=1200)]
    intent: CanonicalIntent
    sources: tuple[SourceReference, ...] = Field(max_length=3)
    uncertain: bool
    escalation: Escalation | None = None
    fallback_used: bool = False
    blocked_reason: BlockedReason | None = None
    context_token: Annotated[str | None, Field(max_length=1024)] = None


class HealthResponse(ContractModel):
    status: str
    service: str
    profile: str
    components: dict[str, str] = Field(default_factory=dict)
