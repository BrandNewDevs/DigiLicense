"""Dependency selection for implemented and future AI components."""

from dataclasses import dataclass

from digilicense_ai.components import (
    AssistantProvider,
    AsyncClosable,
    DlpGateway,
    IntentRouter,
    Retriever,
    SemanticContextManager,
)
from digilicense_ai.config import (
    LocalBackend,
    ProviderBackend,
    RetrievalBackend,
    Settings,
)
from digilicense_ai.dlp import LocalDlpGateway
from digilicense_ai.fakes import (
    FakeDlpGateway,
    FakeIntentRouter,
    FakeProvider,
    FakeRetriever,
    FakeSemanticContextManager,
)
from digilicense_ai.providers import OpenAIProvider


class BackendNotImplementedError(RuntimeError):
    """Selected backend belongs to a later implementation phase."""


@dataclass(frozen=True, slots=True)
class ServiceContainer:
    settings: Settings
    dlp: DlpGateway
    context: SemanticContextManager
    intent: IntentRouter
    retriever: Retriever
    provider: AssistantProvider

    @property
    def component_statuses(self) -> dict[str, str]:
        return {
            "dlp": self.settings.dlp_backend.value,
            "context": self.settings.context_backend.value,
            "intent": self.settings.intent_backend.value,
            "retrieval": self.settings.retrieval_backend.value,
            "provider": self.settings.provider_backend.value,
        }

    async def close(self) -> None:
        if isinstance(self.provider, AsyncClosable):
            await self.provider.close()


def build_container(settings: Settings) -> ServiceContainer:
    """Build available components and reject later-phase backends honestly."""

    unsupported = []
    if settings.context_backend is not LocalBackend.FAKE:
        unsupported.append("context")
    if settings.intent_backend is not LocalBackend.FAKE:
        unsupported.append("intent")
    if settings.retrieval_backend is not RetrievalBackend.FAKE:
        unsupported.append("retrieval")
    if settings.provider_backend is ProviderBackend.GEMINI:
        unsupported.append("provider")
    if unsupported:
        names = ", ".join(unsupported)
        raise BackendNotImplementedError(f"backends are reserved for later phases: {names}")

    dlp = (
        LocalDlpGateway.create(timeout_ms=settings.dlp_timeout_ms)
        if settings.dlp_backend is LocalBackend.LOCAL
        else FakeDlpGateway()
    )

    provider: AssistantProvider = (
        OpenAIProvider.from_settings(settings)
        if settings.provider_backend is ProviderBackend.OPENAI
        else FakeProvider()
    )

    return ServiceContainer(
        settings=settings,
        dlp=dlp,
        context=FakeSemanticContextManager(),
        intent=FakeIntentRouter(),
        retriever=FakeRetriever(),
        provider=provider,
    )
