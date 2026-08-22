from typing import NoReturn

import pytest

from digilicense_ai.config import EnvironmentProfile, Settings
from digilicense_ai.container import ServiceContainer
from digilicense_ai.fakes import (
    FakeIntentRouter,
    FakeProvider,
    FakeRetriever,
    FakeSemanticContextManager,
)
from digilicense_ai.schemas import (
    AssistantMessageRequest,
    CanonicalIntent,
    CanonicalProviderRequest,
    DlpAction,
    DlpResult,
    DlpScope,
    IntentResult,
    Locale,
    Page,
    ReasonCode,
    RetrievalQuery,
    SemanticContext,
    Service,
    Topic,
)
from digilicense_ai.service import AssistantService


class FixedDlpGateway:
    def __init__(self, action: DlpAction) -> None:
        self._result = DlpResult(
            action=action,
            entity_types=("PHONE_NUMBER",),
            safe_routing_text="How long will the application take?",
            provider_allowed=False,
        )

    async def analyze(
        self,
        text: str,
        *,
        scope: DlpScope = DlpScope.INBOUND,
    ) -> DlpResult:
        del text
        return self._result.model_copy(update={"scope": scope})


class ScopeRecordingDlpGateway:
    def __init__(self) -> None:
        self.scopes: list[DlpScope] = []

    async def analyze(
        self,
        text: str,
        *,
        scope: DlpScope = DlpScope.INBOUND,
    ) -> DlpResult:
        self.scopes.append(scope)
        return DlpResult(
            action=DlpAction.ALLOW,
            scope=scope,
            safe_routing_text=text,
            provider_allowed=True,
        )


class NeverContextManager:
    def resolve(self, token: str | None) -> NoReturn:
        raise AssertionError(f"context resolution must not run: {token}")

    def issue(self, seed: object) -> NoReturn:
        raise AssertionError(f"context issuance must not run: {seed}")


class NeverIntentRouter:
    async def route(self, *args: object, **kwargs: object) -> NoReturn:
        raise AssertionError(f"intent routing must not run: {args}, {kwargs}")


class SanitizedIntentRouter:
    async def route(
        self,
        request: AssistantMessageRequest,
        safe_routing_text: str,
        context: SemanticContext | None,
    ) -> IntentResult:
        del context
        assert request.question == "How long will the application take?"
        assert safe_routing_text == request.question
        assert "9999999999" not in request.question
        return IntentResult(
            intent=CanonicalIntent.NO_APPOINTMENT_EXPLANATION,
            topic=Topic.WAITLIST,
            confidence=1.0,
        )


class NeverRetriever:
    async def retrieve(self, query: RetrievalQuery) -> NoReturn:
        raise AssertionError(f"retrieval must not run: {query}")


class NeverProvider:
    async def generate(self, request: CanonicalProviderRequest) -> NoReturn:
        raise AssertionError(f"provider generation must not run: {request}")


def _request(locale: Locale = Locale.ENGLISH) -> AssistantMessageRequest:
    return AssistantMessageRequest(
        question="My phone number is 9999999999. How long will it take?",
        locale=locale,
        service=Service.PERMANENT_DRIVING_LICENCE,
        page=Page.APPOINTMENT_WAITLIST,
        reason_code=ReasonCode.NO_MATCHING_SLOT,
    )


def _service(
    action: DlpAction,
    *,
    local_help: bool = False,
) -> AssistantService:
    return AssistantService(
        ServiceContainer(
            settings=Settings(profile=EnvironmentProfile.TEST),
            dlp=FixedDlpGateway(action),
            context=FakeSemanticContextManager() if local_help else NeverContextManager(),
            intent=SanitizedIntentRouter() if local_help else NeverIntentRouter(),
            retriever=NeverRetriever(),
            provider=NeverProvider(),
        )
    )


async def test_pii_block_uses_only_scrubbed_local_routing() -> None:
    response = await _service(
        DlpAction.BLOCK_PROVIDER_WITH_LOCAL_HELP,
        local_help=True,
    ).answer(_request())

    assert response.intent is CanonicalIntent.NO_APPOINTMENT_EXPLANATION
    assert response.sources == ()
    assert response.fallback_used is True
    assert response.blocked_reason == "PII_DETECTED"
    assert response.context_token is None
    assert "not sent to an AI provider" in response.answer


@pytest.mark.parametrize(
    ("action", "blocked_reason", "uncertain"),
    [
        (DlpAction.UNSUPPORTED, "UNSUPPORTED", False),
        (DlpAction.FAIL_CLOSED, "INTERNAL_SAFETY_FAILURE", True),
    ],
)
async def test_terminal_dlp_actions_stop_all_downstream_processing(
    action: DlpAction,
    blocked_reason: str,
    uncertain: bool,
) -> None:
    response = await _service(action).answer(_request(Locale.HINDI))

    assert response.intent is CanonicalIntent.UNSUPPORTED_QUESTION
    assert response.sources == ()
    assert response.fallback_used is True
    assert response.blocked_reason == blocked_reason
    assert response.uncertain is uncertain
    assert response.context_token is None


async def test_full_path_inspects_inbound_provider_payload_and_outbound_text() -> None:
    dlp = ScopeRecordingDlpGateway()
    service = AssistantService(
        ServiceContainer(
            settings=Settings(profile=EnvironmentProfile.TEST),
            dlp=dlp,
            context=FakeSemanticContextManager(),
            intent=FakeIntentRouter(),
            retriever=FakeRetriever(),
            provider=FakeProvider(),
        )
    )

    response = await service.answer(_request())

    assert response.fallback_used is False
    assert dlp.scopes == [
        DlpScope.INBOUND,
        DlpScope.PROVIDER_PAYLOAD,
        DlpScope.OUTBOUND,
    ]
