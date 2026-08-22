"""OpenAI Responses API adapter for canonical public-only requests."""

import asyncio
import json
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

from digilicense_ai.config import Settings
from digilicense_ai.providers.errors import ProviderFailure, ProviderFailureReason
from digilicense_ai.schemas import CanonicalIntent, CanonicalProviderRequest, ProviderResult

logger = structlog.get_logger(__name__)

_INSTRUCTIONS = """You are the DigiLicense public-guidance explanation provider.
Use only the supplied reviewed public evidence. Do not infer eligibility, inspect identity,
perform actions, or claim government affiliation. Answer in the requested locale. Every sourceId
must exactly match a supplied evidence sourceId. If evidence is insufficient, set uncertain true.
Return only the required structured response."""


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
    ) -> None:
        self._client = client
        self._model_id = model_id
        self._max_output_tokens = max_output_tokens
        self._request_timeout_seconds = request_timeout_seconds
        self._semaphore = asyncio.Semaphore(max_concurrency)

    @classmethod
    def from_settings(cls, settings: Settings) -> "OpenAIProvider":
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
        )

    async def generate(self, request: CanonicalProviderRequest) -> ProviderResult:
        if not isinstance(request, CanonicalProviderRequest):
            raise TypeError("OpenAIProvider accepts only CanonicalProviderRequest")

        started = perf_counter()
        try:
            async with asyncio.timeout(self._request_timeout_seconds):
                async with self._semaphore:
                    raw_response = await self._client.responses.create(
                        model=self._model_id,
                        instructions=_INSTRUCTIONS,
                        input=_canonical_input(request),
                        max_output_tokens=self._max_output_tokens,
                        store=False,
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
            result = _validated_result(response, request)
        except TimeoutError:
            await self._log_failure(started, ProviderFailureReason.TIMEOUT)
            raise ProviderFailure(ProviderFailureReason.TIMEOUT) from None
        except Exception as error:
            reason = _classify_error(error)
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


def _canonical_input(request: CanonicalProviderRequest) -> str:
    """Serialize only the canonical request contract; raw text is structurally unavailable."""

    return json.dumps(request.public_dump(), ensure_ascii=False, separators=(",", ":"))


def _validated_result(
    response: _Response,
    request: CanonicalProviderRequest,
) -> ProviderResult:
    if response.status != "completed" or not response.output_text:
        raise ValueError("provider response did not complete")

    result = ProviderResult.model_validate_json(response.output_text)
    allowed_source_ids = {chunk.source_id for chunk in request.evidence}
    returned_source_ids = set(result.source_ids)
    if len(returned_source_ids) != len(result.source_ids):
        raise ValueError("provider returned duplicate source IDs")
    if not returned_source_ids.issubset(allowed_source_ids):
        raise ValueError("provider returned a source ID outside supplied evidence")
    if request.intent is not CanonicalIntent.UNSUPPORTED_QUESTION and not returned_source_ids:
        raise ValueError("grounded provider response omitted its source")
    return result


def _classify_error(error: Exception) -> ProviderFailureReason:
    if isinstance(error, ProviderFailure):
        return error.reason
    if isinstance(error, (ValidationError, json.JSONDecodeError, ValueError)):
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
