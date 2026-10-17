"""Assessment agents: benchmark → (reconciler ∥ integrity) → policy → memo.

The deterministic agents decide; the memo agent (Gemini 4 Argon) explains the decision in the
officer's and the borrower's language, citing evidence ids it was given. It never sets numbers.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from contextlib import asynccontextmanager
from datetime import date, timedelta
from collections.abc import AsyncGenerator

from google.adk.agents import BaseAgent, InvocationContext, LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.events import Event
from google.adk.models import Gemini
from google.genai import types
from pydantic import BaseModel, Field

from agents import analysis, shield, verifier
from agents.extractor import sse
from app import telemetry
from app.config import settings
from app.genai import adk_client_kwargs
from app.schemas import Application, Check, Memo, Ref, now_iso
from app.store import store

log = logging.getLogger("bukti.assess")
MEMO_BUDGETS_S = (70, 40)  # Argon, then Flash; the rules-only memo needs no model
_IDENT = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_BENCH_CACHE: dict[str, tuple] = {}  # benchmarks change rarely; one BigQuery read per market per instance


@asynccontextmanager
async def mutate(app_id: str):
    async with store.lock(app_id):
        app = await store.get(app_id)
        yield app
        await store.save(app)


async def _start(app_id: str, agent: str, summary: str) -> None:
    async with mutate(app_id) as app:
        s = app.step(agent)
        s.status, s.started_at, s.summary = "running", now_iso(), summary


async def _finish(app_id: str, agent: str, summary: str, status: str = "done") -> None:
    async with mutate(app_id) as app:
        s = app.step(agent)
        s.status, s.ended_at, s.summary = status, now_iso(), summary


def _upsert_checks(app: Application, checks: list[Check]) -> None:
    ids = {c.id for c in checks}
    app.checks = [c for c in app.checks if c.id not in ids] + checks


class StepAgent(BaseAgent):
    """Base for deterministic agents: wraps work in running/done events for the UI."""

    label: str = ""

    async def work(self, app_id: str, ctx: InvocationContext) -> tuple[str, list[dict]]:
        raise NotImplementedError

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        app_id = ctx.session.state["app_id"]
        await _start(app_id, self.name, self.label)
        yield sse(self.name, ctx, {"type": "agent", "agent": self.name, "status": "running", "summary": self.label})
        try:
            summary, payloads = await self.work(app_id, ctx)
            status = "done"
        except Exception as exc:  # noqa: BLE001 - every agent fails soft so the officer still gets a case
            log.exception("agent failed", extra={"agent": self.name, "app_id": app_id})
            summary, payloads, status = f"Could not complete: {str(exc)[:160]}", [], "error"
        for p in payloads:
            yield sse(self.name, ctx, p)
        await _finish(app_id, self.name, summary, status)
        yield sse(self.name, ctx, {"type": "agent", "agent": self.name, "status": status, "summary": summary})


class BenchmarkAgent(StepAgent):
    label: str = "Comparing with similar shops"

    async def work(self, app_id, ctx):
        app = await store.get(app_id)
        m = analysis.MARKET[app.market]
        band, median, source = m["default_share_band"], m["peer_median_daily_sales"], "built-in defaults"
        if app.market in _BENCH_CACHE:
            band, median, source = _BENCH_CACHE[app.market]
        elif settings.use_bigquery:
            try:
                from google.cloud import bigquery

                bq = bigquery.Client(project=settings.project)
                # Table identifiers come from deployment config, never from requests; validate them anyway.
                if not (_IDENT.match(settings.project) and _IDENT.match(settings.bq_dataset)):
                    raise ValueError("invalid BigQuery identifiers in configuration")
                table = f"`{settings.project}.{settings.bq_dataset}.peer_benchmarks`"
                sql = ("SELECT share_p25, share_p75, median_daily_sales, n_shops FROM " + table  # noqa: S608  # nosec B608
                       + " WHERE market = @market ORDER BY n_shops DESC LIMIT 1")
                job = bq.query(sql, job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("market", "STRING", app.market)]))
                rows = list(job.result())
                if rows:
                    r = rows[0]
                    band, median = (float(r["share_p25"]), float(r["share_p75"])), int(r["median_daily_sales"])
                    source = f"BigQuery peer_benchmarks ({r['n_shops']} shops)"
                    _BENCH_CACHE[app.market] = (band, median, source)
            except Exception:  # noqa: BLE001
                log.exception("bigquery benchmark failed; using defaults")
        ctx.session.state["share_band"] = list(band)
        ctx.session.state["peer_median"] = median
        check = analysis.peer_check(app.market, app.entries, median, None)
        check.detail = f"{check.detail} Source: {source}."
        async with mutate(app_id) as app:
            _upsert_checks(app, [check])
        return f"Peer band {band[0]:.0%}–{band[1]:.0%} digital share from {source}", [
            {"type": "check", "check": check.model_dump()}]


class ReconcilerAgent(StepAgent):
    label: str = "Matching the notebook with payment records"

    async def work(self, app_id, ctx):
        app = await store.get(app_id)
        band = tuple(ctx.session.state.get("share_band") or analysis.MARKET[app.market]["default_share_band"])
        checks, stats = analysis.reconcile(app.market, app.entries, app.statement, band)
        ctx.session.state["recon"] = {k: v for k, v in stats.items() if k != "points"}
        async with mutate(app_id) as app:
            _upsert_checks(app, checks)
        fails = sum(c.result == "fail" for c in checks)
        return (f"Digital share {stats['share']:.0%}, rhythm r={stats['corr']:.2f}"
                + (f", {fails} issue{'s' if fails > 1 else ''}" if fails else ", consistent"),
                [{"type": "check", "check": c.model_dump()} for c in checks])


class IntegrityAgent(StepAgent):
    label: str = "Looking for signs of a written-up notebook"

    async def work(self, app_id, ctx):
        app = await store.get(app_id)
        checks = analysis.integrity(app.market, app.entries, app.evidence)
        borrower_text = "\n".join([n.text for n in app.page_notes] + [e.description for e in app.entries]
                                  + [f.quote for f in app.facts])
        result, detail = await shield.screen(borrower_text)
        flagged = [n.evidence_id for n in app.page_notes] if result == "fail" else []
        checks.append(Check(
            id="chk_shield", agent="integrity", name="Hidden instructions (Model Armor)", result=result,
            summary=("Someone wrote instructions aimed at the AI on the evidence. They were blocked and kept out "
                     "of the memo." if result == "fail" else
                     "No hidden instructions to the AI in the notebook or the interview." if result == "pass"
                     else "Text screen unavailable; borrower text kept out of the memo."),
            detail=detail + (" Notes on the page: " + " | ".join(n.text for n in app.page_notes) if app.page_notes else ""),
            evidence_refs=flagged))
        async with mutate(app_id) as app:
            _upsert_checks(app, checks)
        fails = sum(c.result == "fail" for c in checks)
        return (f"{fails} integrity flag{'s' if fails != 1 else ''}" if fails else "No signs of fabrication",
                [{"type": "check", "check": c.model_dump()} for c in checks])


class InterviewVerifierAgent(StepAgent):
    label: str = "Checking the interview against the evidence"

    async def work(self, app_id, ctx):
        app = await store.get(app_id)
        checks = await verifier.verify(app)
        async with mutate(app_id) as app:
            _upsert_checks(app, checks)
        worst = "fail" if any(c.result == "fail" for c in checks) else "warn" if any(
            c.result == "warn" for c in checks) else "pass"
        summary = {"pass": "Answers match the evidence", "warn": "Some answers unclear",
                   "fail": "Answers conflict with evidence or policy"}[worst] if app.facts else "No interview to verify"
        return summary, [{"type": "check", "check": c.model_dump()} for c in checks]


class PolicyAgent(StepAgent):
    label: str = "Applying lending policy"

    async def work(self, app_id, ctx):
        app = await store.get(app_id)
        band = tuple(ctx.session.state.get("share_band") or analysis.MARKET[app.market]["default_share_band"])
        peer_median = ctx.session.state.get("peer_median") or analysis.MARKET[app.market]["peer_median_daily_sales"]
        checks, stats = analysis.reconcile(app.market, app.entries, app.statement, band)
        purchases = sum(e.amount_out for e in app.entries)
        start = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)
        sizing = analysis.size_loan(app.market, stats, app.checks, purchases, band, start)
        metrics = analysis.build_metrics(stats, purchases, sizing, band, peer_median)
        ctx.session.state["sizing"] = {k: v for k, v in sizing.items() if k not in ("schedule", "citations")}
        ctx.session.state["sizing"]["schedule"] = [s.model_dump() for s in sizing["schedule"]]
        ctx.session.state["sizing"]["citations"] = [c.model_dump() for c in sizing["citations"]]
        cur = app.currency
        results = {c.id: c.result for c in app.checks}
        purpose_fail, interview_fail = results.get("chk_purpose") == "fail", results.get("chk_interview") == "fail"
        if sizing["schedule"]:
            afford_result, afford_summary = "pass", (
                f"Largest weekly installment {cur} {max(s.amount for s in sizing['schedule']):,} stays within 30% "
                f"of that week's verified net cash.")
        elif sizing["decision"] == "decline" and purpose_fail:
            afford_result, afford_summary = "warn", "Not assessed: the stated loan purpose is outside policy (§1.3)."
        elif sizing["decision"] == "decline":
            afford_result, afford_summary = "fail", "Verified cash flow supports less than the minimum first loan."
        else:
            afford_result, afford_summary = "warn", "No offer is made until a loan officer reviews the flags."
        afford = Check(
            id="chk_afford", agent="policy", name="Affordability", result=afford_result, summary=afford_summary,
            detail=(f"Verified monthly sales {cur} {sizing['verified_monthly_sales']:,}; estimated margin "
                    f"{sizing['margin']:.0%}; net monthly cash {cur} {sizing['net_monthly_cashflow']:,}."),
            evidence_refs=["chk_share"])
        async with mutate(app_id) as app:
            app.metrics = metrics
            _upsert_checks(app, [afford])
        verdict = {"approve": "within policy", "approve_reduced": "reduced to verified sales",
                   "refer": "refer to a loan officer" + (": interview contradicts the evidence" if interview_fail else ""),
                   "decline": "decline: not a business use (§1.3)" if purpose_fail else "below minimum loan",
                   }[sizing["decision"]]
        return (f"{cur} {sizing['amount']:,} over {sizing['tenor_weeks']} weeks, {verdict}" if sizing["amount"]
                else verdict.capitalize(),
                [{"type": "metrics", "metrics": metrics.model_dump()}, {"type": "check", "check": afford.model_dump()}])


class MemoDraft(BaseModel):
    headline: str = Field(description="One officer-facing sentence in English summarising the recommendation")
    reasons: list[Ref] = Field(description="Exactly 3 reasons in English, each citing ids from the evidence given")
    risks: list[Ref] = Field(description="0-3 risks in English, each citing ids")
    coaching: list[str] = Field(description="3 short, warm, practical tips in the BORROWER's language to qualify for more next time")
    borrower_reasons: list[str] = Field(description="Exactly 3 short reasons in the BORROWER's language, specific to THIS case "
                                                    "(their numbers, their own answers), explaining the outcome simply")
    borrower_message: str = Field(description="2-3 warm, simple sentences in the BORROWER's language explaining the outcome with dignity")


LANG_NAMES = {"id": "Bahasa Indonesia", "ta": "Tamil (Tamil script)", "en": "English"}


async def memo_instruction(rctx: ReadonlyContext) -> str:
    app = await store.get(rctx.state["app_id"])
    sizing = rctx.state.get("sizing", {})
    shield_ok = any(c.id == "chk_shield" and c.result == "pass" for c in app.checks)
    # Borrower-written text only reaches the model after Model Armor has cleared it.
    facts = [{"id": f.id, "label": f.label, "value": f.value, **({"quote": f.quote} if shield_ok else {})}
             for f in app.facts]
    checks = [{"id": c.id, "name": c.name, "result": c.result, "summary": c.summary} for c in app.checks]
    sales = [e for e in app.entries if e.amount_in]
    sample = [{"id": e.id, "date": e.date, "amount_in": e.amount_in} for e in sales[:3] + sales[-2:]]
    return f"""You are the credit memo writer for Bukti, a lender that underwrites informal micro-businesses
from the evidence they actually keep. The decision and every number below were already set by the
lender's policy engine. You explain them; you never change them or invent new numbers.

Applicant: {app.persona.name}, {app.persona.business}, {app.persona.city}. Market {app.market}, currency {app.currency}.
Borrower language: {LANG_NAMES[app.language]}.

Policy decision: {sizing.get('decision')} — amount {sizing.get('amount')}, tenor {sizing.get('tenor_weeks')} weeks,
verified monthly sales {sizing.get('verified_monthly_sales')}, net monthly cash {sizing.get('net_monthly_cashflow')},
weekly cash pattern by week of month {sizing.get('weekly_pattern')} (repayments are shaped to it).

Checks (cite these ids; chk_interview compares the interview with the evidence, chk_purpose is the loan purpose):
{json.dumps(checks, ensure_ascii=False)}
Interview facts (cite these ids): {json.dumps(facts, ensure_ascii=False)}
Sample notebook lines (cite these ids): {json.dumps(sample, ensure_ascii=False)}
Metrics: {app.metrics.model_dump_json() if app.metrics else '{}'}

Write:
- headline: one sentence for the loan officer. For refer or decline, do not mention an amount or tenor; say why.
- reasons: exactly 3, concrete, each with refs to the ids above that support it.
- risks: what the officer should watch; cite ids. If integrity checks failed, say plainly what looks wrong.
- coaching: 3 tips in {LANG_NAMES[app.language]}, practical for a small shop (e.g. take more payments by QRIS/UPI,
  keep writing the notebook daily, keep supplier receipts).
- borrower_message: in {LANG_NAMES[app.language]}, address them by name, warm and respectful. If the case is referred
  or declined, never accuse; explain plainly what could not be confirmed or what the policy does not fund, and what
  would help.
- borrower_reasons: exactly 3 short sentences in {LANG_NAMES[app.language]} that explain THIS outcome using THIS case's
  facts — their real numbers and what they said in the interview (e.g. if the loan purpose was declined, say the loan
  can fund stock, equipment or expansion; if answers conflicted with the notebook, say which). No generic phrases.
Never mention gender, religion, ethnicity, age or marital status."""


def build_memo_writer(model: str, name: str, call_timeout_ms: int) -> LlmAgent:
    # A per-request timeout: a hung connection fails and is retried instead of stalling the whole budget.
    return LlmAgent(
        name=name,
        model=Gemini(model=model, client_kwargs={
            **adk_client_kwargs(),
            "http_options": types.HttpOptions(timeout=call_timeout_ms,
                                              retry_options=types.HttpRetryOptions(attempts=2)),
        }),
        instruction=memo_instruction,
        include_contents="none",
        output_schema=MemoDraft,
        output_key="memo_draft",
    )


def fallback_draft(app: Application, sizing: dict) -> MemoDraft:
    fails = [c for c in app.checks if c.result == "fail"]
    return MemoDraft(
        headline=f"{sizing.get('decision', 'refer').replace('_', ' ').title()} — see checks.",
        reasons=[Ref(text=c.summary, refs=[c.id]) for c in app.checks if c.result == "pass"][:3],
        risks=[Ref(text=c.summary, refs=[c.id]) for c in fails][:3],
        coaching=[], borrower_message="", borrower_reasons=[])


class MemoAgent(BaseAgent):
    """Runs the Gemini memo writer, then assembles the final memo with the policy engine's numbers."""

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        app_id = ctx.session.state["app_id"]
        await _start(app_id, "memo", "Writing the credit memo")
        yield sse(self.name, ctx, {"type": "agent", "agent": "memo", "status": "running",
                                   "summary": "Writing the credit memo"})
        status = "done"
        draft, model = None, "rules-only"
        # Gemini 4 Argon first; if it fails or runs out of time, Gemini 3.8 Flash; then a rules-only memo.
        for writer, budget in zip(self.sub_agents, MEMO_BUDGETS_S, strict=True):
            try:
                async with asyncio.timeout(budget):
                    async for ev in writer.run_async(ctx):
                        yield ev
                draft = MemoDraft.model_validate(ctx.session.state.get("memo_draft") or {})
                model = writer.model.model
                break
            except (Exception, TimeoutError):  # noqa: BLE001 - fall through to the next writer
                log.warning("memo writer failed", extra={"app_id": app_id, "writer": writer.name}, exc_info=True)
                telemetry.emit("guardrail.fallback", agent="memo", status="fallback",
                               detail=f"{writer.name} failed or exceeded {budget}s")
        if draft is None:
            app = await store.get(app_id)
            draft = fallback_draft(app, ctx.session.state.get("sizing", {}))
        sizing = ctx.session.state.get("sizing", {})
        memo = Memo(
            decision=sizing.get("decision", "refer"), amount=sizing.get("amount", 0),
            tenor_weeks=sizing.get("tenor_weeks", 0), schedule=sizing.get("schedule", []),
            headline=draft.headline, reasons=draft.reasons, risks=draft.risks, coaching=draft.coaching,
            borrower_message=draft.borrower_message, borrower_reasons=draft.borrower_reasons[:3],
            citations=sizing.get("citations", []), model=model)
        async with mutate(app_id) as app:
            app.memo = memo
            app.status = "ready"
        summary = f"Memo ready ({model})"
        await _finish(app_id, "memo", summary, status)
        yield sse(self.name, ctx, {"type": "memo", "memo": memo.model_dump()})
        yield sse(self.name, ctx, {"type": "agent", "agent": "memo", "status": status, "summary": summary})
