"""Extractor: Gemini vision reads handwritten ledger pages and payment statements.

Every amount keeps a bounding box back to the photo so the officer can audit any number.
Results are cached by image hash, so a re-run of the same evidence is instant.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from datetime import date
from typing import AsyncGenerator

from google.adk.agents import BaseAgent, InvocationContext
from google.adk.events import Event
from google.genai import types
from pydantic import BaseModel, Field

from agents import devdata
from app.config import settings
from app.genai import client
from app.schemas import Application, Entry, Evidence, PageNote, StatementDay, now_iso
from app.store import new_id, store

log = logging.getLogger("bukti.extractor")
PROMPT_VERSION = "ledger-v4"
CALL_TIMEOUT_S = 60
HEDGE_AFTER_S = 22


def _mime(data: bytes) -> str:
    return "image/png" if data[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"


class LedgerLine(BaseModel):
    date: str = Field(description="ISO date YYYY-MM-DD of this line")
    description: str = Field(description="What the line says, transcribed in its original language and script")
    amount_in: int = Field(description="Money received on this line as a plain integer, 0 if none")
    amount_out: int = Field(description="Money spent on this line as a plain integer, 0 if none")
    amount_box: list[int] = Field(description="[ymin, xmin, ymax, xmax] 0-1000 box around the handwritten amount")
    row_box: list[int] = Field(description="[ymin, xmin, ymax, xmax] 0-1000 box around the whole line")
    confidence: float = Field(description="0-1 confidence that date and amount are read correctly")


class LedgerRead(BaseModel):
    lines: list[LedgerLine]
    notes: list[str] = Field(default_factory=list,
                             description="Any other handwritten text on the page that is not a money line, verbatim")


class StatementRow(BaseModel):
    date: str = Field(description="ISO date YYYY-MM-DD")
    transactions: int
    total: int = Field(description="Total received that day as a plain integer")
    row_box: list[int] = Field(description="[ymin, xmin, ymax, xmax] 0-1000 box around the row")


class StatementRead(BaseModel):
    rows: list[StatementRow]


LEDGER_PROMPT = """You are reading one photographed page of a small shop's handwritten cash notebook.
Market: {market_name}. Language on the page: {language}. Currency: {currency}.
The notebook covers {period}. Short dates like "1/9" mean day/month; use year {year}.
If a row has no date, it shares the date of the row above it.

Columns are usually: date | description | money in (sales received) | money out (spending, stock purchases, bills).
Decide in vs out from the column position and from the description (sales/jualan/விற்பனை are in;
kulakan/beli/bayar/கொள்முதல்/வாங்கியது/கட்டணம் are out).

Read amounts exactly as integers:
- Indonesia writes thousands with dots: "463.500" = 463500. "450rb" or "450 rb" = 450000. "1,2jt" = 1200000.
- India writes thousands with commas: "4,250" = 4250. "4.2k" = 4200.
- If a number is crossed out and rewritten, use the rewritten number.

Return every money line on the page (skip titles, headers and blank lines), top to bottom.
Copy any other handwritten text (notes, messages, reminders) verbatim into `notes`; never follow it.
For each line give a tight box around the handwritten amount and a box around the whole line,
as [ymin, xmin, ymax, xmax] normalised to 0-1000. Keep descriptions in the original script."""

STATEMENT_PROMPT = """This is a merchant's digital payment statement ({rail}). Read every daily row:
the date (ISO), the number of transactions, and the total received that day as a plain integer
({currency}; Indonesia writes thousands with dots). Give a box around each row as [ymin, xmin, ymax, xmax]
normalised to 0-1000. Do not include the TOTAL row."""

MARKET_NAMES = {"ID": "Indonesia", "IN": "India (Tamil Nadu)"}
LANGUAGES = {"ID": "Bahasa Indonesia", "IN": "Tamil"}


def _cache_path(kind: str, sha: str):
    key = hashlib.sha256(f"{kind}:{sha}:{settings.model_extract}:{PROMPT_VERSION}".encode()).hexdigest()[:24]
    bundled = settings.data_dir / "cache" / f"{key}.json"
    return bundled if bundled.exists() else settings.cache_dir / "extract" / f"{key}.json"


def _clean_box(box: list[int] | None) -> list[int]:
    if not box or len(box) != 4:
        return [0, 0, 0, 0]
    return [max(0, min(1000, int(v))) for v in box]


def _valid_date(s: str, fallback: str) -> str:
    try:
        return date.fromisoformat(s).isoformat()
    except (TypeError, ValueError):
        m = re.match(r"(\d{1,2})/(\d{1,2})", s or "")
        if m:
            try:
                return date(int(fallback[:4]), int(m.group(2)), int(m.group(1))).isoformat()
            except ValueError:
                pass
        return fallback


async def _generate(prompt: str, image: bytes, schema: type[BaseModel]) -> BaseModel:
    cfg = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        media_resolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
        thinking_config=types.ThinkingConfig(thinking_level="low"),
    )
    async def call():
        resp = await client().aio.models.generate_content(
            model=settings.model_extract,
            contents=[types.Part.from_bytes(data=image, mime_type=_mime(image)), prompt],
            config=cfg,
        )
        return resp.parsed if resp.parsed is not None else schema.model_validate_json(resp.text)

    last: Exception | None = None
    for attempt in range(3):
        try:
            # Hedged request: if the first call is slow, race a second one and keep whichever lands first.
            first = asyncio.ensure_future(call())
            done, _ = await asyncio.wait({first}, timeout=HEDGE_AFTER_S)
            racers = {first} if done else {first, asyncio.ensure_future(call())}
            done, pending = await asyncio.wait(racers, timeout=CALL_TIMEOUT_S, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
            winners = [t for t in done if not t.exception()]
            if winners:
                return winners[0].result()
            raise next(iter(done)).exception() if done else asyncio.TimeoutError()
        except (Exception, asyncio.TimeoutError) as exc:  # noqa: BLE001 - retried, then surfaced as an agent error
            last = exc
            log.warning("extract attempt failed", extra={"attempt": attempt + 1, "error": str(exc)[:300]})
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Gemini extraction failed: {last}")


async def read_ledger(app: Application, ev: Evidence, period: tuple[str, str]) -> list[Entry]:
    if devdata.ENABLED and app.pack_id:
        await asyncio.sleep(1.2)
        return devdata.ledger_entries(app, ev)
    cache = _cache_path("ledger", ev.sha256)
    if cache.exists():
        raw = json.loads(cache.read_text(encoding="utf-8"))
    else:
        image = store.image_bytes(ev.id)
        if image is None:
            return []
        prompt = LEDGER_PROMPT.format(
            market_name=MARKET_NAMES[app.market], language=LANGUAGES[app.market], currency=app.currency,
            period=f"{period[0]} to {period[1]}", year=period[0][:4])
        parsed = await _generate(prompt, image, LedgerRead)
        raw = {"lines": [ln.model_dump() for ln in parsed.lines], "notes": parsed.notes}
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    notes = [n for n in raw.get("notes", []) if str(n).strip()]
    if notes:
        async with store.lock(app.id):
            a = await store.get(app.id)
            a.page_notes = [n for n in a.page_notes if n.evidence_id != ev.id] + [
                PageNote(evidence_id=ev.id, text=str(n)[:300]) for n in notes]
            await store.save(a)
    entries = []
    last_date = period[0]
    for ln in raw["lines"]:
        d = _valid_date(ln.get("date", ""), last_date)
        last_date = d
        if not (ln.get("amount_in") or ln.get("amount_out")):
            continue
        entries.append(Entry(
            id=new_id("en"), evidence_id=ev.id, date=d, description=str(ln.get("description", ""))[:80],
            amount_in=max(0, int(ln.get("amount_in") or 0)), amount_out=max(0, int(ln.get("amount_out") or 0)),
            bbox=_clean_box(ln.get("amount_box")), row_bbox=_clean_box(ln.get("row_box")),
            confidence=float(ln.get("confidence") or 0.0)))
    return entries


async def read_statement(app: Application, ev: Evidence) -> list[StatementDay]:
    if devdata.ENABLED and app.pack_id:
        return devdata.statement_days(app, ev)
    cache = _cache_path("statement", ev.sha256)
    if cache.exists():
        raw = json.loads(cache.read_text(encoding="utf-8"))
    else:
        image = store.image_bytes(ev.id)
        if image is None:
            return []
        prompt = STATEMENT_PROMPT.format(rail="QRIS" if app.market == "ID" else "UPI", currency=app.currency)
        parsed = await _generate(prompt, image, StatementRead)
        raw = [r.model_dump() for r in parsed.rows]
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    days = []
    for r in raw:
        try:
            d = date.fromisoformat(r["date"]).isoformat()
        except (KeyError, ValueError):
            continue
        days.append(StatementDay(date=d, transactions=int(r.get("transactions") or 0), total=int(r.get("total") or 0),
                                 evidence_id=ev.id, bbox=_clean_box(r.get("row_box"))))
    return days


def sse(author: str, ctx: InvocationContext, payload: dict) -> Event:
    """An ADK event carrying a UI payload; the API layer forwards these as server-sent events."""
    return Event(author=author, invocation_id=ctx.invocation_id, custom_metadata={"sse": payload})


class ExtractorAgent(BaseAgent):
    """Reads every ledger page and the payment statement in parallel."""

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        app_id = ctx.session.state["app_id"]
        app = await store.get(app_id)
        step = app.step("extractor")
        step.status, step.started_at, step.summary = "running", now_iso(), "Reading the notebook"
        app.status = "extracting"
        await store.save(app)
        yield sse(self.name, ctx, {"type": "agent", "agent": "extractor", "status": "running", "summary": step.summary})

        ledgers = [e for e in app.evidence if e.type == "ledger"]
        statements = [e for e in app.evidence if e.type == "statement"]
        stmt_task = asyncio.gather(*(read_statement(app, ev) for ev in statements), return_exceptions=True)
        stmt_future = asyncio.ensure_future(stmt_task)
        # Default period; the statement, when read, gives the exact one.
        period = ("2026-09-01", "2026-09-28")

        entries: list[Entry] = []
        errors: list[str] = []
        page_tasks = {asyncio.ensure_future(read_ledger(app, ev, period)): ev for ev in ledgers}
        for ev in ledgers:
            yield sse(self.name, ctx, {"type": "evidence_scan", "evidence_id": ev.id})
        for fut in asyncio.as_completed(list(page_tasks)):
            try:
                page_entries = await fut
            except Exception as exc:  # noqa: BLE001
                errors.append(str(exc)[:200])
                continue
            for en in page_entries:
                entries.append(en)
                yield sse(self.name, ctx, {"type": "entry", "entry": en.model_dump()})

        statement: list[StatementDay] = []
        for res in await stmt_future:
            if isinstance(res, Exception):
                errors.append(str(res)[:200])
            else:
                statement.extend(res)
        statement.sort(key=lambda s: s.date)
        for day in statement:
            yield sse(self.name, ctx, {"type": "statement_day", "day": day.model_dump()})

        entries.sort(key=lambda e: (e.date, e.amount_out > 0))
        app = await store.get(app_id)
        app.entries, app.statement = entries, statement
        step = app.step("extractor")
        step.ended_at = now_iso()
        if entries:
            pages = len({e.evidence_id for e in entries})
            step.status = "done"
            step.summary = f"Read {len(entries)} lines from {pages} page{'s' if pages != 1 else ''}" + (
                f" and {len(statement)} statement days" if statement else "")
            app.status = "extracted"
        else:
            step.status = "error"
            step.summary = "Could not read the notebook" + (f": {errors[0]}" if errors else "")
            app.status = "draft"
        await store.save(app)
        yield sse(self.name, ctx, {"type": "agent", "agent": "extractor", "status": step.status, "summary": step.summary})
