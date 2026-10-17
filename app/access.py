"""Who may see and change an application, and short-lived signed links for its photos.

Demo cases stay open to everyone (one-click judging). Real cases belong to the borrower who created them:
only that borrower and the loan officers listed in BUKTI_OFFICER_EMAILS can see them, only the borrower can
change their evidence or delete the case, and only an officer can record a decision.

Browsers load photos with plain <img> tags, which cannot carry a sign-in header, so photos of real cases are
served through links signed with an HMAC that expires within two hours.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time

from fastapi import HTTPException

from app.auth import Caller
from app.config import settings
from app.schemas import Application, Evidence

_KEY = (settings.url_key or secrets.token_hex(32)).encode()
LINK_WINDOW_S = 3600


def is_officer(caller: Caller | None) -> bool:
    return caller is not None and caller.email.lower() in settings.officer_emails


def can_view(app: Application, caller: Caller | None) -> bool:
    return app.kind == "demo" or (caller is not None and (caller.uid == app.owner_uid or is_officer(caller)))


def can_edit(app: Application, caller: Caller | None) -> bool:
    return app.kind == "demo" or (caller is not None and caller.uid == app.owner_uid)


def can_decide(app: Application, caller: Caller | None) -> bool:
    return app.kind == "demo" or is_officer(caller)


def require_view(app: Application | None, caller: Caller | None) -> Application:
    # A real case someone may not see answers 404, so its existence is not revealed.
    if app is None or not can_view(app, caller):
        raise HTTPException(404, "application not found")
    return app


def require_edit(app: Application, caller: Caller | None) -> None:
    if not can_edit(app, caller):
        raise HTTPException(401 if caller is None else 403, "Only the borrower who started this application can change it.")


def require_decide(app: Application, caller: Caller | None) -> None:
    if not can_decide(app, caller):
        raise HTTPException(401 if caller is None else 403, "Only a loan officer can decide a real application.")


def _sig(app_id: str, evidence_id: str, exp: int) -> str:
    return hmac.new(_KEY, f"{app_id}/{evidence_id}/{exp}".encode(), hashlib.sha256).hexdigest()[:40]


def image_url(app: Application, ev: Evidence) -> str:
    if ev.src.startswith("pack:"):
        return ev.url
    base = f"/api/applications/{app.id}/evidence/{ev.id}/image"
    if app.kind == "demo":
        return base
    # The expiry is rounded to the hour so repeated polls return the same URL and the browser cache still works.
    exp = (int(time.time()) // LINK_WINDOW_S + 2) * LINK_WINDOW_S
    return f"{base}?exp={exp}&sig={_sig(app.id, ev.id, exp)}"


def link_ok(app: Application, evidence_id: str, exp: int | None, sig: str | None) -> bool:
    if app.kind == "demo":
        return True
    if exp is None or sig is None or exp < time.time():
        return False
    return hmac.compare_digest(sig, _sig(app.id, evidence_id, exp))


def evidence_out(app: Application, ev: Evidence) -> dict:
    return {**ev.model_dump(), "url": image_url(app, ev)}


def app_out(app: Application, caller: Caller | None) -> dict:
    """The application as this caller may see it: signed photo links plus what they are allowed to do."""
    data = app.model_dump()
    data["evidence"] = [evidence_out(app, ev) for ev in app.evidence]
    data["access"] = {"edit": can_edit(app, caller), "decide": can_decide(app, caller),
                      "officer": is_officer(caller), "owner": caller is not None and caller.uid == app.owner_uid}
    return data
