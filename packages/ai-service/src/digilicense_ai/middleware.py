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
        """
        Initialize middleware with an application and maximum request body size.
        
        Parameters:
            app (Any): The ASGI application to wrap.
            max_bytes (int): Maximum permitted request body size in bytes.
        """
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: ASGIScope, receive: ASGIReceive, send: ASGISend) -> None:
        """
        Enforces the configured maximum size for HTTP request bodies.
        
        Non-HTTP scopes are passed through unchanged. HTTP requests with an oversized
        or invalid `Content-Length` header, or whose streamed body exceeds the limit,
        receive a 413 response.
        """
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
            """Receive the next request message while enforcing the configured body size limit.
            
            Returns:
            	ASGIMessage: The next ASGI message.
            
            Raises:
            	RequestBodyTooLargeError: If the accumulated request body exceeds the maximum allowed size.
            """
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
        """
        Send a JSON HTTP 413 response indicating that the request body exceeds the permitted size.
        
        Parameters:
        	send (ASGISend): Callable used to send ASGI response messages.
        """
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
