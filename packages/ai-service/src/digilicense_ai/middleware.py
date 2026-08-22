"""HTTP safeguards used before FastAPI request parsing."""

import json
from collections.abc import Awaitable, Callable
from typing import Any

ASGIMessage = dict[str, Any]
ASGIReceive = Callable[[], Awaitable[ASGIMessage]]
ASGISend = Callable[[ASGIMessage], Awaitable[None]]
ASGIScope = dict[str, Any]


class RequestBodyTooLargeError(Exception):
    pass


class BodySizeLimitMiddleware:
    def __init__(self, app: Any, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: ASGIScope, receive: ASGIReceive, send: ASGISend) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_bytes:
                    await self._send_too_large(send)
                    return
            except ValueError:
                await self._send_too_large(send)
                return

        received = 0

        async def limited_receive() -> ASGIMessage:
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > self.max_bytes:
                raise RequestBodyTooLargeError
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLargeError:
            await self._send_too_large(send)

    @staticmethod
    async def _send_too_large(send: ASGISend) -> None:
        body = json.dumps({"detail": "request body too large"}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
