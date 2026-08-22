import pytest

from digilicense_ai.config import EnvironmentProfile, Settings
from digilicense_ai.container import ServiceContainer
from digilicense_ai.fakes import (
    FakeDlpGateway,
    FakeIntentRouter,
    FakeRetriever,
    FakeSemanticContextManager,
)
from digilicense_ai.providers import ProviderFailure, ProviderFailureReason
from digilicense_ai.schemas import (
    AssistantMessageRequest,
    BlockedReason,
    CanonicalProviderRequest,
    Locale,
    Page,
    ProviderResult,
    ReasonCode,
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
