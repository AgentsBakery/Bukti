"""Shared google-genai clients (Gemini Enterprise Agent Platform, no API keys)."""

from __future__ import annotations

from functools import lru_cache

from google import genai
from google.genai import types

from app.config import settings

# Under load the shared Gemini quota answers 429 (and occasionally 503/504). Retry those with exponential backoff
# and jitter; every caller still bounds the whole call with its own timeout.
RETRY = types.HttpRetryOptions(attempts=5, initial_delay=2.0, max_delay=30.0, exp_base=2.0, jitter=1.0,
                               http_status_codes=[429, 503, 504])


@lru_cache(maxsize=4)
def client(location: str | None = None) -> genai.Client:
    return genai.Client(enterprise=True, project=settings.project, location=location or settings.location,
                        http_options=types.HttpOptions(retry_options=RETRY))


def adk_client_kwargs(location: str | None = None) -> dict:
    """client_kwargs for google.adk.models.Gemini so ADK agents hit the same project and endpoint."""
    return {"enterprise": True, "project": settings.project, "location": location or settings.location}
