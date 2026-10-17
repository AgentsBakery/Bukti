"""Shared google-genai clients (Gemini Enterprise Agent Platform, no API keys)."""

from __future__ import annotations

from functools import lru_cache

from google import genai

from app.config import settings


@lru_cache(maxsize=4)
def client(location: str | None = None) -> genai.Client:
    return genai.Client(enterprise=True, project=settings.project, location=location or settings.location)


def adk_client_kwargs(location: str | None = None) -> dict:
    """client_kwargs for google.adk.models.Gemini so ADK agents hit the same project and endpoint."""
    return {"enterprise": True, "project": settings.project, "location": location or settings.location}
