from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from digilicense_ai.app import create_app
from digilicense_ai.config import EnvironmentProfile, Settings
from digilicense_ai.dlp import LocalDlpGateway


@pytest.fixture
def settings() -> Settings:
    return Settings(profile=EnvironmentProfile.TEST)


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings=settings)


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client


@pytest.fixture
def valid_payload() -> dict[str, object]:
    return {
        "question": "Why can I not book my driving test?",
        "locale": "en",
        "service": "permanent-driving-licence",
        "page": "appointment-waitlist",
        "reasonCode": "NO_MATCHING_SLOT",
    }


@pytest.fixture(scope="session")
def local_dlp_gateway() -> LocalDlpGateway:
    return LocalDlpGateway.create()
