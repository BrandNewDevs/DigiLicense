"""External model-provider adapters."""

from digilicense_ai.providers.errors import ProviderFailure, ProviderFailureReason
from digilicense_ai.providers.gemini import GeminiProvider
from digilicense_ai.providers.openai import OpenAIProvider

__all__ = ["GeminiProvider", "OpenAIProvider", "ProviderFailure", "ProviderFailureReason"]
