import asyncio
import json
from dataclasses import dataclass
from typing import Any, cast
from unittest.mock import AsyncMock

import httpx
import pytest
from openai import APIConnectionError, AsyncOpenAI, RateLimitError

from digilicense_ai.components import DlpGateway
from digilicense_ai.config import EnvironmentProfile, ProviderBackend, Settings
from digilicense_ai.fakes import FakeDlpGateway
from digilicense_ai.providers import OpenAIProvider, ProviderFailure, ProviderFailureReason
from digilicense_ai.providers import openai as openai_module
from digilicense_ai.providers.circuit import ProviderCircuitBreaker
from digilicense_ai.providers.openai import OpenAIClient
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
from digilicense_ai.schemas.dlp import DlpAction, DlpResult, DlpScope

_MODEL = "gpt-5.4-mini-2026-03-17"
_SOURCE_ID = "reviewed-public-source"


@dataclass
class FakeUsage:
    input_tokens: int = 100
    output_tokens: int = 40


@dataclass
class FakeResponse:
    output_text: str
    model: str = _MODEL
    status: str = "completed"
    usage: FakeUsage | None = None


class RecordingResponses:
    def __init__(
        self,
        response: FakeResponse | None = None,
        *,
        error: Exception | None = None,
        delay_seconds: float = 0,
    ) -> None:
        self.response = response or _valid_response()
        self.error = error
        self.delay_seconds = delay_seconds
        self.calls: list[dict[str, Any]] = []
        self.active = 0
        self.max_active = 0
        self.call_started = asyncio.Event()

    async def create(self, **kwargs: Any) -> FakeResponse:
        self.calls.append(kwargs)
        self.call_started.set()
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            if self.delay_seconds:
                await asyncio.sleep(self.delay_seconds)
            if self.error is not None:
                raise self.error
            return self.response
        finally:
            self.active -= 1


class RecordingClient:
    def __init__(self, responses: RecordingResponses) -> None:
        self.responses = responses
        self.closed = False

    async def close(self) -> None:
        self.closed = True


class BlockingDlpGateway:
    def __init__(self) -> None:
        self.scanned: list[tuple[str, DlpScope]] = []

    async def analyze(self, text: str, *, scope: DlpScope = DlpScope.INBOUND) -> DlpResult:
        self.scanned.append((text, scope))
        return DlpResult(
            action=DlpAction.FAIL_CLOSED,
            scope=scope,
            entity_types=(),
            safe_routing_text="",
            provider_allowed=False,
        )


def _valid_response(
    *,
    source_ids: list[str] | None = None,
    answer: str = "Use the reviewed public appointment guidance.",
) -> FakeResponse:
    return FakeResponse(
        output_text=json.dumps(
            {
                "answer": answer,
                "sourceIds": source_ids or [_SOURCE_ID],
                "uncertain": False,
            }
        ),
        usage=FakeUsage(),
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
        prompt_version="phase3-openai-v1",
        corpus_version="reviewed-fixture-v1",
    )


def _provider(
    responses: RecordingResponses,
    *,
    timeout: float = 1,
    concurrency: int = 2,
    dlp: DlpGateway | None = None,
    circuit_breaker: ProviderCircuitBreaker | None = None,
) -> OpenAIProvider:
    return OpenAIProvider(
        client=cast(OpenAIClient, RecordingClient(responses)),
        model_id=_MODEL,
        max_output_tokens=500,
        request_timeout_seconds=timeout,
        max_concurrency=concurrency,
        payload_dlp=dlp or FakeDlpGateway(),
        circuit_breaker=circuit_breaker
        or ProviderCircuitBreaker(failure_threshold=3, reset_seconds=30),
    )


async def test_responses_request_is_strict_bounded_and_non_stored() -> None:
    responses = RecordingResponses()

    result = await _provider(responses).generate(_request())

    assert result.source_ids == (_SOURCE_ID,)
    call = responses.calls[0]
    assert call["model"] == _MODEL
    assert call["store"] is False
    assert call["max_output_tokens"] == 500
    assert call["background"] is False
    assert call["reasoning"] == {"effort": "none"}
    assert call["tools"] == []
    assert call["parallel_tool_calls"] is False
    assert call["text"]["format"]["type"] == "json_schema"
    assert call["text"]["format"]["strict"] is True
    assert call["text"]["format"]["schema"]["additionalProperties"] is False
    for prohibited in ("conversation", "previous_response_id", "user", "safety_identifier"):
        assert prohibited not in call


async def test_provider_payload_contains_only_canonical_public_content() -> None:
    responses = RecordingResponses()
    raw_sentinel = "raw-question-sentinel-must-never-appear"

    await _provider(responses).generate(_request())

    provider_input = responses.calls[0]["input"]
    payload = json.loads(provider_input)
    assert "question" not in payload
    assert "contextToken" not in payload
    assert raw_sentinel not in provider_input
    assert payload["intent"] == "NO_APPOINTMENT_EXPLANATION"
    assert payload["evidence"][0]["sourceId"] == _SOURCE_ID


async def test_provider_rejects_raw_request_runtime_type() -> None:
    raw_request = AssistantMessageRequest(
        question="raw-question-sentinel",
        locale=Locale.ENGLISH,
        service=Service.PERMANENT_DRIVING_LICENCE,
        page=Page.APPOINTMENT_WAITLIST,
        reason_code=ReasonCode.NO_MATCHING_SLOT,
    )
    responses = RecordingResponses()

    with pytest.raises(TypeError, match="CanonicalProviderRequest"):
        await _provider(responses).generate(cast(Any, raw_request))

    assert responses.calls == []


async def test_adapter_scans_payload_and_never_transmits_when_dlp_blocks() -> None:
    responses = RecordingResponses()
    dlp = BlockingDlpGateway()

    with pytest.raises(ProviderFailure) as captured:
        await _provider(responses, dlp=dlp).generate(_request())

    assert captured.value.reason is ProviderFailureReason.UNSAFE_PAYLOAD
    assert responses.calls == []
    assert dlp.scanned[0][1] is DlpScope.PROVIDER_PAYLOAD
    assert "question" not in dlp.scanned[0][0]


@pytest.mark.parametrize(
    "response",
    [
        FakeResponse(output_text="not-json"),
        FakeResponse(output_text="", status="completed"),
        FakeResponse(output_text=_valid_response().output_text, status="incomplete"),
        _valid_response(source_ids=["unreviewed-source"]),
        _valid_response(source_ids=[_SOURCE_ID, _SOURCE_ID]),
    ],
)
async def test_invalid_or_ungrounded_output_fails_closed(response: FakeResponse) -> None:
    with pytest.raises(ProviderFailure) as captured:
        await _provider(RecordingResponses(response)).generate(_request())

    assert captured.value.reason is ProviderFailureReason.INVALID_OUTPUT


async def test_request_timeout_is_sanitized() -> None:
    with pytest.raises(ProviderFailure) as captured:
        await _provider(
            RecordingResponses(delay_seconds=0.05),
            timeout=0.01,
        ).generate(_request())

    assert captured.value.reason is ProviderFailureReason.TIMEOUT


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (
            RateLimitError(
                "sensitive upstream rate-limit details",
                response=httpx.Response(
                    429, request=httpx.Request("POST", "https://api.openai.com")
                ),
                body=None,
            ),
            ProviderFailureReason.RATE_LIMITED,
        ),
        (
            APIConnectionError(
                message="sensitive upstream network details",
                request=httpx.Request("POST", "https://api.openai.com"),
            ),
            ProviderFailureReason.NETWORK,
        ),
    ],
)
async def test_sdk_failures_become_fixed_safe_reasons(
    error: Exception,
    reason: ProviderFailureReason,
) -> None:
    with pytest.raises(ProviderFailure) as captured:
        await _provider(RecordingResponses(error=error)).generate(_request())

    assert captured.value.reason is reason
    assert "sensitive upstream" not in str(captured.value)


async def test_upstream_error_content_never_enters_provider_logs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sentinel = "raw-sensitive-upstream-error-sentinel"
    safe_logger = AsyncMock()
    monkeypatch.setattr(openai_module, "logger", safe_logger)

    with pytest.raises(ProviderFailure):
        await _provider(RecordingResponses(error=RuntimeError(sentinel))).generate(_request())

    assert sentinel not in str(safe_logger.method_calls)
    assert safe_logger.awarning.await_args.kwargs["reason"] == "unavailable"
    assert safe_logger.awarning.await_args.kwargs["fallback"] is True


async def test_completion_records_only_bounded_provider_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    safe_logger = AsyncMock()
    monkeypatch.setattr(openai_module, "logger", safe_logger)

    await _provider(RecordingResponses()).generate(_request())

    metadata = safe_logger.ainfo.await_args.kwargs
    assert metadata["model"] == _MODEL
    assert metadata["input_tokens"] == 100
    assert metadata["output_tokens"] == 40
    assert metadata["fallback"] is False
    assert isinstance(metadata["duration_ms"], float)


async def test_concurrency_limit_bounds_chargeable_calls() -> None:
    responses = RecordingResponses(delay_seconds=0.02)
    provider = _provider(responses, concurrency=2)

    await asyncio.gather(*(provider.generate(_request()) for _ in range(6)))

    assert responses.max_active == 2


async def test_circuit_opens_without_an_additional_provider_call() -> None:
    now = 0.0

    def clock() -> float:
        return now

    responses = RecordingResponses(error=RuntimeError("synthetic failure"))
    provider = _provider(
        responses,
        circuit_breaker=ProviderCircuitBreaker(
            failure_threshold=2,
            reset_seconds=10,
            clock=clock,
        ),
    )

    for _ in range(2):
        with pytest.raises(ProviderFailure, match="unavailable"):
            await provider.generate(_request())
    with pytest.raises(ProviderFailure) as captured:
        await provider.generate(_request())

    assert captured.value.reason is ProviderFailureReason.CIRCUIT_OPEN
    assert len(responses.calls) == 2

    now = 11.0
    responses.error = None

    result = await provider.generate(_request())

    assert result.source_ids == (_SOURCE_ID,)
    assert len(responses.calls) == 3


async def test_cancelled_half_open_probe_is_released_for_the_next_request() -> None:
    now = 0.0

    def clock() -> float:
        return now

    responses = RecordingResponses(error=RuntimeError("synthetic failure"))
    provider = _provider(
        responses,
        circuit_breaker=ProviderCircuitBreaker(
            failure_threshold=2,
            reset_seconds=10,
            clock=clock,
        ),
    )
    for _ in range(2):
        with pytest.raises(ProviderFailure, match="unavailable"):
            await provider.generate(_request())

    now = 11.0
    responses.error = None
    responses.delay_seconds = 1
    responses.call_started.clear()
    probe = asyncio.create_task(provider.generate(_request()))
    await responses.call_started.wait()
    probe.cancel()
    with pytest.raises(asyncio.CancelledError):
        await probe

    responses.delay_seconds = 0
    result = await provider.generate(_request())

    assert result.source_ids == (_SOURCE_ID,)
    assert len(responses.calls) == 4


async def test_provider_closes_owned_client() -> None:
    client = RecordingClient(RecordingResponses())
    provider = OpenAIProvider(
        client=cast(OpenAIClient, client),
        model_id=_MODEL,
        max_output_tokens=500,
        request_timeout_seconds=1,
        max_concurrency=1,
        payload_dlp=FakeDlpGateway(),
        circuit_breaker=ProviderCircuitBreaker(failure_threshold=3, reset_seconds=30),
    )

    await provider.close()

    assert client.closed is True


def test_settings_build_dedicated_project_client_without_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    client = RecordingClient(RecordingResponses())

    def fake_client_factory(**kwargs: Any) -> RecordingClient:
        captured.update(kwargs)
        return client

    monkeypatch.setattr(openai_module, "AsyncOpenAI", fake_client_factory)
    settings = Settings(
        profile=EnvironmentProfile.EVALUATION,
        provider_backend=ProviderBackend.OPENAI,
        openai_api_key="sk-synthetic-test-only",
        openai_project_id="proj_synthetic_test",
    )

    provider = OpenAIProvider.from_settings(settings, payload_dlp=FakeDlpGateway())

    assert isinstance(provider, OpenAIProvider)
    assert captured["api_key"] == "sk-synthetic-test-only"
    assert captured["project"] == "proj_synthetic_test"
    assert captured["max_retries"] == 0
    assert isinstance(captured["timeout"], httpx.Timeout)
    assert captured["timeout"].connect == 2
    assert captured["timeout"].read == 8
    assert "sk-synthetic-test-only" not in repr(settings)


async def test_official_sdk_serializes_the_phase3_request_contract() -> None:
    captured: dict[str, Any] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads((await request.aread()).decode())
        return httpx.Response(
            200,
            request=request,
            json={
                "id": "resp_synthetic",
                "object": "response",
                "created_at": 0,
                "status": "completed",
                "model": _MODEL,
                "output": [
                    {
                        "id": "msg_synthetic",
                        "type": "message",
                        "status": "completed",
                        "role": "assistant",
                        "content": [
                            {
                                "type": "output_text",
                                "text": _valid_response().output_text,
                                "annotations": [],
                            }
                        ],
                    }
                ],
                "usage": {
                    "input_tokens": 100,
                    "input_tokens_details": {"cached_tokens": 0},
                    "output_tokens": 40,
                    "output_tokens_details": {"reasoning_tokens": 0},
                    "total_tokens": 140,
                },
            },
        )

    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    sdk = AsyncOpenAI(
        api_key="sk-synthetic-test-only",
        project="proj_synthetic_test",
        base_url="https://api.openai.test/v1",
        http_client=http_client,
        max_retries=0,
    )
    provider = OpenAIProvider(
        client=cast(OpenAIClient, sdk),
        model_id=_MODEL,
        max_output_tokens=500,
        request_timeout_seconds=5,
        max_concurrency=1,
        payload_dlp=FakeDlpGateway(),
        circuit_breaker=ProviderCircuitBreaker(failure_threshold=3, reset_seconds=30),
    )

    result = await provider.generate(_request())
    await provider.close()

    assert result.source_ids == (_SOURCE_ID,)
    assert captured["headers"]["openai-project"] == "proj_synthetic_test"
    assert captured["body"]["model"] == _MODEL
    assert captured["body"]["store"] is False
    assert captured["body"]["background"] is False
    assert captured["body"]["reasoning"] == {"effort": "none"}
    for prohibited in ("conversation", "previous_response_id", "user", "safety_identifier"):
        assert prohibited not in captured["body"]
    assert captured["body"]["text"]["format"]["type"] == "json_schema"
    assert captured["body"]["text"]["format"]["strict"] is True
