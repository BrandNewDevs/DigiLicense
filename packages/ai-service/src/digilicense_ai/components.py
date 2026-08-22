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
    async def analyze(self, question: str) -> DlpResult: """Analyze a question at the data-loss prevention boundary.

Parameters:
	question (str): The question to analyze.

Returns:
	DlpResult: The data-loss prevention analysis result.
"""
...


@runtime_checkable
class SemanticContextManager(Protocol):
    def resolve(self, token: str | None) -> SemanticContext | None: """
Resolve a semantic context from an optional token.

Parameters:
    token (str | None): Token identifying the semantic context.

Returns:
    SemanticContext | None: The resolved semantic context, or None when no context is available.
"""
...

    def issue(self, seed: ContextSeed) -> str | None: """Issue an optional semantic context token for the provided context seed.

Parameters:
	seed (ContextSeed): Data used to create the semantic context token.

Returns:
	str | None: The issued context token, or `None` when no token is available.
"""
...


@runtime_checkable
class IntentRouter(Protocol):
    async def route(
        self,
        request: AssistantMessageRequest,
        safe_routing_text: str,
        context: SemanticContext | None,
    ) -> IntentResult: """
        Route an assistant request using safe routing text and optional semantic context.
        
        Parameters:
            request (AssistantMessageRequest): The assistant request to route.
            safe_routing_text (str): Sanitized text used for routing.
            context (SemanticContext | None): Optional semantic context for routing.
        
        Returns:
            IntentResult: The resolved intent and routing information.
        """
        ...


@runtime_checkable
class Retriever(Protocol):
    async def retrieve(self, query: RetrievalQuery) -> tuple[EvidenceChunk, ...]: """
Retrieve evidence chunks relevant to a retrieval query.

Parameters:
	query (RetrievalQuery): The query describing the evidence to retrieve.

Returns:
	tuple[EvidenceChunk, ...]: The retrieved evidence chunks.
"""
...


@runtime_checkable
class AssistantProvider(Protocol):
    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult: """Generate an assistant response for a canonical provider request.

Parameters:
	request (CanonicalProviderRequest): The canonical request to process.

Returns:
	ProviderResult: The generated provider response.
"""
...
