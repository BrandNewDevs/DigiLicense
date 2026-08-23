"""Application orchestration across the AI service trust boundaries."""

from digilicense_ai.config import ProviderBackend
from digilicense_ai.container import ServiceContainer
from digilicense_ai.providers import ProviderFailure, ProviderFailureReason
from digilicense_ai.schemas import (
    AssistantMessageRequest,
    AssistantMessageResponse,
    BlockedReason,
    CanonicalIntent,
    CanonicalProviderRequest,
    ContextSeed,
    DlpAction,
    DlpResult,
    DlpScope,
    IntentResult,
    Locale,
    RetrievalQuery,
    SourceReference,
)

_PII_LOCAL_HELP = {
    Locale.ENGLISH: (
        "For your privacy, personal information was removed and was not sent to an AI "
        "provider. Here is general guidance based only on the current DigiLicense page."
    ),
    Locale.HINDI: (
        "आपकी गोपनीयता के लिए निजी जानकारी हटा दी गई और किसी AI प्रदाता को नहीं भेजी गई। "
        "यह केवल मौजूदा DigiLicense पेज पर आधारित सामान्य मार्गदर्शन है।"
    ),
}

_UNSUPPORTED_RESPONSES = {
    Locale.ENGLISH: (
        "I can only explain DigiLicense services using public guidance. Please ask about the "
        "licence service shown on this page."
    ),
    Locale.HINDI: (
        "मैं केवल सार्वजनिक मार्गदर्शन के आधार पर DigiLicense सेवाओं को समझा सकता हूँ। कृपया "
        "इस पेज पर दिखाई गई लाइसेंस सेवा के बारे में पूछें।"
    ),
}

_SAFETY_RESPONSES = {
    Locale.ENGLISH: (
        "I cannot safely process that question right now. Please remove personal information "
        "and try again."
    ),
    Locale.HINDI: (
        "मैं अभी इस प्रश्न को सुरक्षित रूप से संसाधित नहीं कर सकता। कृपया निजी जानकारी हटाकर फिर प्रयास करें।"
    ),
}

_BOUNDARY_RESPONSES = {
    Locale.ENGLISH: (
        "I could not safely prepare that answer. Please use the public guidance on this page "
        "and try again without personal information."
    ),
    Locale.HINDI: (
        "मैं उस उत्तर को सुरक्षित रूप से तैयार नहीं कर सका। कृपया इस पेज पर सार्वजनिक मार्गदर्शन "
        "देखें और निजी जानकारी के बिना फिर प्रयास करें।"
    ),
}

_PROVIDER_FALLBACK_RESPONSES = {
    Locale.ENGLISH: (
        "AI guidance is temporarily unavailable. Please use the cited public guidance on this "
        "page and try again later."
    ),
    Locale.HINDI: (
        "AI मार्गदर्शन अभी उपलब्ध नहीं है। कृपया इस पेज पर दिए सार्वजनिक मार्गदर्शन का उपयोग "
        "करें और बाद में फिर प्रयास करें।"
    ),
}

_EVIDENCE_FALLBACK_RESPONSES = {
    Locale.ENGLISH: (
        "I do not have enough reviewed guidance to answer that safely. Please use the public "
        "guidance shown on this page."
    ),
    Locale.HINDI: (
        "मेरे पास इसका सुरक्षित उत्तर देने के लिए पर्याप्त समीक्षित मार्गदर्शन नहीं है। कृपया इस "
        "पेज पर दिया गया सार्वजनिक मार्गदर्शन देखें।"
    ),
}


class AssistantService:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    async def answer(self, request: AssistantMessageRequest) -> AssistantMessageResponse:
        dlp_result = await self._container.dlp.analyze(
            request.question,
            scope=DlpScope.INBOUND,
        )

        if not dlp_result.provider_allowed:
            return await self._blocked_response(request, dlp_result)

        intent_result = await self._route_with_safe_text(request, dlp_result)
        return await self._provider_response(request, intent_result)

    async def _route_with_safe_text(
        self,
        request: AssistantMessageRequest,
        dlp_result: DlpResult,
    ) -> IntentResult:
        context = self._container.context.resolve(request.context_token)
        safe_request = request.model_copy(update={"question": dlp_result.safe_routing_text})
        return await self._container.intent.route(
            request=safe_request,
            safe_routing_text=dlp_result.safe_routing_text,
            context=context,
        )

    async def _provider_response(
        self,
        request: AssistantMessageRequest,
        intent_result: IntentResult,
    ) -> AssistantMessageResponse:
        evidence = await self._container.retriever.retrieve(
            RetrievalQuery(
                intent=intent_result.intent,
                topic=intent_result.topic,
                locale=request.locale,
            )
        )
        if not evidence:
            return AssistantMessageResponse(
                answer=_EVIDENCE_FALLBACK_RESPONSES[request.locale],
                intent=intent_result.intent,
                sources=(),
                uncertain=True,
                fallback_used=True,
                blocked_reason=BlockedReason.NO_EVIDENCE,
            )
        provider_request = CanonicalProviderRequest(
            intent=intent_result.intent,
            topic=intent_result.topic,
            service=request.service,
            page=request.page,
            reason_code=request.reason_code,
            locale=request.locale,
            evidence=evidence,
            prompt_version=(
                "phase3-openai-v1"
                if self._container.settings.provider_backend is ProviderBackend.OPENAI
                else "phase0-fake-v1"
            ),
            corpus_version=getattr(
                self._container.retriever, "corpus_version", "phase0-fixture-v1"
            ),
        )
        payload_dlp_result = await self._container.dlp.analyze(
            provider_request.model_dump_json(by_alias=True),
            scope=DlpScope.PROVIDER_PAYLOAD,
        )
        if not payload_dlp_result.provider_allowed:
            return self._boundary_failure_response(request, intent_result, payload_dlp_result)

        try:
            provider_result = await self._container.provider.generate(provider_request)
        except ProviderFailure as error:
            return self._provider_failure_response(request, intent_result, error.reason)
        outbound_dlp_result = await self._container.dlp.analyze(
            provider_result.answer,
            scope=DlpScope.OUTBOUND,
        )
        if not outbound_dlp_result.provider_allowed:
            return self._boundary_failure_response(request, intent_result, outbound_dlp_result)

        evidence_by_id = {item.source_id: item for item in evidence}
        sources = tuple(
            SourceReference(
                id=source_id,
                title=evidence_by_id[source_id].title,
                url=evidence_by_id[source_id].url,
            )
            for source_id in provider_result.source_ids
            if source_id in evidence_by_id
        )
        context_token = self._container.context.issue(
            ContextSeed(
                last_intent=intent_result.intent,
                topic=intent_result.topic,
                locale=request.locale,
            )
        )
        return AssistantMessageResponse(
            answer=provider_result.answer,
            intent=intent_result.intent,
            sources=sources,
            uncertain=provider_result.uncertain,
            context_token=context_token,
        )

    async def _blocked_response(
        self,
        request: AssistantMessageRequest,
        dlp_result: DlpResult,
    ) -> AssistantMessageResponse:
        if dlp_result.action is DlpAction.BLOCK_PROVIDER_WITH_LOCAL_HELP:
            intent_result = await self._route_with_safe_text(request, dlp_result)
            context_token = self._container.context.issue(
                ContextSeed(
                    last_intent=intent_result.intent,
                    topic=intent_result.topic,
                    locale=request.locale,
                )
            )
            return AssistantMessageResponse(
                answer=_PII_LOCAL_HELP[request.locale],
                intent=intent_result.intent,
                sources=(),
                uncertain=False,
                fallback_used=True,
                blocked_reason=BlockedReason.PII_DETECTED,
                context_token=context_token,
            )

        if dlp_result.action is DlpAction.UNSUPPORTED:
            return AssistantMessageResponse(
                answer=_UNSUPPORTED_RESPONSES[request.locale],
                intent=CanonicalIntent.UNSUPPORTED_QUESTION,
                sources=(),
                uncertain=False,
                fallback_used=True,
                blocked_reason=BlockedReason.UNSUPPORTED,
            )

        if dlp_result.action is DlpAction.FAIL_CLOSED:
            return AssistantMessageResponse(
                answer=_SAFETY_RESPONSES[request.locale],
                intent=CanonicalIntent.UNSUPPORTED_QUESTION,
                sources=(),
                uncertain=True,
                fallback_used=True,
                blocked_reason=BlockedReason.INTERNAL_SAFETY_FAILURE,
            )

        raise RuntimeError("DLP denied provider access without a blocked response action")

    @staticmethod
    def _boundary_failure_response(
        request: AssistantMessageRequest,
        intent_result: IntentResult,
        dlp_result: DlpResult,
    ) -> AssistantMessageResponse:
        blocked_reason = (
            BlockedReason.INTERNAL_SAFETY_FAILURE
            if dlp_result.action is DlpAction.FAIL_CLOSED
            else BlockedReason.INVALID_OUTPUT
        )
        return AssistantMessageResponse(
            answer=_BOUNDARY_RESPONSES[request.locale],
            intent=intent_result.intent,
            sources=(),
            uncertain=True,
            fallback_used=True,
            blocked_reason=blocked_reason,
        )

    @staticmethod
    def _provider_failure_response(
        request: AssistantMessageRequest,
        intent_result: IntentResult,
        reason: ProviderFailureReason,
    ) -> AssistantMessageResponse:
        blocked_reason = (
            BlockedReason.RATE_LIMITED
            if reason is ProviderFailureReason.RATE_LIMITED
            else BlockedReason.INVALID_OUTPUT
            if reason is ProviderFailureReason.INVALID_OUTPUT
            else BlockedReason.INTERNAL_SAFETY_FAILURE
            if reason is ProviderFailureReason.UNSAFE_PAYLOAD
            else BlockedReason.PROVIDER_UNAVAILABLE
        )
        return AssistantMessageResponse(
            answer=_PROVIDER_FALLBACK_RESPONSES[request.locale],
            intent=intent_result.intent,
            sources=(),
            uncertain=True,
            fallback_used=True,
            blocked_reason=blocked_reason,
        )
