"""Deterministic Phase 0 components; none makes an external call."""

from typing import Any

from digilicense_ai.schemas import (
    AssistantMessageRequest,
    CanonicalIntent,
    CanonicalProviderRequest,
    ContextSeed,
    DlpAction,
    DlpResult,
    EvidenceChunk,
    IntentResult,
    Locale,
    ProviderResult,
    ReasonCode,
    RetrievalQuery,
    SemanticContext,
    Service,
    Topic,
)


class FakeDlpGateway:
    async def analyze(self, question: str) -> DlpResult:
        return DlpResult(
            action=DlpAction.ALLOW,
            entity_types=(),
            safe_routing_text=question,
            provider_allowed=True,
        )


class FakeSemanticContextManager:
    def resolve(self, token: str | None) -> SemanticContext | None:
        del token
        return None

    def issue(self, seed: ContextSeed) -> str | None:
        del seed
        return None


_REASON_INTENTS: dict[ReasonCode, CanonicalIntent] = {
    ReasonCode.ACTION_LOCKED: CanonicalIntent.LOCKED_ACTION_EXPLANATION,
    ReasonCode.WAITING_PERIOD_ACTIVE: CanonicalIntent.WAITING_PERIOD_EXPLANATION,
    ReasonCode.LEARNER_LICENCE_EXPIRED: CanonicalIntent.LEARNER_LICENCE_EXPIRY_EXPLANATION,
    ReasonCode.NO_MATCHING_SLOT: CanonicalIntent.NO_APPOINTMENT_EXPLANATION,
    ReasonCode.WAITLIST_ACTIVE: CanonicalIntent.WAITLIST_EXPLANATION,
    ReasonCode.OFFER_PENDING: CanonicalIntent.OFFER_EXPIRY_EXPLANATION,
    ReasonCode.OFFER_EXPIRED: CanonicalIntent.OFFER_EXPIRY_EXPLANATION,
    ReasonCode.SIMULATED_ACTION: CanonicalIntent.MOCK_VS_REAL_EXPLANATION,
    ReasonCode.PREPARATION_REQUIRED: CanonicalIntent.PREPARATION_CHECKLIST_EXPLANATION,
}

_SERVICE_TOPICS: dict[Service, Topic] = {
    Service.LEARNER_LICENCE: Topic.LEARNER_LICENCE_APPLICATION,
    Service.LEARNER_TEST: Topic.LEARNER_TEST,
    Service.PERMANENT_DRIVING_LICENCE: Topic.PERMANENT_LICENCE_APPLICATION,
    Service.RENEWAL: Topic.RENEWAL,
    Service.DUPLICATE_REPLACEMENT: Topic.DUPLICATE_REPLACEMENT,
    Service.CHANGE_ADDRESS: Topic.CHANGE_ADDRESS,
    Service.MOBILE_UPDATE: Topic.MOBILE_UPDATE,
    Service.APPLICATION_STATUS: Topic.APPLICATION_STATUS,
    Service.FEES_PAYMENT: Topic.FEES_PAYMENT,
    Service.APPOINTMENT_WAITLIST: Topic.WAITLIST,
}


class FakeIntentRouter:
    async def route(
        self,
        request: AssistantMessageRequest,
        safe_routing_text: str,
        context: SemanticContext | None,
    ) -> IntentResult:
        del safe_routing_text, context
        return IntentResult(
            intent=_REASON_INTENTS.get(
                request.reason_code,
                CanonicalIntent.CURRENT_STEP_EXPLANATION,
            ),
            topic=_SERVICE_TOPICS[request.service],
            confidence=1.0,
        )


class FakeRetriever:
    async def retrieve(self, query: RetrievalQuery) -> tuple[EvidenceChunk, ...]:
        if not isinstance(query, RetrievalQuery):
            raise TypeError("FakeRetriever accepts only RetrievalQuery")
        return (
            EvidenceChunk(
                source_id="phase0-public-guidance",
                section_id="fake-vertical-slice",
                title="Phase 0 public guidance fixture",
                url="https://example.invalid/digilicense/phase-0-guidance",
                text="This reviewed fixture proves the Phase 0 contract without a live provider.",
                score=1.0,
            ),
        )


class FakeProvider:
    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult:
        if not isinstance(request, CanonicalProviderRequest):
            raise TypeError("FakeProvider accepts only CanonicalProviderRequest")

        answers = {
            Locale.ENGLISH: (
                "This is deterministic Phase 0 guidance. No external AI service was called."
            ),
            Locale.HINDI: (
                "यह चरण 0 का निर्धारित मार्गदर्शन है। किसी बाहरी AI सेवा को कॉल नहीं किया गया।"
            ),
        }
        return ProviderResult(
            answer=answers[request.locale],
            source_ids=tuple(item.source_id for item in request.evidence),
            uncertain=False,
        )


def reject_noncanonical_provider_input(value: Any) -> None:
    """Test helper documenting the runtime provider type guard."""

    if not isinstance(value, CanonicalProviderRequest):
        raise TypeError("provider input must be canonical")
