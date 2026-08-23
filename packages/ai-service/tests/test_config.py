import pytest
from pydantic import ValidationError

from digilicense_ai.config import (
    EnvironmentProfile,
    LocalBackend,
    ProviderBackend,
    RetrievalBackend,
    Settings,
)
from digilicense_ai.container import build_container
from digilicense_ai.dlp import LocalDlpGateway
from digilicense_ai.providers import OpenAIProvider
from digilicense_ai.retrieval import Bm25Retriever


def test_default_profile_requires_no_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    settings = Settings()
    container = build_container(settings)

    assert settings.profile is EnvironmentProfile.DEVELOPMENT
    assert container.settings.provider_backend is ProviderBackend.FAKE


@pytest.mark.parametrize(
    ("provider", "retrieval"),
    [
        (ProviderBackend.GEMINI, RetrievalBackend.BM25),
        (ProviderBackend.OPENAI, RetrievalBackend.FILE_SEARCH),
        (ProviderBackend.FAKE, RetrievalBackend.FAKE),
    ],
)
def test_production_rejects_unsafe_backend_combinations(
    provider: ProviderBackend,
    retrieval: RetrievalBackend,
) -> None:
    with pytest.raises(ValidationError, match="unsafe backend selection"):
        Settings(
            profile=EnvironmentProfile.PRODUCTION,
            provider_backend=provider,
            retrieval_backend=retrieval,
            dlp_backend=LocalBackend.LOCAL,
            context_backend=LocalBackend.LOCAL,
            intent_backend=LocalBackend.LOCAL,
            openai_api_key="sk-synthetic-test-only",
            openai_project_id="proj_synthetic_test",
            openai_budget_controls_confirmed=True,
        )


def test_production_requires_service_perimeter_configuration() -> None:
    with pytest.raises(ValidationError, match="service bearer credential"):
        Settings(
            profile=EnvironmentProfile.PRODUCTION,
            provider_backend=ProviderBackend.OPENAI,
            retrieval_backend=RetrievalBackend.BM25,
            dlp_backend=LocalBackend.LOCAL,
            context_backend=LocalBackend.LOCAL,
            intent_backend=LocalBackend.LOCAL,
            openai_api_key="sk-synthetic-test-only",
            openai_project_id="proj_synthetic_test",
            openai_budget_controls_confirmed=True,
        )


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("openai_api_key", None),
        ("openai_api_key", "   "),
        ("openai_project_id", None),
        ("openai_project_id", "   "),
    ],
)
def test_openai_selection_requires_dedicated_credentials(
    field: str,
    invalid_value: str | None,
) -> None:
    values: dict[str, object] = {
        "profile": EnvironmentProfile.EVALUATION,
        "provider_backend": ProviderBackend.OPENAI,
        "openai_api_key": "sk-synthetic-test-only",
        "openai_project_id": "proj_synthetic_test",
    }
    values[field] = invalid_value

    with pytest.raises(ValidationError, match="OpenAI provider configuration is incomplete"):
        Settings.model_validate(values)


def test_production_requires_budget_controls_confirmation() -> None:
    with pytest.raises(ValidationError, match="confirmed OpenAI budget controls"):
        Settings(
            profile=EnvironmentProfile.PRODUCTION,
            provider_backend=ProviderBackend.OPENAI,
            retrieval_backend=RetrievalBackend.BM25,
            dlp_backend=LocalBackend.LOCAL,
            context_backend=LocalBackend.LOCAL,
            intent_backend=LocalBackend.LOCAL,
            openai_api_key="sk-synthetic-test-only",
            openai_project_id="proj_synthetic_test",
        )


def test_gemini_is_rejected_outside_development() -> None:
    with pytest.raises(ValidationError, match="Gemini is allowed only in the development profile"):
        Settings(
            profile=EnvironmentProfile.EVALUATION,
            provider_backend=ProviderBackend.GEMINI,
            gemini_api_key="gemini-synthetic-test-only",
        )


def test_gemini_development_selection_requires_separate_credentials() -> None:
    with pytest.raises(ValidationError, match="requires gemini_api_key"):
        Settings(
            profile=EnvironmentProfile.DEVELOPMENT,
            provider_backend=ProviderBackend.GEMINI,
        )


def test_file_search_requires_explicit_evaluation_configuration() -> None:
    with pytest.raises(ValidationError, match="evaluation profile"):
        Settings(
            profile=EnvironmentProfile.DEVELOPMENT,
            retrieval_backend=RetrievalBackend.FILE_SEARCH,
            file_search_enabled=True,
            file_search_vector_store_id="vs_test",
            openai_api_key="sk-synthetic-test-only",
            openai_project_id="proj_synthetic_test",
        )

    with pytest.raises(ValidationError, match="explicit file_search_enabled"):
        Settings(
            profile=EnvironmentProfile.EVALUATION,
            retrieval_backend=RetrievalBackend.FILE_SEARCH,
            file_search_vector_store_id="vs_test",
            openai_api_key="sk-synthetic-test-only",
            openai_project_id="proj_synthetic_test",
        )


async def test_evaluation_file_search_wires_without_a_network_call() -> None:
    settings = Settings(
        profile=EnvironmentProfile.EVALUATION,
        retrieval_backend=RetrievalBackend.FILE_SEARCH,
        file_search_enabled=True,
        file_search_vector_store_id="vs_test",
        openai_api_key="sk-synthetic-test-only",
        openai_project_id="proj_synthetic_test",
    )

    container = build_container(settings)

    assert container.component_statuses["retrieval"] == "file_search"
    await container.close()


def test_local_dlp_model_is_loaded_when_container_is_built() -> None:
    settings = Settings(
        profile=EnvironmentProfile.TEST,
        dlp_backend=LocalBackend.LOCAL,
    )

    container = build_container(settings)

    assert isinstance(container.dlp, LocalDlpGateway)
    assert container.component_statuses["dlp"] == "local"


def test_bm25_is_built_during_container_startup() -> None:
    container = build_container(
        Settings(profile=EnvironmentProfile.TEST, retrieval_backend=RetrievalBackend.BM25)
    )

    assert isinstance(container.retriever, Bm25Retriever)
    assert container.component_statuses["retrieval"] == "bm25"


async def test_evaluation_profile_wires_openai_without_a_startup_network_call() -> None:
    settings = Settings(
        profile=EnvironmentProfile.EVALUATION,
        provider_backend=ProviderBackend.OPENAI,
        openai_api_key="sk-synthetic-test-only",
        openai_project_id="proj_synthetic_test",
    )

    container = build_container(settings)

    assert isinstance(container.provider, OpenAIProvider)
    assert container.component_statuses["provider"] == "openai"
    await container.close()
