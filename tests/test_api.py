"""API guardrails: security headers, rate limits, upload limits, and the dev pipeline."""

from __future__ import annotations

import os

os.environ.setdefault("BUKTI_WARM", "0")
os.environ.setdefault("BUKTI_DEV_GROUND_TRUTH", "1")

import json  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import guards  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    guards._buckets.clear()
    with TestClient(app) as c:
        yield c


def test_health_and_security_headers(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "microphone=(self)" in r.headers["permissions-policy"]


def test_pages_answer_head_requests(client):
    # Link checkers probe with HEAD; a 405 would make the live demo look broken.
    for path in ("/", "/login", "/console"):
        r = client.head(path)
        assert r.status_code == 200, path
        assert "content-security-policy" in r.headers


def test_api_docs_are_not_exposed(client):
    assert client.get("/docs").status_code in (200, 404)  # SPA fallback, never Swagger
    assert "swagger" not in client.get("/docs").text.lower()
    assert client.get("/openapi.json").headers.get("content-type", "").startswith(("text/html", "application/json"))
    assert "openapi" not in client.get("/openapi.json").text[:200]


def test_demo_pack_loads_are_rate_limited(client):
    codes = [client.post("/api/demo/packs/sari/load", headers={"x-forwarded-for": "203.0.113.7"}).status_code
             for _ in range(guards.LIMITS["load"].capacity + 1)]
    assert codes[:-1] == [200] * guards.LIMITS["load"].capacity
    assert codes[-1] == 429
    # A different client is unaffected.
    assert client.post("/api/demo/packs/sari/load", headers={"x-forwarded-for": "198.51.100.9"}).status_code == 200


def test_upload_rejects_non_images_and_wrong_types(client):
    app_id = client.post("/api/applications", json={"market": "ID", "language": "id"}).json()["application_id"]
    bad_type = client.post(f"/api/applications/{app_id}/evidence", data={"type": "passport"},
                           files={"file": ("x.jpg", b"\xff\xd8\xff", "image/jpeg")})
    assert bad_type.status_code == 400
    not_image = client.post(f"/api/applications/{app_id}/evidence", data={"type": "ledger"},
                            files={"file": ("x.jpg", b"<script>alert(1)</script>", "image/jpeg")})
    assert not_image.status_code == 400


def test_extract_stream_reads_the_notebook(client):
    app_id = client.post("/api/demo/packs/sari/load").json()["application_id"]
    events = []
    with client.stream("GET", f"/api/applications/{app_id}/extract/stream") as r:
        for line in r.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    entries = [e for e in events if e["type"] == "entry"]
    assert len(entries) == 38
    assert all(len(e["entry"]["bbox"]) == 4 for e in entries)
    assert events[-1]["type"] == "done"
