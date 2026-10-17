"""Runtime guardrails for a public demo that spends money on every model call.

- Per-IP token buckets on every endpoint that triggers model work or writes data.
- Global concurrency caps on extraction/assessment runs and live interviews.
- Security headers, including a CSP that allows only what the web app actually loads.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import dataclass

from fastapi import HTTPException, Request, WebSocket
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

log = logging.getLogger("bukti.guards")


@dataclass(frozen=True)
class Limit:
    capacity: int  # burst size
    per_seconds: float  # time to refill the whole bucket


LIMITS = {
    "load": Limit(20, 3600),        # demo-pack loads and new applications
    "stage": Limit(40, 3600),       # extraction / assessment runs (model calls)
    "upload": Limit(60, 3600),
    "tts": Limit(120, 3600),
    "interview": Limit(10, 3600),   # live voice sessions
    "decision": Limit(120, 3600),
    "copilot": Limit(60, 3600),
}

MAX_CONCURRENT_STAGES = 8
MAX_CONCURRENT_INTERVIEWS = 4
MAX_EVIDENCE_PER_APPLICATION = 12

stage_slots = asyncio.Semaphore(MAX_CONCURRENT_STAGES)
interview_slots = asyncio.Semaphore(MAX_CONCURRENT_INTERVIEWS)

_buckets: dict[tuple[str, str], tuple[float, float]] = defaultdict(lambda: (-1.0, 0.0))


def client_ip(headers, fallback: str | None) -> str:
    # Cloud Run's front end appends the caller's address; the first hop is the client.
    fwd = headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else "") or fallback or "unknown"


def _take(key: tuple[str, str], limit: Limit) -> bool:
    now = time.monotonic()
    tokens, last = _buckets[key]
    if tokens < 0:
        tokens, last = float(limit.capacity), now
    tokens = min(limit.capacity, tokens + (now - last) * limit.capacity / limit.per_seconds)
    if tokens < 1:
        _buckets[key] = (tokens, now)
        return False
    _buckets[key] = (tokens - 1, now)
    return True


def rate_limit(bucket: str):
    """FastAPI dependency: 429 when this client exceeds the bucket."""

    async def dep(request: Request) -> None:
        ip = client_ip(request.headers, request.client.host if request.client else None)
        if not _take((bucket, ip), LIMITS[bucket]):
            log.warning("rate limited", extra={"agent": bucket})
            raise HTTPException(429, "Too many requests from this device. Please wait a few minutes.")

    return dep


def allow_ws(ws: WebSocket, bucket: str) -> bool:
    ip = client_ip(ws.headers, ws.client.host if ws.client else None)
    return _take((bucket, ip), LIMITS[bucket])


_FIREBASE_HOST = f"https://{settings.project}.firebaseapp.com"
CSP = "; ".join([
    "default-src 'self'",
    # blob: for the microphone AudioWorklet; Google domains for the Firebase sign-in popup.
    "script-src 'self' blob: https://apis.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: data: https://lh3.googleusercontent.com",
    "media-src 'self' blob: data:",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com",
    f"frame-src {_FIREBASE_HOST} https://accounts.google.com https://apis.google.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        h = response.headers
        h.setdefault("Content-Security-Policy", CSP)
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        h.setdefault("Permissions-Policy", "microphone=(self), camera=(self), geolocation=()")
        # same-origin-allow-popups keeps the Google sign-in popup able to report back.
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        return response
