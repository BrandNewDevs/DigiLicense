"""Validated configuration profiles for the AI service."""

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator
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
    model_id: str = "gpt-5.4-mini-2026-03-17"
    log_level: str = "INFO"

    @model_validator(mode="after")
    def enforce_profile_boundary(self) -> "Settings":
        if self.profile is not EnvironmentProfile.PRODUCTION:
            return self

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
        return self


class PublicSettings(BaseModel):
    """Small safe subset that may be exposed through readiness metadata."""

    model_config = ConfigDict(frozen=True)

    profile: EnvironmentProfile
    service_name: str
