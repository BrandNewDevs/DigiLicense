import pytest
from pydantic import ValidationError

from digilicense_ai.config import (
    EnvironmentProfile,
    LocalBackend,
    ProviderBackend,
    RetrievalBackend,
    Settings,
)
from digilicense_ai.container import BackendNotImplementedError, build_container
from digilicense_ai.dlp import LocalDlpGateway


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
        )


def test_production_accepts_only_planned_safe_backends() -> None:
    settings = Settings(
        profile=EnvironmentProfile.PRODUCTION,
        provider_backend=ProviderBackend.OPENAI,
        retrieval_backend=RetrievalBackend.BM25,
        dlp_backend=LocalBackend.LOCAL,
        context_backend=LocalBackend.LOCAL,
        intent_backend=LocalBackend.LOCAL,
    )

    assert settings.provider_backend is ProviderBackend.OPENAI
    assert settings.retrieval_backend is RetrievalBackend.BM25


def test_later_phase_backends_fail_honestly_during_phase_zero() -> None:
    settings = Settings(
        profile=EnvironmentProfile.EVALUATION,
        provider_backend=ProviderBackend.GEMINI,
        retrieval_backend=RetrievalBackend.FILE_SEARCH,
    )

    with pytest.raises(BackendNotImplementedError, match="reserved for later phases"):
        build_container(settings)


def test_local_dlp_model_is_loaded_when_container_is_built() -> None:
    settings = Settings(
        profile=EnvironmentProfile.TEST,
        dlp_backend=LocalBackend.LOCAL,
    )

    container = build_container(settings)

    assert isinstance(container.dlp, LocalDlpGateway)
    assert container.component_statuses["dlp"] == "local"
