"""OpenAI Responses API adapter for canonical public-only requests."""

import asyncio
from time import perf_counter
from typing import Any, Protocol, cast

import httpx
import structlog
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    RateLimitError,
)
from pydantic import ValidationError

from digilicense_ai.components import DlpGateway
from digilicense_ai.config import Settings
from digilicense_ai.providers.circuit import ProviderCircuitBreaker
from digilicense_ai.providers.contracts import INSTRUCTIONS, canonical_input, validated_result
from digilicense_ai.providers.errors import ProviderFailure, ProviderFailureReason
from digilicense_ai.schemas import CanonicalProviderRequest, DlpScope, ProviderResult

logger = structlog.get_logger(__name__)

class _ResponsesResource(Protocol):
    async def create(self, **kwargs: Any) -> Any: ...


class OpenAIClient(Protocol):
    @property
    def responses(self) -> _ResponsesResource: ...

    async def close(self) -> None: ...


class _Usage(Protocol):
    input_tokens: int
    output_tokens: int


class _Response(Protocol):
    model: str
    output_text: str
    status: str
    usage: _Usage | None


class OpenAIProvider:
    """Bounded, non-retrying adapter which never accepts a raw assistant request."""

    def __init__(
        self,
        *,
        client: OpenAIClient,
        model_id: str,
        max_output_tokens: int,
        request_timeout_seconds: float,
        max_concurrency: int,
        payload_dlp: DlpGateway,
        circuit_breaker: ProviderCircuitBreaker,
    ) -> None:
        self._client = client
        self._model_id = model_id
        self._max_output_tokens = max_output_tokens
        self._request_timeout_seconds = request_timeout_seconds
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._payload_dlp = payload_dlp
        self._circuit_breaker = circuit_breaker

    @classmethod
    def from_settings(cls, settings: Settings, *, payload_dlp: DlpGateway) -> "OpenAIProvider":
        if settings.openai_api_key is None or settings.openai_project_id is None:
            raise ValueError("OpenAI provider settings were not validated")

        timeout = httpx.Timeout(
            settings.openai_request_timeout_seconds,
            connect=settings.openai_connect_timeout_seconds,
        )
        client = cast(
            OpenAIClient,
            AsyncOpenAI(
                api_key=settings.openai_api_key.get_secret_value(),
                project=settings.openai_project_id,
                timeout=timeout,
                max_retries=0,
            ),
        )
        return cls(
            client=client,
            model_id=settings.model_id,
            max_output_tokens=settings.openai_max_output_tokens,
            request_timeout_seconds=settings.openai_request_timeout_seconds,
            max_concurrency=settings.openai_max_concurrency,
            payload_dlp=payload_dlp,
            circuit_breaker=ProviderCircuitBreaker(
                failure_threshold=settings.provider_circuit_failure_threshold,
                reset_seconds=settings.provider_circuit_reset_seconds,
            ),
        )

    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult:
        if not isinstance(request, CanonicalProviderRequest):
            raise TypeError("OpenAIProvider accepts only CanonicalProviderRequest")

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
            await self._circuit_breaker.allow_request()
        except ProviderFailure:
            await self._log_failure(started, ProviderFailureReason.CIRCUIT_OPEN)
            raise

        try:
            async with asyncio.timeout(self._request_timeout_seconds):
                async with self._semaphore:
                    raw_response = await self._client.responses.create(
                        model=self._model_id,
                        instructions=INSTRUCTIONS,
                        input=payload,
                        max_output_tokens=self._max_output_tokens,
                        store=False,
                        background=False,
                        reasoning={"effort": "none"},
                        tools=[],
                        parallel_tool_calls=False,
                        text={
                            "format": {
                                "type": "json_schema",
                                "name": "digilicense_provider_result",
                                "schema": ProviderResult.model_json_schema(by_alias=True),
                                "strict": True,
                            }
                        },
                    )
            response = cast(_Response, raw_response)
            result = validated_result(response, request)
            await self._circuit_breaker.record_success()
        except asyncio.CancelledError:
            await self._circuit_breaker.release_recovery_probe()
            raise
        except TimeoutError:
            await self._circuit_breaker.record_failure()
            await self._log_failure(started, ProviderFailureReason.TIMEOUT)
            raise ProviderFailure(ProviderFailureReason.TIMEOUT) from None
        except Exception as error:
            reason = _classify_error(error)
            await self._circuit_breaker.record_failure()
            await self._log_failure(started, reason)
            raise ProviderFailure(reason) from None

        usage = response.usage
        await logger.ainfo(
            "openai_provider_completed",
            model=self._model_id,
            input_tokens=usage.input_tokens if usage is not None else None,
            output_tokens=usage.output_tokens if usage is not None else None,
            duration_ms=round((perf_counter() - started) * 1000, 2),
            fallback=False,
        )
        return result

    async def close(self) -> None:
        await self._client.close()

    async def _log_failure(
        self,
        started: float,
        reason: ProviderFailureReason,
    ) -> None:
        await logger.awarning(
            "openai_provider_failed",
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
    if isinstance(error, (APITimeoutError, TimeoutError)):
        return ProviderFailureReason.TIMEOUT
    if isinstance(error, RateLimitError):
        return ProviderFailureReason.RATE_LIMITED
    if isinstance(error, APIConnectionError):
        return ProviderFailureReason.NETWORK
    if isinstance(error, APIStatusError):
        return ProviderFailureReason.UNAVAILABLE
    return ProviderFailureReason.UNAVAILABLE
