import asyncio

import pytest

from digilicense_ai.config import EnvironmentProfile, Settings
from digilicense_ai.container import ServiceContainer
from digilicense_ai.corpus import load_promoted_corpus
from digilicense_ai.fakes import (
    FakeDlpGateway,
    FakeIntentRouter,
    FakeProvider,
    FakeRetriever,
    FakeSemanticContextManager,
)
from digilicense_ai.providers import ProviderFailure, ProviderFailureReason
from digilicense_ai.retrieval import Bm25Retriever
from digilicense_ai.schemas import (
    AssistantMessageRequest,
    BlockedReason,
    CanonicalProviderRequest,
    Locale,
    Page,
    ProviderResult,
    ReasonCode,
    RetrievalQuery,
    Service,
)
from digilicense_ai.service import AssistantService


class FailingProvider:
    def __init__(self, reason: ProviderFailureReason) -> None:
        self.reason = reason
        self.calls = 0

    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult:
        del request
        self.calls += 1
        raise ProviderFailure(self.reason)


class EmptyRetriever:
    async def retrieve(self, query: RetrievalQuery) -> tuple[()]:
        del query
        return ()


class ProviderSpy:
    def __init__(self) -> None:
        self.calls = 0

    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult:
        del request
        self.calls += 1
        raise AssertionError("provider must not run without reviewed evidence")


class NeverRetriever:
    async def retrieve(self, query: RetrievalQuery) -> tuple[()]:
        del query
        raise AssertionError("retrieval must not run for unsupported questions")


class FailingRetriever:
    async def retrieve(self, query: RetrievalQuery) -> tuple[()]:
        del query
        raise RuntimeError("synthetic retrieval outage")


class BlockingRetriever:
    async def retrieve(self, query: RetrievalQuery) -> tuple[()]:
        del query
        await asyncio.Event().wait()
        return ()


class CapturingFakeProvider(FakeProvider):
    def __init__(self) -> None:
        self.request: CanonicalProviderRequest | None = None

    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult:
        self.request = request
        return await super().generate(request)


def _service(provider: FailingProvider) -> AssistantService:
    return AssistantService(
        ServiceContainer(
            settings=Settings(profile=EnvironmentProfile.TEST),
            dlp=FakeDlpGateway(),
            context=FakeSemanticContextManager(),
            intent=FakeIntentRouter(),
            retriever=FakeRetriever(),
            provider=provider,
        )
    )


def _request(locale: Locale = Locale.ENGLISH) -> AssistantMessageRequest:
    return AssistantMessageRequest(
        question="Why can I not book my driving test?",
        locale=locale,
        service=Service.PERMANENT_DRIVING_LICENCE,
        page=Page.APPOINTMENT_WAITLIST,
        reason_code=ReasonCode.NO_MATCHING_SLOT,
    )


@pytest.mark.parametrize(
    ("reason", "blocked_reason"),
    [
        (ProviderFailureReason.TIMEOUT, BlockedReason.PROVIDER_UNAVAILABLE),
        (ProviderFailureReason.NETWORK, BlockedReason.PROVIDER_UNAVAILABLE),
        (ProviderFailureReason.UNAVAILABLE, BlockedReason.PROVIDER_UNAVAILABLE),
        (ProviderFailureReason.RATE_LIMITED, BlockedReason.RATE_LIMITED),
        (ProviderFailureReason.INVALID_OUTPUT, BlockedReason.INVALID_OUTPUT),
    ],
)
async def test_every_provider_failure_returns_deterministic_fallback(
    reason: ProviderFailureReason,
    blocked_reason: BlockedReason,
) -> None:
    provider = FailingProvider(reason)

    response = await _service(provider).answer(_request())

    assert provider.calls == 1
    assert response.fallback_used is True
    assert response.uncertain is True
    assert response.sources == ()
    assert response.blocked_reason is blocked_reason
    assert "temporarily unavailable" in response.answer


async def test_hindi_provider_failure_has_hindi_fallback() -> None:
    response = await _service(FailingProvider(ProviderFailureReason.TIMEOUT)).answer(
        _request(Locale.HINDI)
    )

    assert response.fallback_used is True
    assert "उपलब्ध नहीं" in response.answer


async def test_missing_evidence_returns_local_fallback_without_provider_call() -> None:
    provider = ProviderSpy()
    service = AssistantService(
        ServiceContainer(
            settings=Settings(profile=EnvironmentProfile.TEST),
            dlp=FakeDlpGateway(),
            context=FakeSemanticContextManager(),
            intent=FakeIntentRouter(),
            retriever=EmptyRetriever(),
            provider=provider,
        )
    )

    response = await service.answer(_request())

    assert provider.calls == 0
    assert response.blocked_reason is BlockedReason.NO_EVIDENCE
    assert response.fallback_used is True
    assert response.uncertain is True


async def test_unsupported_question_stops_before_retrieval_and_provider() -> None:
    provider = ProviderSpy()
    service = AssistantService(
        ServiceContainer(
            settings=Settings(profile=EnvironmentProfile.TEST),
            dlp=FakeDlpGateway(),
            context=FakeSemanticContextManager(),
            intent=FakeIntentRouter(),
            retriever=NeverRetriever(),
            provider=provider,
        )
    )
    request = _request().model_copy(update={"question": "Tell me my medical diagnosis."})

    response = await service.answer(request)

    assert provider.calls == 0
    assert response.blocked_reason is BlockedReason.UNSUPPORTED


async def test_retrieval_failure_returns_deterministic_fallback_without_provider_call() -> None:
    provider = ProviderSpy()
    service = AssistantService(
        ServiceContainer(
            settings=Settings(profile=EnvironmentProfile.TEST),
            dlp=FakeDlpGateway(),
            context=FakeSemanticContextManager(),
            intent=FakeIntentRouter(),
            retriever=FailingRetriever(),
            provider=provider,
        )
    )

    response = await service.answer(_request())

    assert provider.calls == 0
    assert response.fallback_used is True
    assert response.blocked_reason is BlockedReason.RETRIEVAL_UNAVAILABLE


async def test_retrieval_timeout_returns_deterministic_fallback_without_provider_call() -> None:
    provider = ProviderSpy()
    service = AssistantService(
        ServiceContainer(
            settings=Settings(profile=EnvironmentProfile.TEST, retrieval_timeout_seconds=0.05),
            dlp=FakeDlpGateway(),
            context=FakeSemanticContextManager(),
            intent=FakeIntentRouter(),
            retriever=BlockingRetriever(),
            provider=provider,
        )
    )

    response = await service.answer(_request())

    assert provider.calls == 0
    assert response.fallback_used is True
    assert response.blocked_reason is BlockedReason.RETRIEVAL_TIMEOUT


async def test_provider_receives_only_facts_bound_to_retrieved_sections() -> None:
    provider = CapturingFakeProvider()
    corpus = load_promoted_corpus()
    service = AssistantService(
        ServiceContainer(
            settings=Settings(profile=EnvironmentProfile.TEST),
            dlp=FakeDlpGateway(),
            context=FakeSemanticContextManager(),
            intent=FakeIntentRouter(),
            retriever=Bm25Retriever(corpus),
            provider=provider,
            corpus=corpus,
        )
    )

    await service.answer(_request())

    assert provider.request is not None
    assert provider.request.facts
    assert all(
        (fact.source_id, fact.section_id)
        in {(item.source_id, item.section_id) for item in provider.request.evidence}
        for fact in provider.request.facts
    )
