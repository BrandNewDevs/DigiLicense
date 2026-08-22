import asyncio
from statistics import quantiles
from time import perf_counter

import pytest

from digilicense_ai.dlp import LocalDlpGateway
from digilicense_ai.dlp.recognizers import build_recognizer_registry, find_structured_pii


def _p95(samples: list[float]) -> float:
    return quantiles(samples, n=20)[18]


@pytest.mark.performance
def test_critical_recognizer_p95_is_below_ten_milliseconds() -> None:
    samples: list[float] = []
    registry = build_recognizer_registry()

    for _ in range(250):
        started = perf_counter()
        findings = find_structured_pii("My PAN is ABCDE1234F", registry)
        samples.append((perf_counter() - started) * 1000)
        assert findings

    assert _p95(samples) < 10


@pytest.mark.performance
async def test_full_dlp_p95_is_below_fifty_milliseconds(
    local_dlp_gateway: LocalDlpGateway,
) -> None:
    text = "How long is the learner licence waiting period in Delhi?"
    for _ in range(5):
        await local_dlp_gateway.analyze(text)

    samples: list[float] = []
    for _ in range(40):
        started = perf_counter()
        result = await local_dlp_gateway.analyze(text)
        samples.append((perf_counter() - started) * 1000)
        assert result.provider_allowed is True

    assert _p95(samples) < 50


@pytest.mark.performance
async def test_dlp_handles_twenty_concurrent_prototype_users(
    local_dlp_gateway: LocalDlpGateway,
) -> None:
    started = perf_counter()
    results = await asyncio.gather(
        *(
            local_dlp_gateway.analyze(
                f"How does public waitlist guidance work for test case {index}?"
            )
            for index in range(20)
        )
    )
    duration_seconds = perf_counter() - started

    assert all(result.provider_allowed for result in results)
    assert duration_seconds < 1
