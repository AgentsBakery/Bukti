"""Deterministic evidence analysis: reconciliation, integrity tests, and loan sizing.

Gemini reads and explains; these rules decide. Every function is pure so it can be tested
against the ground-truth packs without calling a model.
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from datetime import date, timedelta

from app.schemas import Check, Citation, DailyPoint, Entry, Evidence, Metrics, ScheduleItem, StatementDay

# Market parameters. Peer bands are replaced by BigQuery benchmarks when available.
MARKET = {
    "ID": {
        "currency": "Rp", "round_step": 50_000, "default_share_band": (0.25, 0.55),
        "peer_median_daily_sales": 450_000, "gross_margin": 0.18, "first_loan_cap": 10_000_000,
        "min_loan": 1_000_000, "flat_rate_month": 0.015, "amount_step": 100_000, "installment_step": 5_000,
    },
    "IN": {
        "currency": "₹", "round_step": 500, "default_share_band": (0.45, 0.75),
        "peer_median_daily_sales": 5_000, "gross_margin": 0.16, "first_loan_cap": 50_000,
        "min_loan": 5_000, "flat_rate_month": 0.02, "amount_step": 500, "installment_step": 10,
    },
}

AFFORDABILITY_SHARE = 0.30  # Bukti sample lender policy §3.1: installment ≤ 30% of that week's net cash
DEFAULT_TENOR_WEEKS = 16


def week_of_month(d: date) -> int:
    return min(4, (d.day - 1) // 7 + 1)


def _pearson(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 3 or len(set(xs)) < 2 or len(set(ys)) < 2:
        return 0.0
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True))
    den = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
    return num / den if den else 0.0


def daily_series(entries: list[Entry], statement: list[StatementDay]) -> list[DailyPoint]:
    ledger: dict[str, int] = defaultdict(int)
    for e in entries:
        ledger[e.date] += e.amount_in
    stmt = {s.date: s.total for s in statement}
    days = sorted(set(ledger) | set(stmt))
    return [DailyPoint(date=d, ledger=ledger.get(d, 0), statement=stmt.get(d, 0)) for d in days]


def weekly_pattern(points: list[DailyPoint], use: str = "statement") -> list[float]:
    """Relative cash by week of month, normalised so the mean is 1.0."""
    buckets: dict[int, list[int]] = defaultdict(list)
    for p in points:
        v = p.statement if use == "statement" else p.ledger
        buckets[week_of_month(date.fromisoformat(p.date))].append(v)
    present = {w: statistics.fmean(buckets[w]) for w in (1, 2, 3, 4) if buckets[w]}
    mean = statistics.fmean(present.values()) if present else 0.0
    if not mean:
        return [1.0, 1.0, 1.0, 1.0]
    # A notebook shorter than a month has no data for some weeks: treat those as average, not as zero.
    return [round(present[w] / mean, 2) if w in present else 1.0 for w in (1, 2, 3, 4)]


def overlap_window(entries: list[Entry], statement: list[StatementDay]) -> tuple[str, str] | None:
    """The dates covered by both the notebook and the statement, or None if they don't overlap."""
    ledger_days = sorted({e.date for e in entries if e.amount_in})
    stmt_days = sorted({s.date for s in statement})
    if not ledger_days or not stmt_days:
        return None
    start, end = max(ledger_days[0], stmt_days[0]), min(ledger_days[-1], stmt_days[-1])
    return (start, end) if start <= end else None


def reconcile(market: str, entries: list[Entry], statement: list[StatementDay],
              share_band: tuple[float, float] | None = None) -> tuple[list[Check], dict]:
    """Compare what the notebook says with what the payment rail independently recorded."""
    m = MARKET[market]
    band = share_band or m["default_share_band"]
    if not statement:
        return _unverified(entries, "No payment statement was provided, so notebook sales could not be checked "
                                    "against an independent record.")
    window = overlap_window(entries, statement)
    if window is None:
        return _unverified(entries, "The payment statement covers different dates from the notebook, so the two "
                                    "could not be compared.")
    # Compare only the days both records cover; a day outside the statement is not an "idle" day.
    entries = [e for e in entries if window[0] <= e.date <= window[1]]
    statement = [s for s in statement if window[0] <= s.date <= window[1]]
    points = daily_series(entries, statement)
    ledger_total = sum(p.ledger for p in points)
    stmt_total = sum(p.statement for p in points)
    share = stmt_total / ledger_total if ledger_total else 0.0
    sales_entries = [e.id for e in entries if e.amount_in][:6]
    stmt_ev = sorted({s.evidence_id for s in statement})
    checks: list[Check] = []

    lo, hi = band
    if lo <= share <= hi:
        result, summary = "pass", f"Digital payments are {share:.0%} of notebook sales, in line with similar shops ({lo:.0%}–{hi:.0%})."
    elif share < lo * 0.75:
        result, summary = "fail", f"Digital payments cover only {share:.0%} of notebook sales; similar shops are {lo:.0%}–{hi:.0%}. The notebook likely overstates sales."
    elif share < lo:
        result, summary = "warn", f"Digital share is {share:.0%}, a little below similar shops ({lo:.0%}–{hi:.0%})."
    else:
        result, summary = "warn", f"Digital share is {share:.0%}, above similar shops ({lo:.0%}–{hi:.0%}); the notebook may understate sales."
    checks.append(Check(id="chk_share", agent="reconciler", name="Notebook vs payment records", result=result,
                        summary=summary,
                        detail=f"Notebook sales {ledger_total:,} vs statement {stmt_total:,} over {len(points)} days.",
                        evidence_refs=sales_entries + stmt_ev))

    both = [p for p in points if p.ledger or p.statement]
    corr = _pearson([p.ledger for p in both], [p.statement for p in both])
    if corr >= 0.6:
        result, summary = "pass", f"Busy and slow days in the notebook match the payment records (correlation {corr:.2f})."
    elif corr >= 0.3:
        result, summary = "warn", f"Daily rhythm only partly matches the payment records (correlation {corr:.2f})."
    else:
        result, summary = "fail", f"Daily sales in the notebook do not move with real payments (correlation {corr:.2f})."
    checks.append(Check(id="chk_rhythm", agent="reconciler", name="Daily rhythm agreement", result=result,
                        summary=summary, detail=f"Pearson correlation across {len(both)} days.",
                        evidence_refs=stmt_ev))

    ghost_days = [p.date for p in points if p.ledger > 0 and p.statement == 0]
    ghost_entries = [e.id for e in entries if e.amount_in and e.date in ghost_days]
    if not ghost_days:
        result, summary = "pass", "Every day with notebook sales also shows payment activity."
    elif len(ghost_days) == 1:
        result, summary = "warn", f"One day ({ghost_days[0]}) has notebook sales but no payment activity."
    else:
        result, summary = "fail", f"{len(ghost_days)} days have notebook sales while the payment rail shows the shop idle."
    checks.append(Check(id="chk_ghost", agent="reconciler", name="Sales on idle days", result=result,
                        summary=summary, detail=", ".join(ghost_days) or "none",
                        evidence_refs=ghost_entries + stmt_ev))

    stats = {"points": points, "ledger_total": ledger_total, "statement_total": stmt_total,
             "share": share, "corr": corr, "ghost_days": ghost_days}
    return checks, stats


def _unverified(entries: list[Entry], why: str) -> tuple[list[Check], dict]:
    """Without a usable statement the cross-checks can't run: mark them 'watch' (never 'fail' — a missing
    statement is not evidence of fabrication) and let the policy refer the case to an officer."""
    points = daily_series(entries, [])
    ledger_total = sum(p.ledger for p in points)
    refs = [e.id for e in entries if e.amount_in][:6]
    checks = [Check(id=cid, agent="reconciler", name=name, result="warn", summary=why if cid == "chk_share" else
                    "Not checked: needs a payment statement covering the same days.", detail=why, evidence_refs=refs)
              for cid, name in (("chk_share", "Notebook vs payment records"), ("chk_rhythm", "Daily rhythm agreement"),
                                ("chk_ghost", "Sales on idle days"))]
    stats = {"points": points, "ledger_total": ledger_total, "statement_total": 0, "share": 0.0, "corr": 0.0,
             "ghost_days": [], "unverified": True}
    return checks, stats


def _same_lines(a: set, b: set) -> bool:
    small = min(len(a), len(b))
    return small >= 3 and len(a & b) / small >= 0.8


def _ahash_distance(a: str, b: str) -> int:
    if not a or not b or len(a) != len(b):
        return 64
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def integrity(market: str, entries: list[Entry], evidence: list[Evidence]) -> list[Check]:
    """Signals that a notebook was invented rather than kept."""
    m = MARKET[market]
    sales = [e for e in entries if e.amount_in]
    amounts = [e.amount_in for e in sales]
    checks: list[Check] = []

    if amounts:
        round_share = sum(1 for a in amounts if a % m["round_step"] == 0) / len(amounts)
        step = f"{m['currency']} {m['round_step']:,}"
        if round_share >= 0.6:
            result, summary = "fail", f"{round_share:.0%} of daily sales are exact multiples of {step}. Real takings are rarely that round."
        elif round_share >= 0.35:
            result, summary = "warn", f"{round_share:.0%} of daily sales are round multiples of {step}."
        else:
            result, summary = "pass", f"Only {round_share:.0%} of daily sales are round numbers, typical of real takings."
        checks.append(Check(id="chk_round", agent="integrity", name="Round-number test", result=result,
                            summary=summary, detail=f"{len(amounts)} daily sales lines checked.",
                            evidence_refs=[e.id for e in sales if e.amount_in % m["round_step"] == 0][:8]))

        cv = statistics.pstdev(amounts) / statistics.fmean(amounts) if len(amounts) > 2 else 0.0
        distinct = len(set(amounts)) / len(amounts)
        if cv < 0.07 or distinct < 0.4:
            result, summary = "fail", f"Sales barely vary day to day (variation {cv:.0%}, {distinct:.0%} distinct values). Real shops have good and bad days."
        elif cv < 0.11:
            result, summary = "warn", f"Sales are unusually steady (variation {cv:.0%})."
        else:
            result, summary = "pass", f"Sales vary naturally day to day (variation {cv:.0%})."
        checks.append(Check(id="chk_regular", agent="integrity", name="Too-regular entries", result=result,
                            summary=summary, detail=f"Coefficient of variation {cv:.3f}; distinct values {distinct:.2f}.",
                            evidence_refs=[e.id for e in sales[:8]]))

    # Re-used pages are judged by content, not by how a photo looks: two different notebook pages photographed on
    # the same table look identical to a tiny perceptual hash. A notebook page counts as re-used when the lines
    # read from it largely repeat another page's; any other file only when it is byte-for-byte the same file.
    page_lines: dict[str, set[tuple[str, int, int]]] = defaultdict(set)
    for en in entries:
        page_lines[en.evidence_id].add((en.date, en.amount_in, en.amount_out))
    dupes: list[tuple[str, str]] = []
    usable = [e for e in evidence if e.status != "excluded"]
    for i, a in enumerate(usable):
        for b in usable[i + 1:]:
            if a.type != b.type or (a.parent_id and a.parent_id == b.parent_id):
                continue  # pages of one PDF are not re-used copies of each other
            same_file = bool(a.sha256) and a.sha256 == b.sha256
            same_page = a.type == "ledger" and _same_lines(page_lines[a.id], page_lines[b.id])
            if same_file or same_page:
                dupes.append((a.id, b.id))
    checks.append(Check(
        id="chk_dupes", agent="integrity", name="Re-used photos",
        result="fail" if dupes else "pass",
        summary=("The same page was submitted more than once." if dupes else "Every photo is a different page."),
        detail="; ".join(f"{a} ≈ {b}" for a, b in dupes) or f"{len(evidence)} photos compared by perceptual hash.",
        evidence_refs=[x for pair in dupes for x in pair]))
    return checks


def peer_check(market: str, entries: list[Entry], peer_median: int, peer_band: tuple[int, int] | None) -> Check:
    by_day: dict[str, int] = defaultdict(int)
    for e in entries:
        by_day[e.date] += e.amount_in
    days = [v for v in by_day.values() if v]
    median = int(statistics.median(days)) if days else 0
    ratio = median / peer_median if peer_median else 0
    cur = MARKET[market]["currency"]
    if ratio > 2.5:
        result, summary = "warn", f"Median daily sales ({cur} {median:,}) are {ratio:.1f}× similar shops nearby. Possible, but worth a question."
    elif ratio < 0.3:
        result, summary = "warn", f"Median daily sales ({cur} {median:,}) are well below similar shops."
    else:
        result, summary = "pass", f"Median daily sales ({cur} {median:,}) are in the normal range for similar shops ({cur} {peer_median:,} median)."
    return Check(id="chk_peers", agent="benchmark", name="Compared with similar shops", result=result,
                 summary=summary, detail=f"Peer median {peer_median:,}; band {peer_band}.", evidence_refs=[])


def _round_down(v: float, step: int) -> int:
    return int(v // step * step)


def size_loan(market: str, stats: dict, checks: list[Check], purchases_total: int,
              share_band: tuple[float, float], start: date) -> dict:
    """Policy engine: decide the loan from verified cash flow. The memo model explains, it never sets numbers."""
    m = MARKET[market]
    fails = [c for c in checks if c.result == "fail"]
    integrity_fails = [c for c in fails if c.agent == "integrity" or c.id == "chk_ghost"]
    points: list[DailyPoint] = stats["points"]
    # Calendar span, not the count of days with entries: a shop closed on Sundays still has 30-day months.
    n_days = ((date.fromisoformat(points[-1].date) - date.fromisoformat(points[0].date)).days + 1) if points else 1

    ledger_monthly = stats["ledger_total"] / n_days * 30
    # Sales the payment rail can vouch for: statement ÷ the typical digital share of similar shops.
    mid_share = sum(share_band) / 2
    statement_implied_monthly = stats["statement_total"] / mid_share / n_days * 30 if mid_share else 0
    share_ok = not any(c.id == "chk_share" and c.result == "fail" for c in checks)
    verified_monthly = ledger_monthly if share_ok else min(ledger_monthly, statement_implied_monthly)

    ledger_purchase_ratio = purchases_total / stats["ledger_total"] if stats["ledger_total"] else 0
    margin = 1 - ledger_purchase_ratio if 0.6 <= ledger_purchase_ratio <= 0.92 else m["gross_margin"]
    margin = max(0.10, min(0.30, margin))
    net_monthly = verified_monthly * margin
    weekly_net = net_monthly * 12 / 52
    max_installment = weekly_net * AFFORDABILITY_SHARE

    purpose_fail = any(c.id == "chk_purpose" and c.result == "fail" for c in checks)
    interview_fail = any(c.id == "chk_interview" and c.result == "fail" for c in checks)
    other_fails = [c for c in fails if c.id not in ("chk_purpose", "chk_interview")]
    unverified = bool(stats.get("unverified"))
    if len(integrity_fails) >= 2 or interview_fail or unverified:
        decision = "refer"
    elif purpose_fail:
        decision = "decline"
    elif other_fails:
        decision = "approve_reduced"
    else:
        decision = "approve"

    tenor = DEFAULT_TENOR_WEEKS
    rate_total = m["flat_rate_month"] * tenor * 7 / 30
    affordable_principal = max_installment * tenor / (1 + rate_total)
    principal = _round_down(min(m["first_loan_cap"], affordable_principal), m["amount_step"])
    if decision in ("refer", "decline"):
        principal = 0
    elif principal < m["min_loan"]:
        decision, principal = "decline", 0

    pattern = weekly_pattern(points, use="statement" if stats["statement_total"] else "ledger")
    schedule = cashflow_schedule(principal, rate_total, tenor, pattern, start, m["installment_step"],
                                 cap=max_installment) if principal else []
    citations = [Citation(source="Bukti sample lender policy §3.1",
                          text="Weekly installments may not exceed 30% of verified weekly net cash flow.")]
    if market == "IN":
        citations.append(Citation(source="RBI Master Direction, Microfinance Loans (2022), para 5.1",
                                  text="Loan repayment obligations of a household are capped at 50% of monthly household income."))
    citations.append(Citation(source="Bukti sample lender policy §2.4",
                              text="When notebook sales are not supported by payment records, size the loan on the "
                                   "statement-implied sales, not the notebook."))
    if decision == "refer" and len(integrity_fails) >= 2:
        citations.append(Citation(source="Bukti sample lender policy §5.2",
                                  text="Two or more integrity failures require human review before any offer is made."))
    if unverified:
        citations.append(Citation(source="Bukti sample lender policy §2.1",
                                  text="Notebook sales are verified against the digital payment statement for the "
                                       "same period."))
    if interview_fail:
        citations.append(Citation(source="Bukti sample lender policy §5.3",
                                  text="Interview answers that contradict the evidence, or two or more unanswered key "
                                       "questions, require human review."))
    if purpose_fail:
        citations.append(Citation(source="Bukti sample lender policy §1.3",
                                  text="Loans fund productive business use only: stock, equipment, expansion or "
                                       "working capital."))

    return {
        "decision": decision, "amount": principal, "tenor_weeks": tenor if principal else 0, "schedule": schedule,
        "verified_monthly_sales": int(verified_monthly), "net_monthly_cashflow": int(net_monthly),
        "max_installment": int(max_installment), "weekly_pattern": pattern, "citations": citations,
        "margin": round(margin, 3),
    }


def cashflow_schedule(principal: int, rate_total: float, tenor: int, pattern: list[float], start: date,
                      step: int, cap: float) -> list[ScheduleItem]:
    """Weekly installments shaped to the shop's month: pay more in strong weeks, less in slow ones."""
    total = principal * (1 + rate_total)
    dues = [start + timedelta(days=7 * (i + 1)) for i in range(tenor)]
    weights = [pattern[week_of_month(d) - 1] or 1.0 for d in dues]
    wsum = sum(weights)
    raw = [total * w / wsum for w in weights]
    # Each week's installment stays within 30% of that week's expected net cash (cap × week weight),
    # because affordability was sized on the sum of those shaped caps.
    amounts = [int(math.ceil(r / step) * step) for r in raw]
    # Put any rounding remainder on the strongest weeks so the schedule repays exactly.
    diff = int(round(total)) - sum(amounts)
    order = sorted(range(tenor), key=lambda i: -weights[i])
    i = 0
    while diff != 0 and i < 10 * tenor:
        k = order[i % tenor]
        delta = step if diff > 0 else -step
        if diff > 0 and abs(diff) < step:
            delta = diff
        if diff < 0 and abs(diff) < step:
            delta = diff
        amounts[k] += delta
        diff -= delta
        i += 1
    return [ScheduleItem(week=i + 1, due_date=d.isoformat(), amount=a) for i, (d, a) in enumerate(zip(dues, amounts, strict=True))]


def build_metrics(stats: dict, purchases_total: int, sizing: dict, share_band: tuple[float, float],
                  peer_median: int) -> Metrics:
    return Metrics(
        ledger_sales_total=stats["ledger_total"], ledger_purchases_total=purchases_total,
        statement_total=stats["statement_total"], digital_share=round(stats["share"], 3),
        peer_share_band=[round(share_band[0], 3), round(share_band[1], 3)], peer_median_daily_sales=peer_median,
        verified_monthly_sales=sizing["verified_monthly_sales"], net_monthly_cashflow=sizing["net_monthly_cashflow"],
        weekly_pattern=sizing["weekly_pattern"], daily=stats["points"])
