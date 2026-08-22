from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from digilicense_ai.app import create_app
from digilicense_ai.config import EnvironmentProfile, RetrievalBackend, Settings


async def test_fake_end_to_end_path(
    client: AsyncClient,
    valid_payload: dict[str, object],
) -> None:
    response = await client.post("/v1/assistant/messages", json=valid_payload)

    assert response.status_code == 200
    assert response.headers["x-request-id"]
    assert response.json() == {
        "answer": "This is deterministic Phase 0 guidance. No external AI service was called.",
        "intent": "NO_APPOINTMENT_EXPLANATION",
        "sources": [
            {
                "id": "phase0-public-guidance",
                "title": "Phase 0 public guidance fixture",
                "url": "https://example.invalid/digilicense/phase-0-guidance",
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
