"""Signed, non-conversational semantic context tokens with key rotation."""

import base64
import hashlib
import hmac
import json
from collections.abc import Callable, Mapping
from time import time

from digilicense_ai.config import Settings
from digilicense_ai.schemas import ContextSeed, SemanticContext


class SignedSemanticContextManager:
    def __init__(
        self,
        *,
        current_key: str,
        current_key_id: str,
        previous_key: str | None,
        previous_key_id: str,
        ttl_seconds: int,
        clock: Callable[[], float] = time,
    ) -> None:
        self._keys: dict[str, bytes] = {current_key_id: current_key.encode()}
        if previous_key:
            self._keys[previous_key_id] = previous_key.encode()
        self._current_key_id = current_key_id
        self._ttl_seconds = ttl_seconds
        self._clock = clock

    @classmethod
    def from_settings(cls, settings: Settings) -> "SignedSemanticContextManager":
        if settings.context_signing_current_key is None:
            raise ValueError("context signing key was not validated")
        return cls(
            current_key=settings.context_signing_current_key.get_secret_value(),
            current_key_id=settings.context_current_key_id,
            previous_key=(
                settings.context_signing_previous_key.get_secret_value()
                if settings.context_signing_previous_key is not None
                else None
            ),
            previous_key_id=settings.context_previous_key_id,
            ttl_seconds=settings.context_token_ttl_seconds,
        )

    def issue(self, seed: ContextSeed) -> str:
        now = int(self._clock())
        context = SemanticContext(
            **seed.public_dump(),
            issued_at=now,
            expires_at=now + self._ttl_seconds,
            key_id=self._current_key_id,
        )
        payload = _encode_json(context.public_dump())
        signature = self._sign(self._current_key_id, payload)
        return f"{payload}.{signature}"

    def resolve(self, token: str | None) -> SemanticContext | None:
        if not token or token.count(".") != 1:
            return None
        payload, signature = token.split(".", 1)
        try:
            raw = _decode_json(payload)
            key_id = str(raw["keyId"])
            expected = self._sign(key_id, payload)
            if not hmac.compare_digest(expected, signature):
                return None
            context = SemanticContext.model_validate(raw)
            now = int(self._clock())
            if context.expires_at <= now or context.issued_at > now:
                return None
            return context
        except (KeyError, ValueError, TypeError, json.JSONDecodeError):
            return None

    def _sign(self, key_id: str, payload: str) -> str:
        key = self._keys.get(key_id)
        if key is None:
            return ""
        signature = hmac.new(key, payload.encode(), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")


def _encode_json(value: Mapping[str, object]) -> str:
    return base64.urlsafe_b64encode(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    ).decode("ascii").rstrip("=")


def _decode_json(value: str) -> dict[str, object]:
    padded = value + "=" * (-len(value) % 4)
    decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
    parsed = json.loads(decoded)
    if not isinstance(parsed, dict):
        raise ValueError("context payload must be an object")
    return parsed
