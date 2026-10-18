"""Reading real documents: transaction-level statements, missing or non-overlapping statements, short notebooks."""

from __future__ import annotations

from datetime import date

from agents import analysis
from agents.extractor import _valid_date, statement_days
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


def test_overlapping_screenshots_count_each_payment_once():
    from agents.extractor import merge_statement, statement_rows

    def shot(ev, rows):
        return statement_rows([{"date": d, "time": t, "amount": a, "transactions": 1, "incoming": True,
                                "row_box": [1, 1, 2, 2]} for d, t, a in rows], ev)

    # Scrolling: the second screenshot repeats the last two payments of the first.
    s1 = shot("s1", [("2026-10-01", "08:10", 15000), ("2026-10-01", "09:00", 20000), ("2026-10-01", "09:00", 20000),
                     ("2026-10-02", "07:30", 12000)])
    s2 = shot("s2", [("2026-10-01", "09:00", 20000), ("2026-10-02", "07:30", 12000), ("2026-10-02", "11:45", 30000)])
    days = {d.date: d.total for d in merge_statement([s1, s2])}
    # Oct 1: 15,000 + two equal 20,000 payments at 09:00 on the same screenshot (both real); Oct 2: 12,000 + 30,000.
    assert days == {"2026-10-01": 55000, "2026-10-02": 42000}


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


def test_reused_pages_are_judged_by_content_not_looks():
    from app.schemas import Evidence

    def ev(i, kind, sha, parent=None):
        # every page carries the same perceptual hash: photos on one table look alike at 8x8
        return Evidence(id=f"ev{i}", type=kind, label="x", url="", width=1, height=1, sha256=sha, ahash="ffff0000ffff0000",
                        parent_id=parent)

    def lines(page, start, amounts):
        return [Entry(id=f"{page}{k}", evidence_id=page, date=f"2026-10-{start + k:02d}", description="s", amount_in=a)
                for k, a in enumerate(amounts)]

    dupes = lambda ents, evs: next(c for c in analysis.integrity("ID", ents, evs) if c.id == "chk_dupes").result  # noqa: E731
    two_pages = lines("ev1", 1, [100, 200, 300, 400]) + lines("ev2", 5, [500, 600, 700, 800])
    assert dupes(two_pages, [ev(1, "ledger", "a"), ev(2, "ledger", "b")]) == "pass"       # different pages, alike photos
    same_page = lines("ev1", 1, [100, 200, 300, 400]) + lines("ev2", 1, [100, 200, 300, 400])
    assert dupes(same_page, [ev(1, "ledger", "a"), ev(2, "ledger", "b")]) == "fail"       # one page photographed twice
    assert dupes([], [ev(1, "receipt", "same"), ev(2, "receipt", "same")]) == "fail"      # the same file uploaded twice
    assert dupes([], [ev(1, "statement", "a", "doc"), ev(2, "statement", "b", "doc")]) == "pass"  # pages of one PDF


def test_per_item_rows_are_added_up_by_code_not_the_model():
    from agents.extractor import sales_in
    # 25-Jan-12 on the user's tea-shop sheet: the model said 74, its own parts add up to 72 (the true total).
    assert sales_in({"amount_in": 74, "parts": [40, 12, 10, 10]}) == 72
    assert sales_in({"amount_in": 24, "parts": []}) == 24          # a single-amount row
    assert sales_in({"amount_in": 120, "parts": [0, 120]}) == 120  # zero parts are ignored
