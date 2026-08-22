"""Dependency interfaces for each AI trust-boundary component."""

from typing import Protocol, runtime_checkable

from digilicense_ai.schemas import (
    AssistantMessageRequest,
    CanonicalProviderRequest,
    ContextSeed,
    DlpResult,
    EvidenceChunk,
    IntentResult,
    ProviderResult,
    RetrievalQuery,
    SemanticContext,
)


@runtime_checkable
class DlpGateway(Protocol):
    async def analyze(self, question: str) -> DlpResult: ...


@runtime_checkable
class SemanticContextManager(Protocol):
    def resolve(self, token: str | None) -> SemanticContext | None: ...

    def issue(self, seed: ContextSeed) -> str | None: ...


@runtime_checkable
class IntentRouter(Protocol):
    async def route(
        self,
        request: AssistantMessageRequest,
        safe_routing_text: str,
        context: SemanticContext | None,
    ) -> IntentResult: ...


@runtime_checkable
class Retriever(Protocol):
    async def retrieve(self, query: RetrievalQuery) -> tuple[EvidenceChunk, ...]: ...


@runtime_checkable
class AssistantProvider(Protocol):
    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult: ...
