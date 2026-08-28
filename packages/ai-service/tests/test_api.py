from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from digilicense_ai import app as app_module
from digilicense_ai.app import create_app
from digilicense_ai.config import EnvironmentProfile, RetrievalBackend, Settings
from digilicense_ai.container import ServiceContainer
from digilicense_ai.fakes import (
    FakeDlpGateway,
    FakeIntentRouter,
    FakeProvider,
    FakeSemanticContextManager,
)
from digilicense_ai.metrics import SanitizedMetrics
from digilicense_ai.schemas import RetrievalQuery


class FailingRetriever:
    async def retrieve(self, query: RetrievalQuery) -> tuple[()]:
        del query
        raise RuntimeError("synthetic retrieval failure")


async def test_fake_end_to_end_path(
    client: AsyncClient,
    valid_payload: dict[str, object],
) -> None:
    response = await client.post("/v1/assistant/messages", json=valid_payload)

    assert response.status_code == 200
    assert response.headers["x-request-id"]
    assert response.json() == {
        "answer": (
            "This is deterministic guidance. No external AI service was called. "
            "This is simulated prototype behavior."
        ),
        "intent": "NO_APPOINTMENT_EXPLANATION",
        "sources": [
            {
                "id": "digilicense-prototype-behavior-v1",
                "title": "DigiLicense prototype behavior",
            }
        ],
        "uncertain": False,
        "escalation": None,
        "fallbackUsed": False,
        "blockedReason": None,
        "contextToken": None,
    }


async def test_hindi_fake_response(
    client: AsyncClient,
    valid_payload: dict[str, object],
) -> None:
    valid_payload["locale"] = "hi"
    response = await client.post("/v1/assistant/messages", json=valid_payload)

    assert response.status_code == 200
    assert "बाहरी AI सेवा" in response.json()["answer"]


async def test_unknown_request_field_is_rejected(
    client: AsyncClient,
    valid_payload: dict[str, object],
) -> None:
    valid_payload["userId"] = "must-not-be-accepted"

    response = await client.post("/v1/assistant/messages", json=valid_payload)

    assert response.status_code == 422


async def test_question_longer_than_500_characters_is_rejected(
    client: AsyncClient,
    valid_payload: dict[str, object],
) -> None:
    valid_payload["question"] = "x" * 501

    response = await client.post("/v1/assistant/messages", json=valid_payload)

    assert response.status_code == 422


async def test_blank_question_is_rejected(
    client: AsyncClient,
    valid_payload: dict[str, object],
) -> None:
    valid_payload["question"] = "   "

    response = await client.post("/v1/assistant/messages", json=valid_payload)

    assert response.status_code == 422


async def test_invalid_enum_is_rejected(
    client: AsyncClient,
    valid_payload: dict[str, object],
) -> None:
    valid_payload["locale"] = "fr"

    response = await client.post("/v1/assistant/messages", json=valid_payload)

    assert response.status_code == 422
    assert response.json() == {"detail": "invalid request"}


async def test_request_body_larger_than_limit_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        "/v1/assistant/messages",
        content=b"x" * 4097,
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "request body too large"}


async def test_health_endpoints(client: AsyncClient) -> None:
    live = await client.get("/health/live")
    ready = await client.get("/health/ready")

    assert live.status_code == 200
    assert live.json()["status"] == "ok"
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"
    assert ready.json()["components"] == {
        "dlp": "fake",
        "context": "fake",
        "intent": "fake",
        "retrieval": "fake",
        "provider": "fake",
    }


async def test_not_ready_returns_503(client: AsyncClient, app: FastAPI) -> None:
    app.state.ready = False

    response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"


async def test_bm25_startup_is_reported_ready() -> None:
    app = create_app(
        settings=Settings(profile=EnvironmentProfile.TEST, retrieval_backend=RetrievalBackend.BM25)
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        response = await test_client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["components"]["retrieval"] == "bm25"


async def test_retrieval_failure_emits_sanitized_telemetry(
    valid_payload: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    metrics = SanitizedMetrics()
    app = create_app(
        settings=Settings(profile=EnvironmentProfile.TEST),
        container=ServiceContainer(
            settings=Settings(profile=EnvironmentProfile.TEST),
            dlp=FakeDlpGateway(),
            context=FakeSemanticContextManager(),
            intent=FakeIntentRouter(),
            retriever=FailingRetriever(),
            provider=FakeProvider(),
            metrics=metrics,
        ),
    )
    safe_logger = AsyncMock()
    monkeypatch.setattr(app_module, "logger", safe_logger)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/assistant/messages",
            headers={"x-request-id": "retrieval-test"},
            json=valid_payload,
        )

    assert response.json()["blockedReason"] == "RETRIEVAL_UNAVAILABLE"
    assert {
        "request_id": "retrieval-test",
        "dependency": "retrieval",
        "category": "error",
    } in metrics.events()
    assert safe_logger.awarning.await_args.kwargs == {
        "request_id": "retrieval-test",
        "dependency": "retrieval",
        "category": "error",
    }
    assert valid_payload["question"] not in str(safe_logger.method_calls)
