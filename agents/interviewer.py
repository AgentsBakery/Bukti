"""Interviewer: a Gemini Live voice agent that interviews the borrower in their own language.

It has already seen what the notebook says, so it asks about the evidence ("your sales dip
mid-month, why?") and records each answer as a structured fact with the borrower's own words.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections import defaultdict

from fastapi import WebSocket, WebSocketDisconnect
from google.adk.agents import LiveRequestQueue, LlmAgent, RunConfig
from google.adk.models import Gemini
from google.adk.runners import Runner
from google.adk.tools import ToolContext
from google.genai import types

from agents import analysis
from agents.observability import ObservabilityPlugin
from agents.pipeline import APP_NAME, sessions
from app.config import settings
from app.genai import adk_client_kwargs
from app.schemas import Application, Fact, now_iso
from app.store import new_id, store

log = logging.getLogger("bukti.interviewer")
MAX_SECONDS = 300
FIRST_EVENT_TIMEOUT_S = 15
LANG_NAMES = {"id": "Bahasa Indonesia", "ta": "Tamil", "en": "English"}
LANG_CODES = {"id": "id-ID", "ta": "ta-IN", "en": "en-US"}

_fact_queues: dict[str, asyncio.Queue] = defaultdict(asyncio.Queue)
_ended: dict[str, bool] = {}


_PLACEHOLDER_WORDS = ("waiting for", "no response yet", "not yet answered", "to be confirmed")


def is_placeholder(value: str, quote: str) -> bool:
    """True for a fact recorded before the borrower answered, e.g. value "[Waiting for user response]"."""
    for text in (value.strip(), quote.strip()):
        if not text or (text[0] in "[(<{" and text[-1] in "])>}"):
            return True
        if any(w in text.lower() for w in _PLACEHOLDER_WORDS):
            return True
    return False


async def record_fact(field: str, label: str, value: str, quote: str, tool_context: ToolContext) -> dict:
    """Save one answer from the borrower as a structured fact.

    Args:
        field: snake_case key, one of years_in_business, daily_sales, slow_period_reason, busy_period_reason,
            loan_purpose, other_income, household_expenses, digital_payments, other.
        label: short English label for the loan officer, e.g. "Daily sales".
        value: the answer normalised in English with currency, e.g. "Rp 450.000 on a normal day".
        quote: the borrower's own words in their language, as close to verbatim as possible.

    Returns:
        {"status": "saved", "fact_id": ...} or {"status": "error", "message": ...}.
    """
    app_id = tool_context.state.get("app_id")
    if is_placeholder(value, quote):
        return {"status": "error", "message": "The borrower has not answered yet. Wait for their answer, then record "
                                              "what they actually said."}
    try:
        fact = Fact(id=new_id("fact"), field=field[:40], label=label[:60], value=value[:160], quote=quote[:300],
                    ts=now_iso())
        async with store.lock(app_id):
            app = await store.get(app_id)
            app.facts = [f for f in app.facts if f.field != fact.field or fact.field == "other"] + [fact]
            await store.save(app)
        await _fact_queues[app_id].put(fact)
        return {"status": "saved", "fact_id": fact.id}
    except Exception as exc:  # noqa: BLE001 - a failed save must not end the conversation
        log.exception("record_fact failed", extra={"app_id": app_id})
        return {"status": "error", "message": str(exc)[:120]}


async def end_interview(tool_context: ToolContext) -> dict:
    """Call once, after thanking the borrower, when all questions are answered or they want to stop.

    Returns:
        {"status": "ending"}
    """
    _ended[tool_context.state.get("app_id")] = True
    return {"status": "ending"}


def _evidence_brief(app: Application) -> str:
    sales = [e for e in app.entries if e.amount_in]
    if not sales:
        return "The notebook has not been read yet. Ask general questions about the business."
    points = analysis.daily_series(app.entries, app.statement)
    pattern = analysis.weekly_pattern(points, use="ledger")
    total = sum(e.amount_in for e in sales)
    days = len({e.date for e in sales})
    avg = total // max(1, days)
    spends = sorted(((e.amount_out, e.description) for e in app.entries if e.amount_out), reverse=True)[:3]
    weakest = min(range(4), key=lambda i: pattern[i])
    weeks = ["days 1-7", "days 8-14", "days 15-21", "days 22-31"]
    lines = [
        f"- Notebook covers {days} trading days; average sales {app.currency} {avg:,} per day.",
        f"- Sales by week of month relative to average: {pattern}. Weakest: {weeks[weakest]} ({pattern[weakest]:.2f}).",
        f"- Largest spending lines: {', '.join(f'{d} ({app.currency} {a:,})' for a, d in spends)}.",
    ]
    if app.statement:
        share = sum(s.total for s in app.statement) / max(1, total)
        lines.append(f"- Digital payments ({'QRIS' if app.market == 'ID' else 'UPI'}) equal {share:.0%} of notebook sales.")
    return "\n".join(lines)


def build_interviewer(app: Application, lang: str) -> LlmAgent:
    language = LANG_NAMES[lang]
    instruction = f"""You are Bukti's field officer, interviewing {app.persona.name}, who runs {app.persona.business}
in {app.persona.city}, for a small business loan. Speak ONLY {language}. Use short, simple, warm sentences,
one question at a time, slowly, like a respectful neighbour. Many borrowers have little formal schooling.

What their notebook already shows (do not read numbers out like a report; use them to ask good questions):
{_evidence_brief(app)}

Interview plan, one question per turn, about 2 minutes in total:
1. Greet them by name, say in one sentence that you'll ask a few questions about their shop, and ask if that's OK.
   (Do not record their consent as a fact.)
2. How long they have run the shop. → record_fact field "years_in_business".
3. How much money they take in on a normal day — ask for an AMOUNT in {app.currency} (for example: "About how many
   {('rupiah' if app.market == 'ID' else 'rupees')} do you take in on a normal day?"). → field "daily_sales".
4. Ask about the weakest week from the notebook in plain words (for example: "Your notebook shows sales are lower in
   the second week of the month. Why is that?"). → field "slow_period_reason".
5. What exactly they would use the loan for — what they would buy. → field "loan_purpose".
6. Whether the household has any other income. → field "other_income".
7. Thank them warmly, say their result will be ready in a moment, then call end_interview.

Rules for answers:
- If an answer does not answer the question (for example they name products when you asked for an amount, joke, or
  change the subject), politely re-ask ONCE in simpler words. If the second answer still does not answer it, call
  record_fact with value "unanswered" and their words as the quote, then move on.
- Call record_fact only AFTER the borrower has answered, never before, and never with a placeholder.
- Record what they actually said, never what you hoped to hear. Keep their exact words in the quote.
- Do not argue, judge or warn them about their answers; the loan officer reviews everything.
Never promise approval, never mention a loan amount, and never ask about religion, ethnicity, marital status or age.
If they ask something you cannot answer, say the loan officer will help them."""
    return LlmAgent(
        name="interviewer",
        model=Gemini(model=settings.model_live, client_kwargs=adk_client_kwargs(settings.live_location)),
        instruction=instruction,
        tools=[record_fact, end_interview],
    )


async def run_interview(ws: WebSocket, app: Application, lang: str) -> None:
    app_id = app.id
    _ended[app_id] = False
    queue = _fact_queues[app_id]
    while not queue.empty():
        queue.get_nowait()

    async with store.lock(app_id):
        a = await store.get(app_id)
        a.language = lang  # the borrower's chosen language drives the memo and result screen too
        s = a.step("interviewer")
        s.status, s.started_at, s.summary = "running", now_iso(), f"Interview in {LANG_NAMES[lang]}"
        await store.save(a)

    runner = Runner(app_name=APP_NAME, agent=build_interviewer(app, lang), session_service=sessions,
                    plugins=[ObservabilityPlugin()])
    session = await sessions.create_session(app_name=APP_NAME, user_id=app_id, state={"app_id": app_id})
    holder = {"q": LiveRequestQueue()}
    run_config = RunConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(language_code=LANG_CODES[lang]),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )
    kickoff = types.Content(role="user", parts=[types.Part(
        text="[The borrower has opened the interview screen and is listening. Greet them and begin.]")])
    holder["q"].send_content(kickoff)

    async def send_json(payload: dict) -> None:
        with contextlib.suppress(Exception):
            await ws.send_text(json.dumps(payload, ensure_ascii=False))

    async def upstream() -> None:
        try:
            while True:
                msg = await ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                if msg.get("bytes"):
                    holder["q"].send_realtime(types.Blob(data=msg["bytes"], mime_type="audio/pcm;rate=16000"))
                elif msg.get("text"):
                    data = json.loads(msg["text"])
                    if data.get("type") == "end":
                        break
        except (WebSocketDisconnect, RuntimeError):
            pass

    async def facts_forwarder() -> None:
        while True:
            fact = await queue.get()
            await send_json({"type": "fact", "fact": fact.model_dump()})

    async def events():
        """Live events, reconnecting once if the model hasn't spoken within FIRST_EVENT_TIMEOUT_S."""
        for attempt in range(2):
            gen = runner.run_live(user_id=app_id, session_id=session.id, live_request_queue=holder["q"],
                                  run_config=run_config)
            try:
                first = await asyncio.wait_for(anext(gen), timeout=FIRST_EVENT_TIMEOUT_S)
            except (TimeoutError, StopAsyncIteration):
                log.warning("live session silent; reconnecting", extra={"app_id": app_id, "attempt": attempt + 1})
                with contextlib.suppress(Exception):
                    await gen.aclose()
                holder["q"].close()
                holder["q"] = LiveRequestQueue()
                holder["q"].send_content(kickoff)
                continue
            yield first
            async for ev in gen:
                yield ev
            return
        raise RuntimeError("live model did not respond")

    async def downstream() -> None:
        async for event in events():
            if event.interrupted:
                await send_json({"type": "interrupted"})
            if event.input_transcription and event.input_transcription.text:
                await send_json({"type": "transcript", "role": "user", "text": event.input_transcription.text,
                                 "final": bool(event.input_transcription.finished)})
            if event.output_transcription and event.output_transcription.text:
                await send_json({"type": "transcript", "role": "agent", "text": event.output_transcription.text,
                                 "final": bool(event.output_transcription.finished)})
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.inline_data and part.inline_data.data and (part.inline_data.mime_type or "").startswith("audio/"):
                        with contextlib.suppress(Exception):
                            await ws.send_bytes(part.inline_data.data)
            if _ended.get(app_id) and event.turn_complete:
                break

    tasks = [asyncio.create_task(upstream()), asyncio.create_task(downstream()), asyncio.create_task(facts_forwarder())]
    error = None
    try:
        done, _ = await asyncio.wait(tasks[:2], timeout=MAX_SECONDS, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            if t.exception():
                error = t.exception()
    finally:
        holder["q"].close()
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async with store.lock(app_id):
        a = await store.get(app_id)
        s = a.step("interviewer")
        s.ended_at = now_iso()
        if error and not a.facts:
            log.error("interview failed", extra={"app_id": app_id, "error": str(error)[:300]})
            s.status, s.summary = "error", "Interview could not run"
            await send_json({"type": "error", "message": "The voice interview is unavailable right now."})
        else:
            s.status, s.summary = "done", f"{len(a.facts)} answers recorded in {LANG_NAMES[lang]}"
            a.status = "interviewed"
        await store.save(a)
        facts = [f.model_dump() for f in a.facts]
    await send_json({"type": "done", "facts": facts})
    with contextlib.suppress(Exception):
        await ws.close()
