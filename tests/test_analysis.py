"""The deterministic rules must separate genuine, inflated, and fabricated packs on ground truth alone."""

from __future__ import annotations

import csv
import json
from datetime import date
from pathlib import Path

import pytest

from agents import analysis
from app.schemas import Entry, StatementDay

PACKS = Path(__file__).resolve().parent.parent / "data" / "packs"


def load(pack_id: str) -> tuple[dict, list[Entry], list[StatementDay]]:
    d = PACKS / pack_id
    meta = json.loads((d / "meta.json").read_text())
    with open(d / "ground_truth.csv", encoding="utf-8") as fh:
        entries = [Entry(id=f"en_{i}", evidence_id=f"ev_page{r['page']}", date=r["date"], description=r["description"],
                         amount_in=int(r["amount_in"]), amount_out=int(r["amount_out"]), confidence=1.0)
                   for i, r in enumerate(csv.DictReader(fh))]
    with open(d / "statement.csv", encoding="utf-8") as fh:
        stmt = [StatementDay(date=r["date"], transactions=int(r["transactions"]), total=int(r["total"]),
                             evidence_id="ev_stmt") for r in csv.DictReader(fh)]
    return meta, entries, stmt


def assess(pack_id: str) -> tuple[dict, list, dict]:
    meta, entries, stmt = load(pack_id)
    market = meta["market"]
    band = analysis.MARKET[market]["default_share_band"]
    checks, stats = analysis.reconcile(market, entries, stmt, band)
    checks += analysis.integrity(market, entries, [])
    purchases = sum(e.amount_out for e in entries)
    sizing = analysis.size_loan(market, stats, checks, purchases, band, date(2026, 10, 19))
    return meta, checks, sizing


@pytest.mark.parametrize("pack_id", ["sari", "murugan", "joko", "lakshmi"])
def test_genuine_packs_are_approved(pack_id):
    _, checks, sizing = assess(pack_id)
    assert not [c for c in checks if c.result == "fail"], [c.summary for c in checks]
    assert sizing["decision"] == "approve"
    assert sizing["amount"] > 0
    assert sum(s.amount for s in sizing["schedule"]) > sizing["amount"]
    step = analysis.MARKET["ID" if pack_id in ("sari", "joko") else "IN"]["installment_step"]
    pattern = sizing["weekly_pattern"]
    for s in sizing["schedule"]:
        weight = pattern[analysis.week_of_month(date.fromisoformat(s.due_date)) - 1]
        assert s.amount <= sizing["max_installment"] * weight * 1.02 + 2 * step, (s, weight)


@pytest.mark.parametrize("pack_id", ["dewi", "selvam"])
def test_inflated_packs_are_reduced_to_verified_sales(pack_id):
    _, checks, sizing = assess(pack_id)
    share = next(c for c in checks if c.id == "chk_share")
    assert share.result == "fail"
    assert sizing["decision"] in {"approve_reduced", "decline"}


@pytest.mark.parametrize("pack_id", ["rina", "karthik"])
def test_fabricated_packs_are_referred(pack_id):
    _, checks, sizing = assess(pack_id)
    fails = {c.id for c in checks if c.result == "fail"}
    assert {"chk_round", "chk_regular"} <= fails or {"chk_ghost", "chk_round"} <= fails, fails
    assert sizing["decision"] == "refer"
    assert sizing["amount"] == 0


def test_schedule_is_cashflow_shaped():
    _, _, sizing = assess("sari")
    pattern = sizing["weekly_pattern"]
    assert pattern[1] < pattern[0] and pattern[1] < pattern[3], pattern  # mid-month dip
    by_week = {}
    for s in sizing["schedule"]:
        wom = analysis.week_of_month(date.fromisoformat(s.due_date))
        by_week.setdefault(wom, []).append(s.amount)
    assert max(by_week[2]) < max(by_week[4])
