"""Reading real documents: transaction-level statements, missing or non-overlapping statements, short notebooks."""

from __future__ import annotations

from datetime import date

from agents import analysis
from agents.extractor import _valid_date, merge_statement_days, statement_days
from app.schemas import Entry, StatementDay


def entry(d: str, amount: int) -> Entry:
    return Entry(id=f"en_{d}", evidence_id="ev_1", date=d, description="jualan", amount_in=amount)


def test_transactions_are_added_up_per_day_and_money_out_is_ignored():
    raw = [{"date": "2026-10-01", "time": "08:10", "amount": 15000, "transactions": 1, "incoming": True, "row_box": [1, 1, 2, 2]},
           {"date": "2026-10-01", "time": "09:30", "amount": 22000, "transactions": 1, "incoming": True, "row_box": [3, 1, 4, 2]},
           {"date": "2026-10-01", "time": "17:00", "amount": 500000, "transactions": 1, "incoming": False, "row_box": [5, 1, 6, 2]},
           {"date": "2026-10-02", "time": "", "amount": 410000, "transactions": 23, "incoming": True, "row_box": [7, 1, 8, 2]}]
    days = statement_days(raw, "ev_s")
    assert [(d.date, d.total, d.transactions) for d in days] == [("2026-10-01", 37000, 2), ("2026-10-02", 410000, 23)]
    assert days[0].bbox == [1, 1, 4, 2]  # one box covering both payments of the day


def test_old_cached_statement_format_still_reads():
    days = statement_days([{"date": "2026-09-01", "transactions": 12, "total": 200000, "row_box": [1, 1, 2, 2]}], "ev")
    assert days[0].total == 200000 and days[0].transactions == 12


def test_overlapping_screenshots_are_not_counted_twice():
    a = [StatementDay(date="2026-10-01", transactions=3, total=90000, evidence_id="p1")]
    b = [StatementDay(date="2026-10-01", transactions=3, total=90000, evidence_id="p2"),
         StatementDay(date="2026-10-02", transactions=2, total=50000, evidence_id="p2")]
    merged = merge_statement_days([a, b])
    assert [(d.date, d.total) for d in merged] == [("2026-10-01", 90000), ("2026-10-02", 50000)]


def test_a_date_in_the_future_is_last_year():
    assert _valid_date("2026-12-05", "", date(2026, 10, 18)) == "2025-12-05"
    assert _valid_date("2026-10-17", "", date(2026, 10, 18)) == "2026-10-17"


def test_no_statement_is_unverified_not_fabricated():
    entries = [entry(f"2026-10-{d:02d}", 400_000 + d * 1000) for d in range(1, 15)]
    checks, stats = analysis.reconcile("ID", entries, [])
    assert {c.id: c.result for c in checks} == {"chk_share": "warn", "chk_rhythm": "warn", "chk_ghost": "warn"}
    sizing = analysis.size_loan("ID", stats, checks, 0, (0.45, 0.75), date(2026, 10, 19))
    assert sizing["decision"] == "refer" and sizing["amount"] == 0
    assert any("§2.1" in c.source for c in sizing["citations"])


def test_only_days_both_records_cover_are_compared():
    # Notebook 1–20 Oct; statement 11–31 Oct. Days 1–10 have no statement but are not "idle days".
    entries = [entry(f"2026-10-{d:02d}", 400_000) for d in range(1, 21)]
    statement = [StatementDay(date=f"2026-10-{d:02d}", transactions=10, total=240_000, evidence_id="s") for d in range(11, 32)]
    checks, stats = analysis.reconcile("ID", entries, statement)
    results = {c.id: c.result for c in checks}
    assert results["chk_ghost"] == "pass"
    assert {p.date for p in stats["points"]} == {f"2026-10-{d:02d}" for d in range(11, 21)}


def test_statement_for_other_dates_is_unverified():
    entries = [entry(f"2026-10-{d:02d}", 400_000) for d in range(1, 10)]
    statement = [StatementDay(date="2026-08-01", transactions=1, total=1000, evidence_id="s")]
    checks, stats = analysis.reconcile("ID", entries, statement)
    assert stats.get("unverified") and {c.result for c in checks} == {"warn"}


def test_short_notebook_weeks_are_neutral():
    points = [analysis.DailyPoint(date=f"2026-10-{d:02d}", ledger=100, statement=0) for d in range(1, 8)]
    assert analysis.weekly_pattern(points, use="ledger") == [1.0, 1.0, 1.0, 1.0]


def test_pages_of_one_pdf_and_lookalike_statements_are_not_duplicates():
    from app.schemas import Evidence

    def ev(i, kind, ahash, sha, parent=None):
        return Evidence(id=f"ev{i}", type=kind, label="x", url="", width=1, height=1, sha256=sha, ahash=ahash, parent_id=parent)

    same_pdf = [ev(1, "statement", "ffff0000ffff0000", "a", "doc1"), ev(2, "statement", "ffff0000ffff0000", "b", "doc1")]
    two_statements = [ev(3, "statement", "ffff0000ffff0000", "c"), ev(4, "statement", "ffff0000ffff0001", "d")]
    reused_photo = [ev(5, "ledger", "0f0f0f0f0f0f0f0f", "e"), ev(6, "ledger", "0f0f0f0f0f0f0f0e", "f")]
    dupes = lambda evs: next(c for c in analysis.integrity("ID", [], evs) if c.id == "chk_dupes").result  # noqa: E731
    assert dupes(same_pdf) == "pass"
    assert dupes(two_statements) == "pass"
    assert dupes(reused_photo) == "fail"


def test_per_item_rows_are_added_up_by_code_not_the_model():
    from agents.extractor import sales_in
    # 25-Jan-12 on the user's tea-shop sheet: the model said 74, its own parts add up to 72 (the true total).
    assert sales_in({"amount_in": 74, "parts": [40, 12, 10, 10]}) == 72
    assert sales_in({"amount_in": 24, "parts": []}) == 24          # a single-amount row
    assert sales_in({"amount_in": 120, "parts": [0, 120]}) == 120  # zero parts are ignored
