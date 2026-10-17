"""Application and evidence storage.

Applications live in memory and are written through to Firestore when enabled, so a judge's
session survives an instance restart. Evidence images come from the bundled demo packs or from
uploads (local cache, mirrored to Cloud Storage when a bucket is configured).
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import secrets
from pathlib import Path

from PIL import Image, ImageOps

from app.config import settings
from app.schemas import Application, ApplicationSummary, Evidence, EvidenceType

log = logging.getLogger("bukti.store")


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(5)}"


def image_fingerprint(data: bytes) -> tuple[int, int, str, str]:
    """Width, height, sha256, and a 64-bit average hash for near-duplicate detection."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    w, h = img.size
    small = img.convert("L").resize((8, 8))
    px = list(small.getdata())
    avg = sum(px) / len(px)
    bits = "".join("1" if p >= avg else "0" for p in px)
    return w, h, hashlib.sha256(data).hexdigest(), f"{int(bits, 2):016x}"


def normalise_image(data: bytes, max_side: int = 2000) -> bytes:
    """Apply EXIF rotation and cap the size so photos from any phone behave the same."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=88)
    return out.getvalue()


class Store:
    def __init__(self) -> None:
        self._apps: dict[str, Application] = {}
        self._images: dict[str, Path] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._fs = None
        self._gcs = None
        settings.cache_dir.mkdir(parents=True, exist_ok=True)
        if settings.use_firestore:
            try:
                from google.cloud import firestore

                self._fs = firestore.AsyncClient(project=settings.project)
            except Exception:  # noqa: BLE001 - storage must degrade, never crash the demo
                log.exception("firestore unavailable, continuing in memory")
        if settings.bucket:
            try:
                from google.cloud import storage

                self._gcs = storage.Client(project=settings.project).bucket(settings.bucket)
            except Exception:  # noqa: BLE001
                log.exception("cloud storage unavailable, continuing with local cache")

    def lock(self, app_id: str) -> asyncio.Lock:
        return self._locks.setdefault(app_id, asyncio.Lock())

    async def get(self, app_id: str) -> Application | None:
        app = self._apps.get(app_id)
        if app is None and self._fs is not None:
            try:
                snap = await self._fs.collection("applications").document(app_id).get()
                if snap.exists:
                    app = Application.model_validate(snap.to_dict())
                    self._apps[app_id] = app
            except Exception:  # noqa: BLE001
                log.exception("firestore read failed", extra={"app_id": app_id})
        return app

    async def save(self, app: Application) -> None:
        self._apps[app.id] = app
        if self._fs is not None:
            try:
                await self._fs.collection("applications").document(app.id).set(
                    json.loads(app.model_dump_json()))
            except Exception:  # noqa: BLE001
                log.exception("firestore write failed", extra={"app_id": app.id})

    async def list(self) -> list[ApplicationSummary]:
        apps = sorted(self._apps.values(), key=lambda a: a.created_at, reverse=True)[:50]
        return [ApplicationSummary(
            id=a.id, persona=a.persona, market=a.market, status=a.status, created_at=a.created_at,
            amount=(a.decision.amount if a.decision else (a.memo.amount if a.memo else None)),
            decision=(a.decision.action if a.decision else (a.memo.decision if a.memo else None)),
        ) for a in apps]

    def add_image(self, evidence_id: str, path: Path) -> None:
        self._images[evidence_id] = path

    def image_path(self, evidence_id: str) -> Path | None:
        path = self._images.get(evidence_id)
        if path and path.exists():
            return path
        # After a restart the in-memory map is empty; resolve from the evidence record instead.
        for app in self._apps.values():
            for ev in app.evidence:
                if ev.id == evidence_id and ev.src.startswith("pack:"):
                    candidate = (settings.data_dir / ev.src[5:]).resolve()
                    if settings.data_dir.resolve() in candidate.parents and candidate.exists():
                        self._images[evidence_id] = candidate
                        return candidate
        local = settings.cache_dir / "uploads" / f"{evidence_id}.jpg"
        if local.exists():
            return local
        if self._gcs is not None:
            try:
                local.parent.mkdir(parents=True, exist_ok=True)
                self._gcs.blob(f"uploads/{evidence_id}.jpg").download_to_filename(local)
                return local
            except Exception:  # noqa: BLE001
                log.exception("gcs download failed", extra={"evidence_id": evidence_id})
        return None

    def image_bytes(self, evidence_id: str) -> bytes | None:
        path = self.image_path(evidence_id)
        return path.read_bytes() if path else None

    async def add_upload(self, app: Application, data: bytes, etype: EvidenceType) -> Evidence:
        data = normalise_image(data)
        ev_id = new_id("ev")
        local = settings.cache_dir / "uploads" / f"{ev_id}.jpg"
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(data)
        if self._gcs is not None:
            try:
                await asyncio.to_thread(self._gcs.blob(f"uploads/{ev_id}.jpg").upload_from_filename, local)
            except Exception:  # noqa: BLE001
                log.exception("gcs upload failed", extra={"evidence_id": ev_id})
        w, h, sha, ahash = image_fingerprint(data)
        count = sum(1 for e in app.evidence if e.type == etype) + 1
        label = {"ledger": f"Ledger page {count}", "statement": "Payment statement",
                 "receipt": f"Receipt {count}", "shop": "Shop photo"}[etype]
        ev = Evidence(id=ev_id, type=etype, label=label, url=f"/api/evidence/{ev_id}/image",
                      width=w, height=h, sha256=sha, ahash=ahash, src=f"upload:{ev_id}")
        self._images[ev_id] = local
        app.evidence.append(ev)
        await self.save(app)
        return ev


store = Store()
