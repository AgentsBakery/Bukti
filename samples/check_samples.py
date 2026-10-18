"""Run every sample set through a deployed Bukti and report what happened, against each set's ground truth.

Each set is uploaded into a fresh demo case (no sign-in needed): the case's built-in pages are removed, the set's
files are uploaded without a type so Gemini labels them, then the notebook is read and the case assessed.

    uv run python samples/check_samples.py https://<bukti url> [set-folder ...]
"""

from __future__ import annotations

import concurrent.futures as cf
import json
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent
MIME = {".jpg": "image/jpeg", ".png": "image/png", ".pdf": "application/pdf"}


def stream(c: httpx.Client, path: str) -> tuple[dict | None, dict | None]:
    agent, app = None, None
    with c.stream("GET", path, timeout=600) as r:
        if r.status_code != 200:
            return {"status": "refused", "summary": r.read().decode()[:200]}, None
        for line in r.iter_lines():
            if line.startswith("data:"):
                m = json.loads(line[5:])
                if m.get("type") == "agent" and m.get("status") in ("done", "error"):
                    agent = m
                if m.get("type") == "done":
                    app = m["application"]
    return agent, app


def run_set(base: str, folder: Path) -> dict:
    c = httpx.Client(base_url=base, timeout=300)
    exp = json.loads((folder / "expected.json").read_text())
    app_id = c.post(f"/api/demo/packs/{'sari' if exp['market'] == 'ID' else 'murugan'}/load").json()["application_id"]
    for ev in c.get(f"/api/applications/{app_id}").json()["evidence"]:
        c.delete(f"/api/applications/{app_id}/evidence/{ev['id']}")
    files = sorted(p for p in folder.iterdir() if p.suffix in MIME)

    def up(p: Path) -> list[dict]:
        r = c.post(f"/api/applications/{app_id}/evidence", files={"file": (p.name, p.read_bytes(), MIME[p.suffix])})
        return r.json() if r.status_code == 200 else [{"original_name": p.name, "type": "ERROR", "status": r.text[:120]}]

    with cf.ThreadPoolExecutor(3) as pool:
        uploaded = [ev for evs in pool.map(up, files) for ev in evs]
    out: dict = {"set": folder.name, "case": app_id, "labels": [
        f"{ev['original_name']}{' p' + str(ev['page']) if ev.get('page') else ''} → {ev['type']}"
        f"{' (' + ev['status'] + ')' if ev['status'] != 'ready' else ''}" for ev in uploaded]}
    # A real borrower must settle "please check" labels before reading; accept the model's suggestion here.
    for ev in uploaded:
        if ev.get("status") == "needs_review":
            c.patch(f"/api/applications/{app_id}/evidence/{ev['id']}", json={"type": ev["type"]})

    agent, app = stream(c, f"/api/applications/{app_id}/extract/stream?force=true")
    out["read"] = f"{agent['status']}: {agent['summary']}" if agent else "no result"
    if app:
        out["unusable_pages"] = [f"{e['original_name']}: {e['read_kind']} — {e['read_note']}" for e in app["evidence"]
                                 if e.get("read_kind") not in (None, "daily_records")]
        sales = sum(e["amount_in"] for e in app["entries"])
        days = {}
        for s in app["statement"]:
            days[s["date"]] = days.get(s["date"], 0) + s["total"]
        out["notebook_sales_read"] = sales
        if "notebook_sales" in exp:
            out["notebook_sales_expected"] = exp["notebook_sales"]
        out["statement_received_read"] = sum(days.values())
        if "statement_received" in exp:
            out["statement_received_expected"] = exp["statement_received"]
        if "statement_days" in exp:
            out["statement_days_exact"] = f"{sum(1 for d, v in exp['statement_days'].items() if days.get(d) == v)}/{len(exp['statement_days'])}"
        if "rows" in exp:
            got = {}
            for e in app["entries"]:
                got[e["date"]] = got.get(e["date"], 0) + e["amount_in"]
            out["rows_exact"] = f"{sum(1 for r in exp['rows'] if got.get(r['date']) == r['in'])}/{len(exp['rows'])}"

    agent, app = stream(c, f"/api/applications/{app_id}/assess/stream?force=true")
    if app and app.get("memo"):
        m = app["memo"]
        out["outcome"] = f"{m['decision']} {m['amount']:,}"
        out["checks"] = [f"{ch['id']}: {ch['result']} — {ch['summary'][:110]}" for ch in app["checks"] if ch["result"] != "pass"]
    else:
        out["outcome"] = f"assessment {agent['status'] if agent else 'not run'}: {agent['summary'] if agent else ''}"[:200]
    return out


def main() -> None:
    base = sys.argv[1].rstrip("/")
    names = sys.argv[2:] or sorted(p.name for p in ROOT.iterdir() if p.is_dir() and (p / "expected.json").exists())
    with cf.ThreadPoolExecutor(3) as pool:
        results = list(pool.map(lambda n: run_set(base, ROOT / n), names))
    for r in results:
        print(f"\n== {r['set']}  ({r['case']})")
        for k, v in r.items():
            if k in ("set", "case"):
                continue
            if isinstance(v, list):
                print(f"   {k}:")
                for item in v:
                    print(f"      {item}")
            else:
                print(f"   {k}: {v}")
    (ROOT / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
