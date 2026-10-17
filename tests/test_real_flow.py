"""Real applications: who can see and change them, uploads (photos and PDFs), signed photo links, deletion."""

from __future__ import annotations

import io
import os

os.environ.setdefault("BUKTI_WARM", "0")

import pytest  # noqa: E402
from fastapi import Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from agents import classifier  # noqa: E402
from app import guards  # noqa: E402
from app.auth import Caller, optional_caller, required_caller  # noqa: E402
from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402

USERS = {"sari": Caller(uid="u_sari", email="sari@example.com", name="Sari", picture=None),
         "rudi": Caller(uid="u_rudi", email="rudi@example.com", name="Rudi", picture=None),
         "officer": Caller(uid="u_off", email="officer@lender.example", name="Officer", picture=None)}


def _fake_caller(request: Request) -> Caller | None:
    return USERS.get(request.headers.get("x-test-user", ""))


def _fake_required(request: Request) -> Caller:
    from fastapi import HTTPException

    c = _fake_caller(request)
    if c is None:
        raise HTTPException(401, "sign in")
    return c


def _image(color: str = "white") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (300, 400), color).save(buf, format="JPEG")
    return buf.getvalue()


def _pdf(pages: int) -> bytes:
    buf = io.BytesIO()
    imgs = [Image.new("RGB", (300, 400), c) for c in ("white", "yellow", "gray")[:pages]]
    imgs[0].save(buf, format="PDF", save_all=True, append_images=imgs[1:])
    return buf.getvalue()


@pytest.fixture()
def client(monkeypatch):
    guards._buckets.clear()
    object.__setattr__(settings, "officer_emails", frozenset({"officer@lender.example"}))
    app.dependency_overrides[optional_caller] = _fake_caller
    app.dependency_overrides[required_caller] = _fake_required

    async def fake_classify(image: bytes, market: str):
        kind = "statement" if Image.open(io.BytesIO(image)).getpixel((5, 5))[2] < 100 else "ledger"  # yellow → statement
        return classifier.Classification(type=kind, confidence=0.9, reason="test")

    monkeypatch.setattr(classifier, "classify", fake_classify)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    object.__setattr__(settings, "officer_emails", frozenset())


def as_(user: str) -> dict:
    return {"x-test-user": user}


def new_case(client, user: str = "sari", voice: bool = True) -> str:
    r = client.post("/api/applications", headers=as_(user), json={
        "market": "ID", "language": "id", "persona": {"name": "Ibu Sari", "business": "Warung", "city": "Yogyakarta"},
        "consent": {"photos": True, "voice": voice}})
    assert r.status_code == 200, r.text
    return r.json()["application_id"]


def test_borrower_owns_the_case_and_officers_decide(client):
    app_id = new_case(client)
    assert client.get(f"/api/applications/{app_id}").status_code == 404           # guest
    assert client.get(f"/api/applications/{app_id}", headers=as_("rudi")).status_code == 404  # another borrower
    mine = client.get(f"/api/applications/{app_id}", headers=as_("sari")).json()
    assert mine["kind"] == "real" and mine["access"] == {"edit": True, "decide": False, "officer": False, "owner": True}
    officer = client.get(f"/api/applications/{app_id}", headers=as_("officer")).json()
    assert officer["access"]["decide"] is True and officer["access"]["edit"] is False

    assert client.post(f"/api/applications/{app_id}/decision", headers=as_("sari"),
                       json={"action": "approve"}).status_code == 403
    assert client.post(f"/api/applications/{app_id}/decision", headers=as_("officer"),
                       json={"action": "decline", "note": "test"}).json()["decision"]["officer"] == "Officer"

    assert app_id in [a["id"] for a in client.get("/api/me/applications", headers=as_("sari")).json()]
    assert app_id not in [a["id"] for a in client.get("/api/me/applications", headers=as_("rudi")).json()]
    assert app_id in [a["id"] for a in client.get("/api/applications", headers=as_("officer")).json()]
    assert app_id not in [a["id"] for a in client.get("/api/applications").json()]


def test_uploads_are_labelled_stored_and_served_through_signed_links(client):
    app_id = new_case(client)
    photo = client.post(f"/api/applications/{app_id}/evidence", headers=as_("sari"),
                        files={"file": ("page.jpg", _image(), "image/jpeg")})
    assert photo.status_code == 200, photo.text
    [ev] = photo.json()
    assert ev["type"] == "ledger" and ev["label_source"] == "ai" and ev["status"] == "ready"
    assert ev["src"] == f"object:applications/{app_id}/{ev['id']}/page.jpg"
    assert (settings.cache_dir / "objects" / "applications" / app_id / ev["id"] / "original.jpg").exists()
    assert "sig=" in ev["url"]
    assert client.get(ev["url"]).status_code == 200
    assert client.get(ev["url"].split("?")[0]).status_code == 404               # unsigned link refused
    assert client.get(ev["url"].replace("sig=", "sig=0")).status_code == 404    # tampered link refused

    # Someone else can't add to, relabel or delete from the case.
    assert client.post(f"/api/applications/{app_id}/evidence", headers=as_("rudi"),
                       files={"file": ("x.jpg", _image(), "image/jpeg")}).status_code == 404

    pdf = client.post(f"/api/applications/{app_id}/evidence", headers=as_("sari"),
                      files={"file": ("statement.pdf", _pdf(2), "application/pdf")}).json()
    assert [p["page"] for p in pdf] == [1, 2] and len({p["parent_id"] for p in pdf}) == 1
    assert pdf[0]["original_uri"] == "" or pdf[0]["original_uri"].endswith("original.pdf")
    assert pdf[1]["type"] == "statement"

    relabel = client.patch(f"/api/applications/{app_id}/evidence/{pdf[0]['id']}", headers=as_("sari"),
                           json={"type": "other"}).json()
    assert relabel["status"] == "excluded" and relabel["label_source"] == "borrower"
    assert client.delete(f"/api/applications/{app_id}/evidence/{pdf[0]['id']}", headers=as_("sari")).status_code == 200
    case = client.get(f"/api/applications/{app_id}", headers=as_("sari")).json()
    assert [e["label"] for e in case["evidence"]] == ["Notebook page 1", "Payment statement 1"]
    assert not (settings.cache_dir / "objects" / "applications" / app_id / pdf[0]["id"] / "page.jpg").exists()


def test_borrower_can_delete_the_case_and_its_files(client):
    app_id = new_case(client)
    client.post(f"/api/applications/{app_id}/evidence", headers=as_("sari"),
                files={"file": ("page.jpg", _image(), "image/jpeg")})
    folder = settings.cache_dir / "objects" / "applications" / app_id
    assert folder.exists()
    assert client.delete(f"/api/applications/{app_id}", headers=as_("officer")).status_code == 403
    assert client.delete(f"/api/applications/{app_id}", headers=as_("sari")).status_code == 200
    assert client.get(f"/api/applications/{app_id}", headers=as_("sari")).status_code == 404
    assert not folder.exists()


def test_reading_needs_a_notebook_page_and_checked_labels(client):
    app_id = new_case(client)
    r = client.get(f"/api/applications/{app_id}/extract/stream", headers=as_("sari"))
    assert r.status_code == 409


def test_consent_to_photos_is_required(client):
    r = client.post("/api/applications", headers=as_("sari"), json={
        "market": "IN", "language": "ta", "persona": {"name": "M", "business": "kirana", "city": ""},
        "consent": {"photos": False, "voice": True}})
    assert r.status_code == 400
