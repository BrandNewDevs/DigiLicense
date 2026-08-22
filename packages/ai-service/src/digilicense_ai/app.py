"""FastAPI application factory."""

from time import perf_counter
from typing import Any
from uuid import uuid4

import structlog
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse

from digilicense_ai.config import Settings
from digilicense_ai.container import ServiceContainer, build_container
from digilicense_ai.logging import configure_logging, safe_request_id
from digilicense_ai.middleware import BodySizeLimitMiddleware
from digilicense_ai.schemas import AssistantMessageRequest, AssistantMessageResponse, HealthResponse
from digilicense_ai.service import AssistantService

logger = structlog.get_logger(__name__)


def create_app(
    settings: Settings | None = None,
    container: ServiceContainer | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings()
    configure_logging(resolved_settings.log_level)
    resolved_container = container or build_container(resolved_settings)

    app = FastAPI(
        title="DigiLicense AI service",
        version="0.1.0",
        description="Private AI explanation boundary. Phase 0 uses deterministic fake components.",
    )
    app.state.container = resolved_container
    app.state.ready = True
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_bytes=resolved_settings.max_request_body_bytes,
    )

    @app.middleware("http")
    async def sanitized_request_logging(request: Request, call_next: Any) -> Any:
        request_id = safe_request_id(request.headers.get("x-request-id")) or str(uuid4())
        started = perf_counter()
        response = await call_next(request)
        duration_ms = round((perf_counter() - started) * 1000, 2)
        response.headers["x-request-id"] = request_id
        await logger.ainfo(
            "request_completed",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, error: Exception) -> JSONResponse:
        request_id = safe_request_id(request.headers.get("x-request-id")) or str(uuid4())
        await logger.aerror(
            "request_failed",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
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
        return await service.answer(payload)

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
