from typing import Any, cast

import pytest
from pydantic import ValidationError

from digilicense_ai.fakes import FakeProvider
from digilicense_ai.schemas import (
    AssistantMessageRequest,
    CanonicalIntent,
    CanonicalProviderRequest,
    EvidenceChunk,
    Locale,
    Page,
    ReasonCode,
    Service,
    Topic,
)


def test_canonical_provider_request_has_no_raw_question_field() -> None:
    fields = CanonicalProviderRequest.model_fields

    assert "question" not in fields
    assert "context_token" not in fields
    assert "user_id" not in fields


async def test_provider_rejects_raw_request_type() -> None:
    raw_request = AssistantMessageRequest(
        question="raw sentinel question",
        locale=Locale.ENGLISH,
        service=Service.LEARNER_LICENCE,
        page=Page.ASSISTANT,
        reason_code=ReasonCode.NONE,
    )

    with pytest.raises(TypeError, match="CanonicalProviderRequest"):
        await FakeProvider().generate(cast(Any, raw_request))


def test_canonical_provider_request_rejects_unknown_fields() -> None:
    evidence = EvidenceChunk(
        source_id="fixture",
        section_id="fixture",
        title="Fixture",
        url="https://example.invalid/fixture",
        text="Public fixture evidence.",
        score=1,
    )
    with pytest.raises(ValidationError):
        CanonicalProviderRequest.model_validate(
            {
                "intent": CanonicalIntent.CURRENT_STEP_EXPLANATION,
                "topic": Topic.LEARNER_LICENCE_APPLICATION,
                "service": Service.LEARNER_LICENCE,
                "page": Page.ASSISTANT,
                "reasonCode": ReasonCode.NONE,
                "locale": Locale.ENGLISH,
                "evidence": [evidence.public_dump()],
                "promptVersion": "test",
                "corpusVersion": "test",
                "question": "must be rejected",
            }
        )
