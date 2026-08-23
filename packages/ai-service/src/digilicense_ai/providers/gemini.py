"""Development-only Gemini smoke-test adapter for canonical public content."""

import asyncio
from inspect import isawaitable
from time import perf_counter
from typing import Any, Protocol, cast

import structlog
from pydantic import ValidationError

from digilicense_ai.components import DlpGateway
from digilicense_ai.config import EnvironmentProfile, Settings
from digilicense_ai.providers.contracts import (
    canonical_input,
    localized_instructions,
    validated_result,
)
from digilicense_ai.providers.errors import ProviderFailure, ProviderFailureReason
from digilicense_ai.schemas import CanonicalProviderRequest, DlpScope, ProviderResult

logger = structlog.get_logger(__name__)


class _GeminiModels(Protocol):
    async def generate_content(self, **kwargs: Any) -> Any: ...


class _GeminiAsyncClient(Protocol):
    @property
    def models(self) -> _GeminiModels: ...

    def aclose(self) -> Any: ...


class GeminiClient(Protocol):
    @property
    def aio(self) -> _GeminiAsyncClient: ...


class _Response:
    def __init__(self, output_text: str) -> None:
        self.output_text = output_text
        self.status = "completed"


class GeminiProvider:
    """Never-selected-in-production adapter kept solely for development smoke checks."""

    def __init__(
        self,
        *,
        client: GeminiClient,
        model_id: str,
        max_output_tokens: int,
        request_timeout_seconds: float,
        payload_dlp: DlpGateway,
        max_concurrency: int = 10,
    ) -> None:
        self._client = client
        self._model_id = model_id
        self._max_output_tokens = max_output_tokens
        self._request_timeout_seconds = request_timeout_seconds
        self._payload_dlp = payload_dlp
        self._semaphore = asyncio.Semaphore(max_concurrency)

    @classmethod
    def from_settings(cls, settings: Settings, *, payload_dlp: DlpGateway) -> "GeminiProvider":
        if settings.profile is not EnvironmentProfile.DEVELOPMENT:
            raise ValueError("Gemini provider is development-only")
        if settings.gemini_api_key is None:
            raise ValueError("Gemini provider settings were not validated")
        try:
            from google import genai  # type: ignore[import-not-found]
        except ImportError as error:
            raise RuntimeError("install the optional gemini dependency group") from error

        client = cast(
            GeminiClient,
            genai.Client(api_key=settings.gemini_api_key.get_secret_value()),
        )
        return cls(
            client=client,
            model_id=settings.gemini_model_id,
            max_output_tokens=settings.openai_max_output_tokens,
            request_timeout_seconds=settings.openai_request_timeout_seconds,
            payload_dlp=payload_dlp,
            max_concurrency=settings.openai_max_concurrency,
        )

    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult:
        if not isinstance(request, CanonicalProviderRequest):
            raise TypeError("GeminiProvider accepts only CanonicalProviderRequest")

        payload = canonical_input(request)
        started = perf_counter()
        try:
            dlp_result = await self._payload_dlp.analyze(payload, scope=DlpScope.PROVIDER_PAYLOAD)
            if not dlp_result.provider_allowed:
                raise ProviderFailure(ProviderFailureReason.UNSAFE_PAYLOAD)
        except ProviderFailure:
            await self._log_failure(started, ProviderFailureReason.UNSAFE_PAYLOAD)
            raise
        except Exception:
            await self._log_failure(started, ProviderFailureReason.UNSAFE_PAYLOAD)
            raise ProviderFailure(ProviderFailureReason.UNSAFE_PAYLOAD) from None

        try:
            async with asyncio.timeout(self._request_timeout_seconds):
                async with self._semaphore:
                    raw_response = await self._client.aio.models.generate_content(
                        model=self._model_id,
                        contents=payload,
                        config={
                            "system_instruction": localized_instructions(request.locale),
                            "response_mime_type": "application/json",
                            "response_schema": ProviderResult,
                            "max_output_tokens": self._max_output_tokens,
                            "temperature": 0,
                            "tools": [],
                        },
                    )
            output_text = getattr(raw_response, "text", None)
            if not isinstance(output_text, str):
                raise ValueError("Gemini response did not contain text")
            response = _Response(output_text)
            result = validated_result(response, request)
        except TimeoutError:
            await self._log_failure(started, ProviderFailureReason.TIMEOUT)
            raise ProviderFailure(ProviderFailureReason.TIMEOUT) from None
        except Exception as error:
            reason = _classify_error(error)
            await self._log_failure(started, reason)
            raise ProviderFailure(reason) from None

        await logger.ainfo(
            "gemini_provider_completed",
            model=self._model_id,
            duration_ms=round((perf_counter() - started) * 1000, 2),
            fallback=False,
        )
        return result

    async def close(self) -> None:
        close_result = self._client.aio.aclose()
        if isawaitable(close_result):
            await close_result

    async def _log_failure(self, started: float, reason: ProviderFailureReason) -> None:
        await logger.awarning(
            "gemini_provider_failed",
            model=self._model_id,
            reason=reason.value,
            duration_ms=round((perf_counter() - started) * 1000, 2),
            fallback=True,
        )


def _classify_error(error: Exception) -> ProviderFailureReason:
    if isinstance(error, ProviderFailure):
        return error.reason
    if isinstance(error, (ValidationError, ValueError)):
        return ProviderFailureReason.INVALID_OUTPUT
    if isinstance(error, TimeoutError):
        return ProviderFailureReason.TIMEOUT
    return ProviderFailureReason.UNAVAILABLE
