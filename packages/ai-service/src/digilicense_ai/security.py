"""Service-perimeter authentication, browser rejection, and bounded quotas."""

from collections.abc import Callable
from dataclasses import dataclass, field
from hmac import compare_digest
from ipaddress import ip_address
from time import monotonic, time
from typing import Any


class SecurityRejection(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


@dataclass
class FixedWindowLimiter:
    limit: int
    window_seconds: int = 60
    clock: Callable[[], float] = monotonic
    _windows: dict[str, tuple[int, int]] = field(default_factory=dict)

    def allow(self, key: str) -> bool:
        window = int(self.clock() // self.window_seconds)
        previous_window, count = self._windows.get(key, (window, 0))
        if previous_window != window:
            count = 0
        if count >= self.limit:
            self._windows[key] = (window, count)
            return False
        self._windows[key] = (window, count + 1)
        return True


@dataclass
class DailyProviderBudget:
    limit: int
    clock: Callable[[], float] = time
    _day: int = field(default=-1, init=False)
    _calls: int = field(default=0, init=False)

    def consume(self) -> bool:
        day = int(self.clock() // 86400)
        if day != self._day:
            self._day = day
            self._calls = 0
        if self._calls >= self.limit:
            return False
        self._calls += 1
        return True

    @property
    def calls(self) -> int:
        return self._calls


def bearer_value(headers: dict[bytes, bytes]) -> str | None:
    raw = headers.get(b"authorization", b"").decode("latin-1")
    scheme, separator, token = raw.partition(" ")
    if scheme.casefold() != "bearer" or not separator or not token:
        return None
    return token


class ServiceSecurityMiddleware:
    """Reject browser-originated requests and enforce configured service credentials."""

    def __init__(
        self,
        app: Any,
        *,
        bearer_token: str | None,
        require_tls: bool,
        rate_limit: int,
        trusted_proxy_ips: frozenset[str] = frozenset(),
    ) -> None:
        self.app = app
        self.bearer_token = bearer_token
        self.require_tls = require_tls
        self.trusted_proxy_ips = trusted_proxy_ips
        self.limiter = FixedWindowLimiter(rate_limit)
        self.peer_limiter = FixedWindowLimiter(rate_limit)

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        path = scope.get("path", "")
        if headers.get(b"origin") is not None or scope.get("method") == "OPTIONS":
            await self._reject(send, 403, "browser access is not permitted")
            return
        if self.require_tls and not self._is_loopback_health_request(scope):
            if self._effective_scheme(scope, headers) != "https":
                await self._reject(send, 426, "TLS is required")
                return
        if path == "/v1/assistant/messages":
            content_type = headers.get(b"content-type", b"").split(b";", 1)[0]
            if content_type != b"application/json":
                await self._reject(send, 415, "application/json is required")
                return
            client = scope.get("client")
            peer = (
                str(client[0])[:64] if isinstance(client, (tuple, list)) and client else "unknown"
            )
            if not self.peer_limiter.allow(f"peer:{peer}"):
                await self._reject(send, 429, "service rate limit exceeded")
                return
            token = bearer_value(headers)
            if self.bearer_token is not None:
                if token is None or not compare_digest(token, self.bearer_token):
                    await self._reject(send, 401, "service authorization required")
                    return
                if not self.limiter.allow("credential"):
                    await self._reject(send, 429, "service rate limit exceeded")
                    return
        await self.app(scope, receive, send)

    def _effective_scheme(self, scope: dict[str, Any], headers: dict[bytes, bytes]) -> str:
        if scope.get("scheme") == "https":
            return "https"
        peer = self._peer_address(scope)
        forwarded = headers.get(b"x-forwarded-proto", b"").decode("latin-1").strip().casefold()
        if peer in self.trusted_proxy_ips and forwarded == "https":
            return "https"
        return "http"

    def _is_loopback_health_request(self, scope: dict[str, Any]) -> bool:
        return scope.get("path") in {"/health/live", "/health/ready"} and self._is_loopback_peer(
            self._peer_address(scope)
        )

    @staticmethod
    def _peer_address(scope: dict[str, Any]) -> str:
        client = scope.get("client")
        return str(client[0]) if isinstance(client, (tuple, list)) and client else ""

    @staticmethod
    def _is_loopback_peer(peer: str) -> bool:
        try:
            return ip_address(peer).is_loopback
        except ValueError:
            return False

    @staticmethod
    async def _reject(send: Any, status_code: int, detail: str) -> None:
        body = (f'{{"detail":"{detail}"}}').encode()
        await send(
            {
                "type": "http.response.start",
                "status": status_code,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": body})
