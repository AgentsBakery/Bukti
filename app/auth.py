"""Optional Google sign-in (Firebase Auth).

Sign-in is never required. When a request carries a Firebase ID token we verify it against Google's
public keys and attach the user; otherwise the request proceeds as a guest. Users are stored in the
Firestore `users` collection.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass

import json
import time

import google.auth.transport.requests
from fastapi import HTTPException, Request
from google.auth import jwt
from pydantic import BaseModel

from app.config import settings
from app.schemas import now_iso

log = logging.getLogger("bukti.auth")
_request = google.auth.transport.requests.Request()

FIREBASE_WEB_CONFIG = {
    "apiKey": os.getenv("BUKTI_FIREBASE_API_KEY", ""),
    "authDomain": os.getenv("BUKTI_FIREBASE_AUTH_DOMAIN", f"{settings.project}.firebaseapp.com"),
    "projectId": settings.project,
    "appId": os.getenv("BUKTI_FIREBASE_APP_ID", ""),
}


class User(BaseModel):
    uid: str
    email: str
    name: str
    photo_url: str | None = None
    role: str = "officer"
    created_at: str
    last_login_at: str
    login_count: int = 1


@dataclass
class Caller:
    uid: str
    email: str
    name: str
    picture: str | None


def auth_enabled() -> bool:
    return bool(FIREBASE_WEB_CONFIG["apiKey"] and FIREBASE_WEB_CONFIG["appId"])


_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_certs: dict = {"keys": None, "at": 0.0}


def _verify(token: str) -> dict:
    """Verify signature (Google's rotating keys, cached for an hour), expiry, audience and issuer."""
    if _certs["keys"] is None or time.time() - _certs["at"] > 3600:
        _certs["keys"] = json.loads(_request(_CERTS_URL, method="GET").data)
        _certs["at"] = time.time()
    claims = jwt.decode(token, certs=_certs["keys"], audience=settings.project, clock_skew_in_seconds=10)
    if claims.get("iss") != f"https://securetoken.google.com/{settings.project}":
        raise ValueError("wrong issuer")
    return claims


async def caller_from(headers) -> Caller | None:
    """Returns the signed-in caller, or None for guests. An invalid token is treated as a guest, not an error."""
    auth = headers.get("authorization", "")
    if not auth.lower().startswith("bearer ") or not auth_enabled():
        return None
    token = auth.split(" ", 1)[1].strip()
    try:
        claims = await asyncio.to_thread(_verify, token)
    except Exception as exc:  # noqa: BLE001 - expired or forged tokens fall back to guest
        log.warning("id token rejected", extra={"error": str(exc)[:160]})
        return None
    if not claims or not claims.get("email_verified", False):
        return None
    return Caller(uid=claims["sub"], email=claims.get("email", ""), name=claims.get("name") or claims.get("email", ""),
                  picture=claims.get("picture"))


async def optional_caller(request: Request) -> Caller | None:
    return await caller_from(request.headers)


async def required_caller(request: Request) -> Caller:
    caller = await caller_from(request.headers)
    if caller is None:
        raise HTTPException(401, "Sign in with Google to continue.")
    return caller


class UserStore:
    """Firestore `users` collection, with an in-memory fallback for local runs."""

    def __init__(self) -> None:
        self._mem: dict[str, User] = {}
        self._fs = None
        if settings.use_firestore:
            try:
                from google.cloud import firestore

                self._fs = firestore.AsyncClient(project=settings.project)
            except Exception:  # noqa: BLE001
                log.exception("firestore unavailable for users")

    async def upsert_login(self, c: Caller) -> User:
        now = now_iso()
        existing = await self.get(c.uid)
        user = User(uid=c.uid, email=c.email, name=c.name, photo_url=c.picture,
                    created_at=existing.created_at if existing else now, last_login_at=now,
                    login_count=(existing.login_count + 1) if existing else 1,
                    role=existing.role if existing else "officer")
        self._mem[c.uid] = user
        if self._fs is not None:
            try:
                await self._fs.collection("users").document(c.uid).set(user.model_dump())
            except Exception:  # noqa: BLE001
                log.exception("user write failed")
        return user

    async def get(self, uid: str) -> User | None:
        if uid in self._mem:
            return self._mem[uid]
        if self._fs is not None:
            try:
                snap = await self._fs.collection("users").document(uid).get()
                if snap.exists:
                    self._mem[uid] = User.model_validate(snap.to_dict())
                    return self._mem[uid]
            except Exception:  # noqa: BLE001
                log.exception("user read failed")
        return None


users = UserStore()
