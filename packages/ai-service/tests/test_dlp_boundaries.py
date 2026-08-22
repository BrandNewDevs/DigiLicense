import logging

import pytest
from httpx import ASGITransport, AsyncClient

from digilicense_ai.app import create_app
from digilicense_ai.config import EnvironmentProfile, Settings
from digilicense_ai.container import ServiceContainer
from digilicense_ai.dlp import LocalDlpGateway
from digilicense_ai.fakes import (
    FakeIntentRouter,
    FakeRetriever,
    FakeSemanticContextManager,
)
from digilicense_ai.schemas import (
    AssistantMessageRequest,
    BlockedReason,
    CanonicalProviderRequest,
    EvidenceChunk,
    Locale,
    Page,
    ProviderResult,
    ReasonCode,
    RetrievalQuery,
    Service,
)
from digilicense_ai.service import AssistantService


class RecordingProvider:
    def __init__(self, answer: str = "Safe deterministic answer.") -> None:
        self.answer = answer
        self.call_count = 0

    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult:
        self.call_count += 1
        return ProviderResult(
            answer=self.answer,
            source_ids=tuple(item.source_id for item in request.evidence),
            uncertain=False,
        )


class PiiEvidenceRetriever:
    async def retrieve(self, query: RetrievalQuery) -> tuple[EvidenceChunk, ...]:
        del query
        return (
            EvidenceChunk(
                source_id="synthetic-pii-fixture",
                section_id="test-only",
                title="Synthetic test fixture",
                url="https://example.invalid/test-only",
                text="Contact synthetic.user@example.org for this test.",
                score=1.0,
            ),
        )


class ExplodingProvider:
    def __init__(self, sentinel: str) -> None:
        self._sentinel = sentinel

    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult:
        del request
        raise RuntimeError(self._sentinel)


def _request(question: str = "Why is appointment booking unavailable?") -> AssistantMessageRequest:
    return AssistantMessageRequest(
        question=question,
        locale=Locale.ENGLISH,
        service=Service.PERMANENT_DRIVING_LICENCE,
        page=Page.APPOINTMENT_WAITLIST,
        reason_code=ReasonCode.NO_MATCHING_SLOT,
    )


def _container(
    dlp: LocalDlpGateway,
    provider: RecordingProvider | ExplodingProvider,
    *,
    pii_evidence: bool = False,
) -> ServiceContainer:
    return ServiceContainer(
        settings=Settings(profile=EnvironmentProfile.TEST),
        dlp=dlp,
        context=FakeSemanticContextManager(),
        intent=FakeIntentRouter(),
        retriever=PiiEvidenceRetriever() if pii_evidence else FakeRetriever(),
        provider=provider,
    )


async def test_inbound_pii_returns_local_help_without_provider_call(
    local_dlp_gateway: LocalDlpGateway,
) -> None:
    provider = RecordingProvider()
    service = AssistantService(_container(local_dlp_gateway, provider))

    response = await service.answer(
        _request("My mobile is 98765 43210. Why is appointment booking unavailable?")
    )

    assert provider.call_count == 0
    assert response.blocked_reason is BlockedReason.PII_DETECTED
    assert response.fallback_used is True
    assert "98765" not in response.answer


async def test_provider_payload_pii_is_blocked_before_provider_call(
    local_dlp_gateway: LocalDlpGateway,
) -> None:
    provider = RecordingProvider()
    service = AssistantService(_container(local_dlp_gateway, provider, pii_evidence=True))

    response = await service.answer(_request())

    assert provider.call_count == 0
    assert response.blocked_reason is BlockedReason.INVALID_OUTPUT
    assert response.sources == ()


async def test_outbound_pii_is_replaced_with_safe_response(
    local_dlp_gateway: LocalDlpGateway,
) -> None:
    provider = RecordingProvider("Contact synthetic.user@example.org for details.")
    service = AssistantService(_container(local_dlp_gateway, provider))

    response = await service.answer(_request())

    assert provider.call_count == 1
    assert response.blocked_reason is BlockedReason.INVALID_OUTPUT
    assert "synthetic.user" not in response.answer
    assert response.sources == ()


async def test_provider_exception_never_logs_exception_message(
    local_dlp_gateway: LocalDlpGateway,
    caplog: pytest.LogCaptureFixture,
) -> None:
    sentinel = "provider-error-containing-raw-sensitive-sentinel"
    app = create_app(
        settings=Settings(profile=EnvironmentProfile.TEST),
        container=_container(local_dlp_gateway, ExplodingProvider(sentinel)),
    )
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    logging.getLogger().setLevel(logging.INFO)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/assistant/messages",
            json=_request().public_dump(),
        )

    assert response.status_code == 500
    assert response.json() == {"detail": "internal service error"}
    assert sentinel not in caplog.text
