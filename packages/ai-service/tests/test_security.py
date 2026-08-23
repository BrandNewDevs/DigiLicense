import pytest
from httpx import ASGITransport, AsyncClient

from digilicense_ai.app import create_app
from digilicense_ai.config import EnvironmentProfile, Settings
from digilicense_ai.context import SignedSemanticContextManager
from digilicense_ai.schemas import CanonicalIntent, ContextSeed, Locale, Topic
from digilicense_ai.security import DailyProviderBudget, FixedWindowLimiter


class Clock:
    def __init__(self, value: float = 100.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value


def _seed() -> ContextSeed:
    return ContextSeed(
        last_intent=CanonicalIntent.WAITLIST_EXPLANATION,
        topic=Topic.WAITLIST,
        locale=Locale.ENGLISH,
    )


def test_signed_context_accepts_current_and_previous_key_during_rotation() -> None:
    clock = Clock()
    old = SignedSemanticContextManager(
        current_key="old-secret",
        current_key_id="old",
        previous_key=None,
        previous_key_id="unused",
        ttl_seconds=60,
        clock=clock,
    )
    token = old.issue(_seed())
    rotated = SignedSemanticContextManager(
        current_key="new-secret",
        current_key_id="new",
        previous_key="old-secret",
        previous_key_id="old",
        ttl_seconds=60,
        clock=clock,
    )

    assert rotated.resolve(token) == old.resolve(token)
    assert rotated.resolve(token + "tampered") is None


def test_signed_context_expires() -> None:
    clock = Clock()
    manager = SignedSemanticContextManager(
        current_key="secret",
        current_key_id="current",
        previous_key=None,
        previous_key_id="unused",
        ttl_seconds=60,
        clock=clock,
    )
    token = manager.issue(_seed())
    clock.value += 61

    assert manager.resolve(token) is None


def test_fixed_window_and_daily_provider_limits() -> None:
    clock = Clock()
    limiter = FixedWindowLimiter(limit=2, clock=clock)
    budget = DailyProviderBudget(limit=2, clock=clock)

    assert [limiter.allow("credential") for _ in range(3)] == [True, True, False]
    assert [budget.consume() for _ in range(3)] == [True, True, False]
    clock.value += 61
    assert limiter.allow("credential") is True
    clock.value += 86400
    assert budget.consume() is True


@pytest.mark.parametrize(
    ("headers", "content", "expected"),
    [
        ({}, None, 401),
        ({"authorization": "Bearer wrong"}, None, 401),
        ({"authorization": "Bearer secret", "origin": "https://browser.invalid"}, None, 403),
        ({"authorization": "Bearer secret", "content-type": "text/plain"}, "{}", 415),
    ],
)
async def test_service_perimeter_rejects_unsafe_requests(
    headers: dict[str, str], content: str | None, expected: int
) -> None:
    app = create_app(
        settings=Settings(
            profile=EnvironmentProfile.TEST,
            service_bearer_token="secret",
            gateway_rate_limit_per_minute=60,
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/assistant/messages",
            headers=headers,
            content=content,
            json=None
            if content is not None
            else {
                "question": "How long will it take?",
                "locale": "en",
                "service": "permanent-driving-licence",
                "page": "appointment-waitlist",
                "reasonCode": "NO_MATCHING_SLOT",
            },
        )
    assert response.status_code == expected


async def test_service_perimeter_accepts_authenticated_json() -> None:
    app = create_app(
        settings=Settings(
            profile=EnvironmentProfile.TEST,
            service_bearer_token="secret",
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/assistant/messages",
            headers={"authorization": "Bearer secret"},
            json={
                "question": "How long will it take?",
                "locale": "en",
                "service": "permanent-driving-licence",
                "page": "appointment-waitlist",
                "reasonCode": "NO_MATCHING_SLOT",
            },
        )
    assert response.status_code == 200
