import asyncio
import json
from dataclasses import dataclass
from typing import Any, cast

import pytest

from digilicense_ai.components import DlpGateway
from digilicense_ai.fakes import FakeDlpGateway
from digilicense_ai.providers import GeminiProvider, ProviderFailure, ProviderFailureReason
from digilicense_ai.providers.gemini import GeminiClient
from digilicense_ai.schemas import (
    AssistantMessageRequest,
    CanonicalIntent,
    CanonicalProviderRequest,
    DlpAction,
    DlpResult,
    DlpScope,
    EvidenceChunk,
    Locale,
    Page,
    ReasonCode,
    Service,
    Topic,
)

_MODEL = "gemini-2.5-flash-lite"
_SOURCE_ID = "reviewed-public-source"


@dataclass
class FakeResponse:
    text: str


class RecordingModels:
    def __init__(self, *, response: FakeResponse | None = None, delay_seconds: float = 0) -> None:
        self.response = response or _valid_response()
        self.delay_seconds = delay_seconds
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, **kwargs: Any) -> FakeResponse:
        self.calls.append(kwargs)
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        return self.response


class RecordingAio:
    def __init__(self, models: RecordingModels) -> None:
        self.models = models
        self.closed = False

    def aclose(self) -> None:
        self.closed = True


class RecordingClient:
    def __init__(self, models: RecordingModels) -> None:
        self.aio = RecordingAio(models)


class BlockingDlpGateway:
    async def analyze(self, text: str, *, scope: DlpScope = DlpScope.INBOUND) -> DlpResult:
        del text
        return DlpResult(
            action=DlpAction.FAIL_CLOSED,
            scope=scope,
            entity_types=(),
            safe_routing_text="",
            provider_allowed=False,
        )


def _valid_response() -> FakeResponse:
    return FakeResponse(
        text=json.dumps(
            {
                "answer": "Use the reviewed public appointment guidance.",
                "sourceIds": [_SOURCE_ID],
                "uncertain": False,
            }
        )
    )


def _request() -> CanonicalProviderRequest:
    return CanonicalProviderRequest(
        intent=CanonicalIntent.NO_APPOINTMENT_EXPLANATION,
        topic=Topic.WAITLIST,
        service=Service.PERMANENT_DRIVING_LICENCE,
        page=Page.APPOINTMENT_WAITLIST,
        reason_code=ReasonCode.NO_MATCHING_SLOT,
        locale=Locale.ENGLISH,
        evidence=(
            EvidenceChunk(
                source_id=_SOURCE_ID,
                section_id="appointments",
                title="Reviewed public appointment guidance",
                url="https://example.invalid/reviewed-guidance",
                text="No matching appointment may currently be available.",
                score=1,
            ),
        ),
        prompt_version="phase5-gemini-smoke-v1",
        corpus_version="reviewed-fixture-v1",
    )


def _provider(
    models: RecordingModels,
    *,
    dlp: DlpGateway | None = None,
    timeout: float = 1,
) -> tuple[GeminiProvider, RecordingClient]:
    client = RecordingClient(models)
    return (
        GeminiProvider(
            client=cast(GeminiClient, client),
            model_id=_MODEL,
            max_output_tokens=500,
            request_timeout_seconds=timeout,
            payload_dlp=dlp or FakeDlpGateway(),
        ),
        client,
    )


async def test_development_adapter_sends_only_canonical_structured_content() -> None:
    models = RecordingModels()
    provider, _ = _provider(models)

    result = await provider.generate(_request())

    assert result.source_ids == (_SOURCE_ID,)
    call = models.calls[0]
    payload = json.loads(call["contents"])
    assert "question" not in payload
    assert call["model"] == _MODEL
    assert call["config"]["response_mime_type"] == "application/json"
    assert call["config"]["response_schema"].__name__ == "ProviderResult"
    assert call["config"]["max_output_tokens"] == 500
    assert call["config"]["tools"] == []


async def test_gemini_dlp_block_prevents_transmission() -> None:
    models = RecordingModels()
    provider, _ = _provider(models, dlp=BlockingDlpGateway())

    with pytest.raises(ProviderFailure) as captured:
        await provider.generate(_request())

    assert captured.value.reason is ProviderFailureReason.UNSAFE_PAYLOAD
    assert models.calls == []


async def test_gemini_invalid_output_timeout_and_type_fail_closed() -> None:
    invalid, _ = _provider(RecordingModels(response=FakeResponse(text="not-json")))
    delayed, _ = _provider(RecordingModels(delay_seconds=0.05), timeout=0.01)

    with pytest.raises(ProviderFailure) as invalid_failure:
        await invalid.generate(_request())
    with pytest.raises(ProviderFailure) as timeout_failure:
        await delayed.generate(_request())
    with pytest.raises(TypeError, match="CanonicalProviderRequest"):
        await invalid.generate(
            cast(
                Any,
                AssistantMessageRequest(
                    question="raw-question-sentinel",
                    locale=Locale.ENGLISH,
                    service=Service.PERMANENT_DRIVING_LICENCE,
                    page=Page.APPOINTMENT_WAITLIST,
                    reason_code=ReasonCode.NO_MATCHING_SLOT,
                ),
            )
        )

    assert invalid_failure.value.reason is ProviderFailureReason.INVALID_OUTPUT
    assert timeout_failure.value.reason is ProviderFailureReason.TIMEOUT


async def test_gemini_provider_closes_its_development_client() -> None:
    provider, client = _provider(RecordingModels())

    await provider.close()

    assert client.aio.closed is True
