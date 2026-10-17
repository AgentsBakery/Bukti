"""Application and evidence storage.

Applications live in memory and are written through to Firestore when enabled, so a session survives an
instance restart. Evidence images come from the bundled demo packs or from uploads. Uploads are kept in Cloud
Storage, one folder per application: applications/{application}/{evidence}/page.jpg (the image the agents read)
and original.<ext> (the file exactly as uploaded; a PDF is stored once, beside its first page). A local copy in
the cache directory saves a download on the instance that received the file.
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
from app.schemas import Application, ApplicationSummary, Evidence

log = logging.getLogger("bukti.store")


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(5)}"


def image_fingerprint(data: bytes) -> tuple[int, int, str, str]:
    """Width, height, sha256, and a 64-bit average hash for near-duplicate detection."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    w, h = img.size
    small = img.convert("L").resize((8, 8))
    px = list(small.get_flattened_data() if hasattr(small, "get_flattened_data") else small.getdata())
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


MAX_PDF_PAGES = 10


def pdf_pages(data: bytes, max_side: int = 2000) -> list[bytes]:
    """Render each page of a PDF to a JPEG so the agents can read it and the console can highlight on it."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    try:
        if len(pdf) == 0:
            raise ValueError("the PDF has no pages")
        if len(pdf) > MAX_PDF_PAGES:
            raise ValueError(f"the PDF has {len(pdf)} pages; the limit is {MAX_PDF_PAGES}")
        out = []
        for i in range(len(pdf)):
            page = pdf[i]
            w, h = page.get_size()
            img = page.render(scale=min(4.0, max_side / max(w, h, 1))).to_pil().convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=88)
            out.append(buf.getvalue())
        return out
    finally:
        pdf.close()


def _summary(a: Application) -> ApplicationSummary:
    return ApplicationSummary(
        id=a.id, kind=a.kind, persona=a.persona, market=a.market, status=a.status, created_at=a.created_at,
        amount=(a.decision.amount if a.decision else (a.memo.amount if a.memo else None)),
        decision=(a.decision.action if a.decision else (a.memo.decision if a.memo else None)))


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

    async def list_demo(self, limit: int = 30) -> list[ApplicationSummary]:
        apps = sorted((a for a in self._apps.values() if a.kind == "demo"), key=lambda a: a.created_at, reverse=True)
        return [_summary(a) for a in apps[:limit]]

    async def list_real(self, owner_uid: str | None = None, limit: int = 200) -> list[ApplicationSummary]:
        """Real applications from Firestore (every instance sees them), newest first; one owner's, or all."""
        found: dict[str, Application] = {a.id: a for a in self._apps.values()
                                         if a.kind == "real" and (owner_uid is None or a.owner_uid == owner_uid)}
        if self._fs is not None:
            from google.cloud.firestore_v1.base_query import FieldFilter

            field, value = ("owner_uid", owner_uid) if owner_uid else ("kind", "real")
            try:
                query = self._fs.collection("applications").where(filter=FieldFilter(field, "==", value)).limit(limit)
                async for snap in query.stream():
                    a = Application.model_validate(snap.to_dict())
                    if a.kind == "real":
                        found.setdefault(a.id, a)
            except Exception:  # noqa: BLE001
                log.exception("firestore list failed")
        return [_summary(a) for a in sorted(found.values(), key=lambda a: a.created_at, reverse=True)]

    async def delete_application(self, app_id: str) -> None:
        """Remove the application everywhere: memory, Firestore and every file under its Cloud Storage folder."""
        self._apps.pop(app_id, None)
        if self._fs is not None:
            await self._fs.collection("applications").document(app_id).delete()
        prefix = f"applications/{app_id}/"
        if self._gcs is not None:
            blobs = await asyncio.to_thread(lambda: list(self._gcs.client.list_blobs(self._gcs, prefix=prefix)))
            for blob in blobs:
                await asyncio.to_thread(blob.delete)
        local = settings.cache_dir / "objects" / "applications" / app_id
        if local.exists():
            for f in sorted(local.rglob("*"), reverse=True):
                f.unlink() if f.is_file() else f.rmdir()
            local.rmdir()

    # ---------- files of real uploads ----------

    async def put_object(self, path: str, data: bytes, content_type: str) -> str:
        """Save bytes under `path` in Cloud Storage (and the local cache). Fails loudly: an upload that only
        reached one instance's disk would vanish on the next restart."""
        local = settings.cache_dir / "objects" / path
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(data)
        if self._gcs is None:
            return ""
        blob = self._gcs.blob(path)
        await asyncio.to_thread(blob.upload_from_string, data, content_type=content_type)
        return f"gs://{self._gcs.name}/{path}"

    async def delete_objects(self, uris: list[str]) -> None:
        for uri in uris:
            if not uri:
                continue
            path = uri.split("/", 3)[3] if uri.startswith("gs://") else uri
            local = settings.cache_dir / "objects" / path
            if local.exists():
                local.unlink()
            if self._gcs is not None:
                try:
                    await asyncio.to_thread(self._gcs.blob(path).delete)
                except Exception:  # noqa: BLE001 - already gone is fine
                    log.warning("gcs delete failed", extra={"evidence_id": path})

    async def evidence_bytes(self, app: Application, ev: Evidence) -> bytes | None:
        """The page image the agents read, from wherever it lives."""
        if ev.src.startswith("object:"):
            path = ev.src[len("object:"):]
            local = settings.cache_dir / "objects" / path
            if local.exists():
                return local.read_bytes()
            if self._gcs is not None:
                try:
                    local.parent.mkdir(parents=True, exist_ok=True)
                    await asyncio.to_thread(self._gcs.blob(path).download_to_filename, local)
                    return local.read_bytes()
                except Exception:  # noqa: BLE001
                    log.exception("gcs download failed", extra={"evidence_id": ev.id, "app_id": app.id})
            return None
        return self.image_bytes(ev.id)

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


store = Store()
