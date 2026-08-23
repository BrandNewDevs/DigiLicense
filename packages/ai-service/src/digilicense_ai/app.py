"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Any
from uuid import uuid4

import structlog
from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from digilicense_ai.config import Settings
from digilicense_ai.container import ServiceContainer, build_container
from digilicense_ai.logging import configure_logging, safe_request_id, safe_request_path
from digilicense_ai.middleware import BodySizeLimitMiddleware
from digilicense_ai.schemas import AssistantMessageRequest, AssistantMessageResponse, HealthResponse
from digilicense_ai.security import ServiceSecurityMiddleware
from digilicense_ai.service import AssistantService

logger = structlog.get_logger(__name__)


def create_app(
    settings: Settings | None = None,
    container: ServiceContainer | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings()
    configure_logging(resolved_settings.log_level)
    resolved_container = container or build_container(resolved_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        del app
        yield
        await resolved_container.close()

    app = FastAPI(
        title="DigiLicense AI service",
        version="0.3.0",
        description="Private AI explanation boundary with PII protection and bounded providers.",
        lifespan=lifespan,
    )
    app.state.container = resolved_container
    app.state.ready = all(resolved_container.readiness_checks().values())
    app.state.metrics = resolved_container.metrics
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_bytes=resolved_settings.max_request_body_bytes,
    )
    app.add_middleware(
        ServiceSecurityMiddleware,
        bearer_token=(
            resolved_settings.service_bearer_token.get_secret_value()
            if resolved_settings.service_bearer_token is not None
            else None
        ),
        require_tls=resolved_settings.require_tls,
        rate_limit=resolved_settings.gateway_rate_limit_per_minute,
        trusted_proxy_ips=frozenset(resolved_settings.trusted_proxy_ips),
    )

    @app.middleware("http")
    async def sanitized_request_logging(request: Request, call_next: Any) -> Any:
        request_id = safe_request_id(request.headers.get("x-request-id")) or str(uuid4())
        request.state.request_id = request_id
        started = perf_counter()
        response = await call_next(request)
        duration_ms = round((perf_counter() - started) * 1000, 2)
        response.headers["x-request-id"] = request_id
        await logger.ainfo(
            "request_completed",
            request_id=request_id,
            method=request.method,
            path=safe_request_path(request.url.path),
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error: RequestValidationError) -> JSONResponse:
        del error
        request_id = safe_request_id(request.headers.get("x-request-id")) or str(uuid4())
        return JSONResponse(
            status_code=422,
            content={"detail": "invalid request"},
            headers={"x-request-id": request_id},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, error: Exception) -> JSONResponse:
        request_id = safe_request_id(request.headers.get("x-request-id")) or str(uuid4())
        await logger.aerror(
            "request_failed",
            request_id=request_id,
            method=request.method,
            path=safe_request_path(request.url.path),
            error_type=type(error).__name__,
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "internal service error"},
            headers={"x-request-id": request_id},
        )

    router = _build_router(resolved_settings)
    app.include_router(router)
    return app


def _build_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/v1/assistant/messages",
        response_model=AssistantMessageResponse,
        response_model_by_alias=True,
    )
    async def assistant_message(
        payload: AssistantMessageRequest,
        request: Request,
    ) -> AssistantMessageResponse:
        service = AssistantService(request.app.state.container)
        response = await service.answer(payload)
        metrics = request.app.state.metrics
        if metrics is not None:
            metrics.record_answer(
                request_id=request.state.request_id,
                intent=response.intent.value,
                source_ids=tuple(source.id for source in response.sources),
                model=settings.model_id,
                fallback_code=response.blocked_reason.value if response.blocked_reason else "none",
            )
        return response

    @router.get("/health/live", response_model=HealthResponse, response_model_by_alias=True)
    async def live() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service=settings.service_name,
            profile=settings.profile.value,
        )

    @router.get("/health/ready", response_model=HealthResponse, response_model_by_alias=True)
    async def ready(request: Request) -> HealthResponse | JSONResponse:
        container: ServiceContainer = request.app.state.container
        request.app.state.ready = all(container.readiness_checks().values())
        body = HealthResponse(
            status="ready" if request.app.state.ready else "not_ready",
            service=settings.service_name,
            profile=settings.profile.value,
            components=container.component_statuses,
        )
        if not request.app.state.ready:
            return JSONResponse(status_code=503, content=body.public_dump())
        return body

    return router
