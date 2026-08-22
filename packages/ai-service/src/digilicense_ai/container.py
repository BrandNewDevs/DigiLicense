"""Dependency selection and Phase 0 component container."""

from dataclasses import dataclass

from digilicense_ai.components import (
    AssistantProvider,
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
from digilicense_ai.fakes import (
    FakeDlpGateway,
    FakeIntentRouter,
    FakeProvider,
    FakeRetriever,
    FakeSemanticContextManager,
)


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


def build_container(settings: Settings) -> ServiceContainer:
    """Build the Phase 0 fake container and reject unimplemented backends honestly."""

    unsupported = []
    if settings.dlp_backend is not LocalBackend.FAKE:
        unsupported.append("dlp")
    if settings.context_backend is not LocalBackend.FAKE:
        unsupported.append("context")
    if settings.intent_backend is not LocalBackend.FAKE:
        unsupported.append("intent")
    if settings.retrieval_backend is not RetrievalBackend.FAKE:
        unsupported.append("retrieval")
    if settings.provider_backend is not ProviderBackend.FAKE:
        unsupported.append("provider")
    if unsupported:
        names = ", ".join(unsupported)
        raise BackendNotImplementedError(f"backends are reserved for later phases: {names}")

    return ServiceContainer(
        settings=settings,
        dlp=FakeDlpGateway(),
        context=FakeSemanticContextManager(),
        intent=FakeIntentRouter(),
        retriever=FakeRetriever(),
        provider=FakeProvider(),
    )
