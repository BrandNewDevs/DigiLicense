"""Deterministic Phase 0 components; none makes an external call."""

import re
from typing import Any

from digilicense_ai.schemas import (
    AssistantMessageRequest,
    CanonicalIntent,
    CanonicalProviderRequest,
    ContextSeed,
    DlpAction,
    DlpResult,
    DlpScope,
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
    async def analyze(
        self,
        text: str,
        *,
        scope: DlpScope = DlpScope.INBOUND,
    ) -> DlpResult:
        return DlpResult(
            action=DlpAction.ALLOW,
            scope=scope,
            entity_types=(),
            safe_routing_text=text,
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

_REFERENTIAL_FOLLOW_UP = (
    "it",
    "that",
    "this",
    "after that",
    "iske",
    "iske liye",
    "is ke liye",
    "उसके",
    "उसके लिए",
    "इसके",
    "इसके लिए",
    "यह",
    "वह",
)
_OUT_OF_SCOPE_TERMS = (
    "medical",
    "diagnosis",
    "medicine",
    "weather",
    "politics",
    "election",
    "investment",
    "crypto",
    "password",
    "hack",
)
_SUPPORTED_JURISDICTION_TERMS = ("delhi", "दिल्ली")
_UNSUPPORTED_JURISDICTION_TERMS = (
    "mumbai",
    "maharashtra",
    "pune",
    "nagpur",
    "uttar pradesh",
    "lucknow",
    "uttarakhand",
    "haryana",
    "punjab",
    "rajasthan",
    "gujarat",
    "madhya pradesh",
    "bihar",
    "jharkhand",
    "west bengal",
    "odisha",
    "chhattisgarh",
    "goa",
    "karnataka",
    "bengaluru",
    "bangalore",
    "kerala",
    "tamil nadu",
    "chennai",
    "telangana",
    "andhra pradesh",
    "hyderabad",
    "assam",
    "meghalaya",
    "manipur",
    "mizoram",
    "nagaland",
    "tripura",
    "sikkim",
    "arunachal pradesh",
    "kolkata",
    "जम्मू",
    "मुंबई",
    "पुणे",
    "बेंगलुरु",
    "चेन्नई",
    "कोलकाता",
)


class FakeIntentRouter:
    async def route(
        self,
        request: AssistantMessageRequest,
        safe_routing_text: str,
        context: SemanticContext | None,
    ) -> IntentResult:
        lowered = safe_routing_text.casefold()

        def contains(term: str) -> bool:
            if term.isascii() and term.replace(" ", "").isalpha():
                return re.search(rf"(?<!\w){re.escape(term)}(?!\w)", lowered) is not None
            return term in lowered

        if any(contains(term) for term in _OUT_OF_SCOPE_TERMS):
            return IntentResult(
                intent=CanonicalIntent.UNSUPPORTED_QUESTION,
                topic=Topic.SIMULATION,
                confidence=1.0,
            )

        matched_jurisdictions = tuple(
            term
            for term in (*_SUPPORTED_JURISDICTION_TERMS, *_UNSUPPORTED_JURISDICTION_TERMS)
            if contains(term)
        )
        if any(term in _UNSUPPORTED_JURISDICTION_TERMS for term in matched_jurisdictions):
            return IntentResult(
                intent=CanonicalIntent.UNSUPPORTED_QUESTION,
                topic=Topic.SIMULATION,
                confidence=1.0,
            )

        text_intent = next(
            (
                intent
                for terms, intent in (
                    (
                        ("offer", "ऑफर"),
                        CanonicalIntent.OFFER_EXPIRY_EXPLANATION,
                    ),
                    (
                        ("waitlist", "wait list", "प्रतीक्षा सूची"),
                        CanonicalIntent.WAITLIST_EXPLANATION,
                    ),
                    (
                        ("kitna time", "कितना समय", "waiting", "wait"),
                        CanonicalIntent.WAITING_PERIOD_EXPLANATION,
                    ),
                    (
                        ("expire", "expiry", "समाप्त", "validity"),
                        CanonicalIntent.LEARNER_LICENCE_EXPIRY_EXPLANATION,
                    ),
                    (
                        ("slot", "appointment", "अपॉइंटमेंट"),
                        CanonicalIntent.NO_APPOINTMENT_EXPLANATION,
                    ),
                )
                if any(contains(term) for term in terms)
            ),
            None,
        )
        if text_intent is not None and (
            context is None
            or not any(contains(term) for term in _REFERENTIAL_FOLLOW_UP)
            or text_intent is not CanonicalIntent.WAITING_PERIOD_EXPLANATION
        ):
            return IntentResult(
                intent=text_intent,
                topic=_SERVICE_TOPICS[request.service],
                confidence=1.0,
            )
        if context is not None and any(contains(term) for term in _REFERENTIAL_FOLLOW_UP):
            return IntentResult(
                intent=context.last_intent,
                topic=context.topic,
                confidence=0.9,
            )
        return IntentResult(
            intent=_REASON_INTENTS.get(
                request.reason_code, CanonicalIntent.CURRENT_STEP_EXPLANATION
            ),
            topic=_SERVICE_TOPICS[request.service],
            confidence=1.0,
        )


class LocalIntentRouter(FakeIntentRouter):
    """Deterministic local router used by the production profile."""


class FakeRetriever:
    async def retrieve(self, query: RetrievalQuery) -> tuple[EvidenceChunk, ...]:
        if not isinstance(query, RetrievalQuery):
            raise TypeError("FakeRetriever accepts only RetrievalQuery")
        prototype_intents = {
            CanonicalIntent.NO_APPOINTMENT_EXPLANATION,
            CanonicalIntent.WAITLIST_EXPLANATION,
            CanonicalIntent.OFFER_EXPIRY_EXPLANATION,
            CanonicalIntent.MOCK_VS_REAL_EXPLANATION,
        }
        if query.intent in prototype_intents:
            source_id = "digilicense-prototype-behavior-v1"
            section_id = "prototype-guided-actions-v1"
            title = "DigiLicense prototype behavior"
            url = "https://digilicense.invalid/prototype/assistant-behavior"
            text = "This is simulated prototype behavior for the Phase 0 contract."
        else:
            source_id = "delhi-driving-licence-guidance-2026"
            section_id = "delhi-ll-validity-preparation-v1"
            title = "Delhi driving-licence public guidance"
            url = "https://transport.delhi.gov.in/transport/driving-license"
            text = "This reviewed fixture proves the Phase 0 contract without a live provider."
        return (
            EvidenceChunk(
                source_id=source_id,
                section_id=section_id,
                title=title,
                url=url,
                text=text,
                score=1.0,
            ),
        )


class FakeProvider:
    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult:
        if not isinstance(request, CanonicalProviderRequest):
            raise TypeError("FakeProvider accepts only CanonicalProviderRequest")

        answers = {
            Locale.ENGLISH: (
                "This is deterministic guidance. No external AI service was called. "
                "This is simulated prototype behavior."
            ),
            Locale.HINDI: (
                "यह निर्धारित मार्गदर्शन है। किसी बाहरी AI सेवा को कॉल नहीं किया गया। "
                "यह सिमुलेटेड प्रोटोटाइप व्यवहार है।"
            ),
        }
        return ProviderResult(
            answer=answers[request.locale],
            source_ids=tuple(item.source_id for item in request.evidence),
            fact_ids=(),
            uncertain=False,
        )


def reject_noncanonical_provider_input(value: Any) -> None:
    """Test helper documenting the runtime provider type guard."""

    if not isinstance(value, CanonicalProviderRequest):
        raise TypeError("provider input must be canonical")
