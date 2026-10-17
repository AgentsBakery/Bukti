"""Development-only stand-in for Gemini extraction (BUKTI_DEV_GROUND_TRUTH=1).

Returns a demo pack's ground truth with boxes matching the generated placeholder pages, so the
pipeline and UI can be exercised without cloud credentials. Never enabled in deployment.
"""

from __future__ import annotations

import csv
import os

from app.config import settings
from app.schemas import Application, Entry, Evidence, StatementDay
from app.store import new_id

ENABLED = os.getenv("BUKTI_DEV_GROUND_TRUTH", "0") == "1"


def ledger_entries(app: Application, ev: Evidence) -> list[Entry]:
    page = int(ev.label.rsplit(" ", 1)[-1]) if ev.label[-1].isdigit() else 1
    path = settings.data_dir / "packs" / (app.pack_id or "") / "ground_truth.csv"
    out = []
    with open(path, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if int(r["page"]) != page:
                continue
            line = int(r["line"])
            y0 = int((120 + 64 * line - 56) / 1600 * 1000)
            y1 = int((120 + 64 * line + 4) / 1600 * 1000)
            amt_in, amt_out = int(r["amount_in"]), int(r["amount_out"])
            x0, x1 = (595, 720) if amt_in else (795, 910)
            out.append(Entry(id=new_id("en"), evidence_id=ev.id, date=r["date"], description=r["description"],
                             amount_in=amt_in, amount_out=amt_out, bbox=[y0, x0, y1, x1],
                             row_bbox=[y0, 35, y1, 960], confidence=0.97))
    return out


def statement_days(app: Application, ev: Evidence) -> list[StatementDay]:
    path = settings.data_dir / "packs" / (app.pack_id or "") / "statement.csv"
    out = []
    with open(path, encoding="utf-8") as fh:
        for i, r in enumerate(csv.DictReader(fh)):
            y0 = int((415 + 40 * i) / 1754 * 1000)
            out.append(StatementDay(date=r["date"], transactions=int(r["transactions"]), total=int(r["total"]),
                                    evidence_id=ev.id, bbox=[y0, 32, y0 + 22, 968]))
    return out
