"""Dependency selection for implemented and future AI components."""

from dataclasses import dataclass
from typing import cast

import httpx
from openai import AsyncOpenAI

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
from digilicense_ai.context import SignedSemanticContextManager
from digilicense_ai.corpus import PromotedCorpus, load_promoted_corpus
from digilicense_ai.dlp import LocalDlpGateway
from digilicense_ai.fakes import (
    FakeDlpGateway,
    FakeIntentRouter,
    FakeProvider,
    FakeRetriever,
    FakeSemanticContextManager,
    LocalIntentRouter,
)
from digilicense_ai.metrics import SanitizedMetrics
from digilicense_ai.providers import GeminiProvider, OpenAIProvider
from digilicense_ai.retrieval import Bm25Retriever, FileSearchRetriever
from digilicense_ai.retrieval.file_search import FileSearchClient
from digilicense_ai.security import DailyProviderBudget


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
    corpus: PromotedCorpus | None = None
    provider_budget: DailyProviderBudget | None = None
    metrics: SanitizedMetrics | None = None

    def readiness_checks(self) -> dict[str, bool]:
        return {
            "dlp": self.dlp is not None,
            "fallbacks": True,
            "intent": self.intent is not None,
            "retrieval": self.retriever is not None,
        }

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
        if isinstance(self.retriever, AsyncClosable):
            await self.retriever.close()


def build_container(settings: Settings) -> ServiceContainer:
    """Build available components and reject later-phase backends honestly."""

    dlp = (
        LocalDlpGateway.create(timeout_ms=settings.dlp_timeout_ms)
        if settings.dlp_backend is LocalBackend.LOCAL
        else FakeDlpGateway()
    )

    if settings.provider_backend is ProviderBackend.OPENAI:
        provider: AssistantProvider = OpenAIProvider.from_settings(settings, payload_dlp=dlp)
    elif settings.provider_backend is ProviderBackend.GEMINI:
        provider = GeminiProvider.from_settings(settings, payload_dlp=dlp)
    else:
        provider = FakeProvider()
    corpus = load_promoted_corpus()
    retriever: Retriever
    if settings.retrieval_backend is RetrievalBackend.BM25:
        retriever = Bm25Retriever(corpus)
    elif settings.retrieval_backend is RetrievalBackend.FILE_SEARCH:
        if settings.openai_api_key is None or settings.openai_project_id is None:
            raise ValueError("File Search settings were not validated")
        timeout = httpx.Timeout(
            settings.openai_request_timeout_seconds,
            connect=settings.openai_connect_timeout_seconds,
        )
        client = cast(
            FileSearchClient,
            AsyncOpenAI(
                api_key=settings.openai_api_key.get_secret_value(),
                project=settings.openai_project_id,
                timeout=timeout,
                max_retries=0,
            ),
        )
        retriever = FileSearchRetriever(
            client=client,
            corpus=corpus,
            vector_store_id=settings.file_search_vector_store_id or "",
        )
    else:
        retriever = FakeRetriever()

    return ServiceContainer(
        settings=settings,
        dlp=dlp,
        context=(
            SignedSemanticContextManager.from_settings(settings)
            if settings.context_backend is LocalBackend.LOCAL
            else FakeSemanticContextManager()
        ),
        intent=(
            LocalIntentRouter()
            if settings.intent_backend is LocalBackend.LOCAL
            else FakeIntentRouter()
        ),
        retriever=retriever,
        provider=provider,
        corpus=corpus,
        provider_budget=DailyProviderBudget(settings.provider_daily_call_limit),
        metrics=SanitizedMetrics(),
    )
