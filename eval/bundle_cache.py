"""Pre-compute Gemini reads of every demo-pack photo and bundle them into data/cache/.

Judges then get an instant, deterministic read of the demo packs (the extractor still paces the
on-screen scan), while any photo a judge uploads is read live. Re-run after changing pack photos,
the extraction prompt, or the model.

Usage: uv run python eval/bundle_cache.py
"""

from __future__ import annotations

import asyncio
import shutil

from agents.extractor import _cache_path, read_ledger, read_statement
from app import packs
from app.config import settings


async def main() -> None:
    out = settings.data_dir / "cache"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.json"):
        old.unlink()
    for pack in packs.list_packs():
        app = await packs.load_pack(pack.id)
        tasks = []
        for ev in app.evidence:
            if ev.type == "ledger":
                tasks.append(("ledger", ev, read_ledger(app, ev, ("2026-09-01", "2026-09-28"))))
            elif ev.type == "statement":
                tasks.append(("statement", ev, read_statement(app, ev)))
        results = await asyncio.gather(*(t[2] for t in tasks), return_exceptions=True)
        for (kind, ev, _), res in zip(tasks, results, strict=True):
            if isinstance(res, Exception):
                print(f"  {pack.id} {ev.label}: FAILED {res}")
                continue
            src = _cache_path(kind, ev.sha256)
            if src.exists() and src.parent != out:
                shutil.copy(src, out / src.name)
            print(f"  {pack.id:8s} {ev.label:22s} {len(res):3d} rows -> {src.name}")
    print(f"bundled {len(list(out.glob('*.json')))} reads into {out}")


if __name__ == "__main__":
    asyncio.run(main())
