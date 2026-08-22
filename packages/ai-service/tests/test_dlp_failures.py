import time

import pytest

from digilicense_ai.dlp import DlpInitializationError, LocalDlpGateway
from digilicense_ai.schemas import DlpAction


def test_initialization_failure_is_sanitized(monkeypatch: pytest.MonkeyPatch) -> None:
    sentinel = "model-path-with-sensitive-sentinel"

    def fail_to_initialize(model_name: str) -> None:
        raise RuntimeError(f"failed at {sentinel}: {model_name}")

    monkeypatch.setattr(
        "digilicense_ai.dlp.gateway.build_presidio_analyzer",
        fail_to_initialize,
    )

    with pytest.raises(DlpInitializationError) as captured:
        LocalDlpGateway.create()

    assert str(captured.value) == "local DLP initialization failed"
    assert sentinel not in str(captured.value)


async def test_analysis_failure_fails_closed(
    local_dlp_gateway: LocalDlpGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sentinel = "raw-sensitive-analysis-sentinel"

    def fail_analysis(text: str) -> None:
        raise RuntimeError(f"analysis failed for {sentinel}: {text}")

    monkeypatch.setattr(local_dlp_gateway, "_analyze_contextual", fail_analysis)

    result = await local_dlp_gateway.analyze("otherwise benign question")

    assert result.action is DlpAction.FAIL_CLOSED
    assert result.safe_routing_text == ""
    assert sentinel not in str(result)


async def test_analysis_timeout_fails_closed(
    local_dlp_gateway: LocalDlpGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def slow_analysis(text: str) -> tuple[object, ...]:
        del text
        time.sleep(0.05)
        return ()

    gateway = LocalDlpGateway(local_dlp_gateway._analyzer, timeout_ms=10)
    monkeypatch.setattr(gateway, "_analyze_contextual", slow_analysis)

    result = await gateway.analyze("otherwise benign question")

    assert result.action is DlpAction.FAIL_CLOSED
    assert result.provider_allowed is False
