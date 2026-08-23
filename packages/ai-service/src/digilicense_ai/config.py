"""Validated configuration profiles for the AI service."""

from enum import StrEnum
from ipaddress import ip_address
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
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
    openai_max_output_tokens: int = Field(default=500, ge=128, le=500)
    openai_request_timeout_seconds: float = Field(default=8.0, ge=1.0, le=8.0)
    openai_connect_timeout_seconds: float = Field(default=2.0, ge=0.5, le=2.0)
    openai_max_concurrency: int = Field(default=10, ge=1, le=10)
    provider_circuit_failure_threshold: int = Field(default=3, ge=1, le=10)
    provider_circuit_reset_seconds: float = Field(default=30.0, ge=1.0, le=300.0)
    gemini_api_key: SecretStr | None = Field(default=None, repr=False)
    gemini_model_id: Literal["gemini-2.5-flash-lite"] = "gemini-2.5-flash-lite"
    openai_budget_controls_confirmed: bool = False
    file_search_enabled: bool = False
    file_search_vector_store_id: str | None = Field(default=None, min_length=4, max_length=128)
    file_search_expiry_days: int = Field(default=7, ge=1, le=30)
    log_level: str = "INFO"
    service_bearer_token: SecretStr | None = Field(default=None, repr=False)
    require_tls: bool = False
    trusted_proxy_ips: tuple[str, ...] = Field(default=(), max_length=32)
    gateway_rate_limit_per_minute: int = Field(default=60, ge=1, le=60)
    provider_daily_call_limit: int = Field(default=1500, ge=1, le=1500)
    context_signing_current_key: SecretStr | None = Field(default=None, repr=False)
    context_signing_previous_key: SecretStr | None = Field(default=None, repr=False)
    context_current_key_id: str = Field(default="current", min_length=1, max_length=64)
    context_previous_key_id: str = Field(default="previous", min_length=1, max_length=64)
    context_token_ttl_seconds: int = Field(default=900, ge=60, le=86400)

    @field_validator("trusted_proxy_ips")
    @classmethod
    def trusted_proxy_ips_must_be_ips(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        for value in values:
            try:
                ip_address(value)
            except ValueError as error:
                raise ValueError("trusted_proxy_ips must contain IP addresses") from error
        return values

    @model_validator(mode="after")
    def enforce_profile_boundary(self) -> "Settings":
        if (
            self.context_signing_previous_key is not None
            and self.context_current_key_id == self.context_previous_key_id
        ):
            raise ValueError("context signing key IDs must be distinct")
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
            if (
                self.service_bearer_token is None
                or len(self.service_bearer_token.get_secret_value().strip()) < 32
            ):
                raise ValueError(
                    "production profile requires a 32-character service bearer credential"
                )
            if not self.require_tls:
                raise ValueError("production profile requires TLS")
            if (
                self.context_signing_current_key is None
                or len(self.context_signing_current_key.get_secret_value().strip()) < 32
            ):
                raise ValueError("production profile requires a 32-character context signing key")

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

        if self.provider_backend is ProviderBackend.GEMINI:
            if self.profile is not EnvironmentProfile.DEVELOPMENT:
                raise ValueError("Gemini is allowed only in the development profile")
            if self.gemini_api_key is None or not self.gemini_api_key.get_secret_value().strip():
                raise ValueError("Gemini development configuration requires gemini_api_key")

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
