"""Application orchestration for the deterministic Phase 0 vertical slice."""

from digilicense_ai.container import ServiceContainer
from digilicense_ai.schemas import (
    AssistantMessageRequest,
    AssistantMessageResponse,
    CanonicalProviderRequest,
    ContextSeed,
    RetrievalQuery,
    SourceReference,
)


class AssistantService:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    async def answer(self, request: AssistantMessageRequest) -> AssistantMessageResponse:
        dlp_result = await self._container.dlp.analyze(request.question)
        context = self._container.context.resolve(request.context_token)
        intent_result = await self._container.intent.route(
            request=request,
            safe_routing_text=dlp_result.safe_routing_text,
            context=context,
        )
        evidence = await self._container.retriever.retrieve(
            RetrievalQuery(
                intent=intent_result.intent,
                topic=intent_result.topic,
                locale=request.locale,
            )
        )
        provider_request = CanonicalProviderRequest(
            intent=intent_result.intent,
            topic=intent_result.topic,
            service=request.service,
            page=request.page,
            reason_code=request.reason_code,
            locale=request.locale,
            evidence=evidence,
            prompt_version="phase0-fake-v1",
            corpus_version="phase0-fixture-v1",
        )
        provider_result = await self._container.provider.generate(provider_request)

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
