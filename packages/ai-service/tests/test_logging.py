import logging

import pytest
from httpx import AsyncClient

from digilicense_ai.logging import safe_request_id, sanitized_event


def test_request_id_accepts_only_bounded_safe_characters() -> None:
    assert safe_request_id("request-123") == "request-123"
    assert safe_request_id("contains a space") is None
    assert safe_request_id("x" * 65) is None


def test_structured_event_includes_only_explicit_metadata() -> None:
    sentinel = "raw-question-must-not-appear"

    event = sanitized_event("request_completed", method="POST", status_code=200)

    assert sentinel not in str(event)
    assert event == {"event": "request_completed", "method": "POST", "status_code": 200}


async def test_request_log_excludes_question_content(
    client: AsyncClient,
    valid_payload: dict[str, object],
    caplog: pytest.LogCaptureFixture,
) -> None:
    sentinel = "raw-question-must-not-enter-logs"
    valid_payload["question"] = sentinel

    logging.getLogger().setLevel(logging.INFO)
    response = await client.post("/v1/assistant/messages", json=valid_payload)

    assert response.status_code == 200
    log_text = caplog.text
    assert "request_completed" in log_text
    assert sentinel not in log_text
