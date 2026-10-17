"""Judge-mode demo packs bundled under data/packs/<id>/."""

from __future__ import annotations

import json
from pathlib import Path

from app.config import settings
from app.schemas import Application, DemoPack, Evidence, Persona
from app.store import image_fingerprint, new_id, store

LANG = {"ID": "id", "IN": "ta"}
CURRENCY = {"ID": "Rp", "IN": "₹"}
HERO_ORDER = ["sari", "murugan", "rina", "joko", "lakshmi", "dewi", "selvam", "karthik"]


def _pack_dir(pack_id: str) -> Path:
    return settings.data_dir / "packs" / pack_id


def _photos(pack_id: str) -> dict[str, Path]:
    """Real handwritten photos win; generated placeholder pages fill any gap."""
    d = _pack_dir(pack_id)
    found: dict[str, Path] = {}
    for name in ("page1", "page2", "page3"):
        for folder in ("photos", "placeholder"):
            for ext in ("jpg", "jpeg", "png", "JPG", "JPEG", "PNG"):
                p = d / folder / f"{name}.{ext}"
                if p.exists() and name not in found:
                    found[name] = p
    for name in ("shop", "receipt1", "receipt2"):
        for ext in ("jpg", "jpeg", "png", "JPG", "JPEG", "PNG"):
            p = d / "photos" / f"{name}.{ext}"
            if p.exists():
                found[name] = p
    return found


def list_packs() -> list[DemoPack]:
    packs = []
    for pid in HERO_ORDER:
        d = _pack_dir(pid)
        if not (d / "meta.json").exists():
            continue
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        has_photos = any((d / "photos").glob("page1.*"))
        packs.append(DemoPack(
            id=pid, persona=Persona(name=meta["persona"], business=meta["business"], city=meta["city"]),
            market=meta["market"], language=LANG[meta["market"]], label=meta["label"], hero=meta["hero"],
            has_photos=has_photos))
    return packs


async def load_pack(pack_id: str) -> Application:
    d = _pack_dir(pack_id)
    meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
    app = Application(
        id=new_id("app"), pack_id=pack_id,
        persona=Persona(name=meta["persona"], business=meta["business"], city=meta["city"]),
        market=meta["market"], language=LANG[meta["market"]], currency=CURRENCY[meta["market"]])
    photos = _photos(pack_id)
    items: list[tuple[str, str, Path]] = []
    for i, key in enumerate(k for k in ("page1", "page2", "page3") if k in photos):
        items.append(("ledger", f"Ledger page {i + 1}", photos[key]))
    items.append(("statement", f"{'QRIS' if meta['market'] == 'ID' else 'UPI'} statement", d / "statement.png"))
    for key, etype, label in (("receipt1", "receipt", "Supplier receipt 1"), ("receipt2", "receipt", "Supplier receipt 2"),
                              ("shop", "shop", "Shop photo")):
        if key in photos:
            items.append((etype, label, photos[key]))
    for etype, label, path in items:
        ev_id = new_id("ev")
        w, h, sha, ahash = image_fingerprint(path.read_bytes())
        app.evidence.append(Evidence(id=ev_id, type=etype, label=label, url=f"/api/evidence/{ev_id}/image",
                                     width=w, height=h, sha256=sha, ahash=ahash))
        store.add_image(ev_id, path)
    await store.save(app)
    return app
