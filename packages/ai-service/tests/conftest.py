from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from digilicense_ai.app import create_app
from digilicense_ai.config import EnvironmentProfile, Settings


@pytest.fixture
def settings() -> Settings:
    """Create test-environment application settings.
    
    Returns:
        Settings: Configuration using the test environment profile.
    """
    return Settings(profile=EnvironmentProfile.TEST)


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    """Create the FastAPI application configured with the provided settings.
    
    Parameters:
    	settings (Settings): Application configuration.
    
    Returns:
    	FastAPI: The configured FastAPI application.
    """
    return create_app(settings=settings)


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    """
    Provide an asynchronous HTTP client configured for the FastAPI application.
    
    Yields:
        AsyncClient: An HTTPX client for sending requests to the application.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client


@pytest.fixture
def valid_payload() -> dict[str, object]:
    """
    Provide a representative valid request payload for testing.
    
    Returns:
    	dict[str, object]: A payload containing a question, locale, service, page, and reason code.
    """
    return {
        "question": "Why can I not book my driving test?",
        "locale": "en",
        "service": "permanent-driving-licence",
        "page": "appointment-waitlist",
        "reasonCode": "NO_MATCHING_SLOT",
    }
