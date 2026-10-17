"""Interview answers must change the outcome: contradictions refer, non-business purposes decline."""

from __future__ import annotations

from datetime import date

from agents import analysis
from agents.verifier import Claims, _evidence, assess_claims
from app.schemas import Application, Fact, Persona
from tests.test_analysis import load


def case(pack: str, facts: list[tuple[str, str, str]]) -> Application:
    meta, entries, stmt = load(pack)
    return Application(id="app_test", persona=Persona(name="T", business="shop", city="x"), market=meta["market"],
                       language="en", currency="Rp" if meta["market"] == "ID" else "₹", entries=entries,
                       statement=stmt, facts=[Fact(id=f"fact_{i}", field=f, label=f, value=v, quote=q)
                                              for i, (f, v, q) in enumerate(facts)])


def decide(app: Application, claims: Claims | None) -> tuple[list, dict]:
    ev = _evidence(app)
    band = analysis.MARKET[app.market]["default_share_band"]
    checks, stats = analysis.reconcile(app.market, app.entries, app.statement, band)
    checks += analysis.integrity(app.market, app.entries, [])
    checks += assess_claims(app, claims, ev)
    sizing = analysis.size_loan(app.market, stats, checks, sum(e.amount_out for e in app.entries), band,
                                date(2026, 10, 19))
    return checks, sizing


GOOD = [("years_in_business", "12 years", "Twelve years"), ("daily_sales", "Rp 450.000", "About 450 thousand"),
        ("slow_period_reason", "before payday", "People get paid at month end"),
        ("loan_purpose", "Lebaran stock", "Buy stock for Lebaran"), ("other_income", "husband ojek", "Ojek")]


def test_consistent_interview_keeps_the_approval():
    app = case("sari", GOOD)
    claims = Claims(stated_daily_sales=450_000, daily_sales_answered=True, stated_business_age_days=4380,
                    slow_period_reason_kind="business", loan_purpose_kind="productive",
                    loan_purpose_summary="stock for Lebaran", other_income_summary="husband drives an ojek")
    checks, sizing = decide(app, claims)
    assert {c.id: c.result for c in checks}["chk_interview"] == "pass"
    assert {c.id: c.result for c in checks}["chk_purpose"] == "pass"
    assert sizing["decision"] == "approve" and sizing["amount"] > 0


def test_party_loan_is_declined():
    # The answers given in the live test on 2026-10-17 (Murugan pack).
    app = case("murugan", [("years_in_business", "15 years", "I've been running my shop for 15 years."),
                           ("daily_sales", "Apples and bananas", "I sell apples and bananas."),
                           ("slow_period_reason", "Personal reasons", "I had to go on a date."),
                           ("loan_purpose", "Partying", "I'll use it for partying."),
                           ("other_income", "No other income", "No, I have no other income. I'm broke.")])
    claims = Claims(stated_daily_sales=None, daily_sales_answered=False, stated_business_age_days=5475,
                    slow_period_reason_kind="personal", loan_purpose_kind="non_productive",
                    loan_purpose_summary="partying", other_income_summary="none")
    checks, sizing = decide(app, claims)
    results = {c.id: c.result for c in checks}
    assert results["chk_purpose"] == "fail"
    assert results["chk_interview"] in ("warn", "fail")
    assert sizing["decision"] == "decline" and sizing["amount"] == 0
    assert any("§1.3" in c.source for c in sizing["citations"])


def test_contradiction_with_the_notebook_is_referred():
    app = case("murugan", [("years_in_business", "5 days", "5 days"), ("daily_sales", "cool drinks", "cool drinks"),
                           ("loan_purpose", "more types of food", "bring in more types of food")])
    claims = Claims(stated_daily_sales=None, daily_sales_answered=False, stated_business_age_days=5,
                    slow_period_reason_kind="not_asked", loan_purpose_kind="productive",
                    loan_purpose_summary="more food stock", other_income_summary="")
    checks, sizing = decide(app, claims)
    interview = next(c for c in checks if c.id == "chk_interview")
    assert interview.result == "fail" and "28 days" in interview.summary
    assert sizing["decision"] == "refer" and sizing["amount"] == 0


def test_stated_sales_far_from_the_notebook_is_a_contradiction():
    app = case("sari", GOOD)
    claims = Claims(stated_daily_sales=5_000_000, daily_sales_answered=True, stated_business_age_days=4380,
                    slow_period_reason_kind="business", loan_purpose_kind="productive",
                    loan_purpose_summary="stock", other_income_summary="")
    checks, sizing = decide(app, claims)
    assert next(c for c in checks if c.id == "chk_interview").result == "fail"
    assert sizing["decision"] == "refer"


def test_skipped_interview_does_not_change_the_decision():
    app = case("sari", [])
    checks, sizing = decide(app, None)
    assert next(c for c in checks if c.id == "chk_purpose").result == "warn"
    assert sizing["decision"] == "approve"


def test_placeholder_facts_are_rejected():
    from agents.interviewer import is_placeholder
    assert is_placeholder("[Waiting for user response]", "[Waiting for user response]")
    assert is_placeholder("for partying", "")
    assert not is_placeholder("unanswered", "I sell apples and bananas.")
    assert not is_placeholder("Rp 450.000 on a normal day", "Sekitar empat ratus lima puluh ribu")
