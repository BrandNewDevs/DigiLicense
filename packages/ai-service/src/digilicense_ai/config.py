"""Validated configuration profiles for the AI service."""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class EnvironmentProfile(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    EVALUATION = "evaluation"
    PRODUCTION = "production"


class ProviderBackend(StrEnum):
    FAKE = "fake"
    GEMINI = "gemini"
    OPENAI = "openai"


class RetrievalBackend(StrEnum):
    FAKE = "fake"
    BM25 = "bm25"
    FILE_SEARCH = "file_search"


class LocalBackend(StrEnum):
    FAKE = "fake"
    LOCAL = "local"


class Settings(BaseSettings):
    """Process configuration with production-safe backend constraints."""

    model_config = SettingsConfigDict(
        env_prefix="DIGILICENSE_AI_",
        env_file=None,
        extra="forbid",
        frozen=True,
    )

    profile: EnvironmentProfile = EnvironmentProfile.DEVELOPMENT
    provider_backend: ProviderBackend = ProviderBackend.FAKE
    retrieval_backend: RetrievalBackend = RetrievalBackend.FAKE
    dlp_backend: LocalBackend = LocalBackend.FAKE
    context_backend: LocalBackend = LocalBackend.FAKE
    intent_backend: LocalBackend = LocalBackend.FAKE
    service_name: str = "digilicense-ai"
    max_request_body_bytes: int = Field(default=4096, ge=1024, le=65536)
    dlp_timeout_ms: int = Field(default=250, ge=10, le=2000)
    model_id: Literal["gpt-5.4-mini-2026-03-17"] = "gpt-5.4-mini-2026-03-17"
    openai_api_key: SecretStr | None = Field(default=None, repr=False)
    openai_project_id: str | None = Field(default=None, min_length=1, max_length=128)
    openai_max_output_tokens: int = Field(default=800, ge=128, le=1200)
    openai_request_timeout_seconds: float = Field(default=12.0, ge=1.0, le=30.0)
    openai_connect_timeout_seconds: float = Field(default=3.0, ge=0.5, le=10.0)
    openai_max_concurrency: int = Field(default=4, ge=1, le=32)
    openai_budget_controls_confirmed: bool = False
    file_search_enabled: bool = False
    file_search_vector_store_id: str | None = Field(default=None, min_length=4, max_length=128)
    file_search_expiry_days: int = Field(default=7, ge=1, le=30)
    log_level: str = "INFO"

    @model_validator(mode="after")
    def enforce_profile_boundary(self) -> "Settings":
        if self.profile is EnvironmentProfile.PRODUCTION:
            required = {
                "provider_backend": (self.provider_backend, ProviderBackend.OPENAI),
                "retrieval_backend": (self.retrieval_backend, RetrievalBackend.BM25),
                "dlp_backend": (self.dlp_backend, LocalBackend.LOCAL),
                "context_backend": (self.context_backend, LocalBackend.LOCAL),
                "intent_backend": (self.intent_backend, LocalBackend.LOCAL),
            }
            invalid = [name for name, (actual, expected) in required.items() if actual != expected]
            if invalid:
                fields = ", ".join(sorted(invalid))
                raise ValueError(f"production profile has unsafe backend selection: {fields}")
            if not self.openai_budget_controls_confirmed:
                raise ValueError("production profile requires confirmed OpenAI budget controls")
            raise ValueError(
                "production profile is unavailable until local context and intent backends exist"
            )

        if (
            self.provider_backend is ProviderBackend.OPENAI
            or self.retrieval_backend is RetrievalBackend.FILE_SEARCH
        ):
            missing = []
            if self.openai_api_key is None or not self.openai_api_key.get_secret_value().strip():
                missing.append("openai_api_key")
            if self.openai_project_id is None or not self.openai_project_id.strip():
                missing.append("openai_project_id")
            if missing:
                fields = ", ".join(missing)
                raise ValueError(f"OpenAI provider configuration is incomplete: {fields}")

        if self.retrieval_backend is RetrievalBackend.FILE_SEARCH:
            if self.profile is not EnvironmentProfile.EVALUATION:
                raise ValueError("File Search is allowed only in the evaluation profile")
            if not self.file_search_enabled:
                raise ValueError("File Search requires explicit file_search_enabled confirmation")
            if (
                self.file_search_vector_store_id is None
                or not self.file_search_vector_store_id.startswith("vs_")
            ):
                raise ValueError("File Search requires an explicit vector store ID")

        return self


class PublicSettings(BaseModel):
    """Small safe subset that may be exposed through readiness metadata."""

    model_config = ConfigDict(frozen=True)

    profile: EnvironmentProfile
    service_name: str
