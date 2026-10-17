"""Evaluate Bukti end to end against the ground-truth packs, through the real API.

For each pack: load it, run extraction (Gemini vision on the photos) and assessment, then compare
with ground truth. Reports cell-level extraction accuracy, decision accuracy, and time to decision.

Usage:
  uv run python eval/run_eval.py --base http://localhost:8080          # all packs
  uv run python eval/run_eval.py --base https://<service-url> --packs sari rina
"""

from __future__ import annotations

import argparse
import csv
import json
import time
from collections import Counter
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
PACKS = ROOT / "data" / "packs"
OUT = ROOT / "eval" / "results"
EXPECTED = {"genuine": {"approve"}, "inflated": {"approve_reduced", "decline"}, "fabricated": {"refer", "decline"}}


def stream(client: httpx.Client, url: str) -> dict:
    final = {}
    with client.stream("GET", url, timeout=300) as r:
        for line in r.iter_lines():
            if line.startswith("data: "):
                payload = json.loads(line[6:])
                if payload["type"] == "done":
                    final = payload["application"]
                elif payload["type"] == "error":
                    print("   stream error:", payload["message"])
    return final


def ground_truth(pack_id: str) -> list[dict]:
    with open(PACKS / pack_id / "ground_truth.csv", encoding="utf-8") as fh:
        return [{**r, "amount_in": int(r["amount_in"]), "amount_out": int(r["amount_out"])} for r in csv.DictReader(fh)]


def score_extraction(truth: list[dict], entries: list[dict]) -> dict:
    """A ground-truth line counts as read correctly if an extracted line has the same date, direction and amount."""
    pool = Counter((e["date"], "in" if e["amount_in"] else "out", e["amount_in"] or e["amount_out"]) for e in entries)
    exact = 0
    amount_only = Counter((("in" if e["amount_in"] else "out"), e["amount_in"] or e["amount_out"]) for e in entries)
    amount_hits = 0
    for t in truth:
        key = (t["date"], "in" if t["amount_in"] else "out", t["amount_in"] or t["amount_out"])
        if pool[key] > 0:
            pool[key] -= 1
            exact += 1
        akey = key[1:]
        if amount_only[akey] > 0:
            amount_only[akey] -= 1
            amount_hits += 1
    return {"truth_lines": len(truth), "extracted_lines": len(entries), "exact_lines": exact,
            "line_accuracy": round(exact / len(truth), 4) if truth else 0.0,
            "amount_accuracy": round(amount_hits / len(truth), 4) if truth else 0.0}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8080")
    ap.add_argument("--packs", nargs="*")
    ap.add_argument("--force", action="store_true", help="re-run models even if cached")
    args = ap.parse_args()

    client = httpx.Client(base_url=args.base, timeout=60)
    packs = client.get("/api/demo/packs").json()
    rows = []
    for p in packs:
        if args.packs and p["id"] not in args.packs:
            continue
        meta = json.loads((PACKS / p["id"] / "meta.json").read_text(encoding="utf-8"))
        print(f"-> {p['id']} ({meta['label']}, photos={p['has_photos']})")
        app_id = client.post(f"/api/demo/packs/{p['id']}/load").json()["application_id"]
        force = "?force=true" if args.force else ""
        t0 = time.perf_counter()
        extracted = stream(client, f"/api/applications/{app_id}/extract/stream{force}")
        t1 = time.perf_counter()
        assessed = stream(client, f"/api/applications/{app_id}/assess/stream{force}")
        t2 = time.perf_counter()
        ext = score_extraction(ground_truth(p["id"]), extracted.get("entries", []))
        memo = assessed.get("memo") or {}
        decision = memo.get("decision", "none")
        fails = sorted(c["id"] for c in assessed.get("checks", []) if c["result"] == "fail")
        row = {"pack": p["id"], "label": meta["label"], "market": meta["market"], "real_photos": p["has_photos"],
               **ext, "decision": decision, "decision_correct": decision in EXPECTED[meta["label"]],
               "amount": memo.get("amount", 0), "fails": fails, "memo_model": memo.get("model"),
               "extract_seconds": round(t1 - t0, 1), "decision_seconds": round(t2 - t0, 1)}
        rows.append(row)
        print(f"   lines {ext['exact_lines']}/{ext['truth_lines']} ({ext['line_accuracy']:.1%}), "
              f"decision {decision} ({'ok' if row['decision_correct'] else 'WRONG'}), {row['decision_seconds']}s")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    truth = sum(r["truth_lines"] for r in rows)
    exact = sum(r["exact_lines"] for r in rows)
    real = [r for r in rows if r["real_photos"]]
    summary = [
        "# Bukti evaluation",
        "",
        f"- Packs: {len(rows)} ({len(real)} with real handwritten photos)",
        f"- Line-level extraction accuracy (date + direction + amount exact): {exact}/{truth} = {exact / max(1, truth):.1%}",
        f"- Decision accuracy (genuine→approve, inflated→reduced, fabricated→refer): "
        f"{sum(r['decision_correct'] for r in rows)}/{len(rows)}",
        f"- Median time from evidence to decision: {sorted(r['decision_seconds'] for r in rows)[len(rows) // 2] if rows else 0}s",
        "",
        "| Pack | Type | Market | Real photos | Lines exact | Decision | Correct | Seconds |",
        "|---|---|---|---|---|---|---|---|",
    ] + [f"| {r['pack']} | {r['label']} | {r['market']} | {'yes' if r['real_photos'] else 'placeholder'} | "
         f"{r['exact_lines']}/{r['truth_lines']} | {r['decision']} | {'✓' if r['decision_correct'] else '✗'} | "
         f"{r['decision_seconds']} |" for r in rows]
    (OUT / "results.md").write_text("\n".join(summary) + "\n", encoding="utf-8")
    print("\n".join(summary))


if __name__ == "__main__":
    main()
