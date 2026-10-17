"""Structured events: every sign-in, upload, agent step, model call, tool call and decision.

Each event is (1) kept in a per-application timeline for the officer console's run log, (2) written as a
JSON log line (Cloud Logging → BigQuery `bukti_logs` via a log sink), and (3) batched into the BigQuery
`bukti.events` table with the Storage-free streaming insert API. Borrower names, quotes and amounts are never
logged; events carry ids, model names, latency, token counts and estimated cost.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import os
import secrets
from collections import defaultdict, deque

from pydantic import BaseModel, Field

from app.config import settings
from app.schemas import now_iso

log = logging.getLogger("bukti.events")

# Context for the current request / pipeline run, so deep code can emit events without plumbing.
current_app_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("app_id", default=None)
current_user_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("user_id", default=None)

# USD per 1M tokens (input, output). Override with BUKTI_PRICES='{"model": [in, out]}'. See docs/COSTS.md.
PRICES: dict[str, tuple[float, float]] = {
    "gemini-3.8-flash": (0.50, 3.00),
    "gemini-4-argon": (2.00, 10.00),
    "gemini-3.8-live": (3.00, 12.00),
    "gemini-3.8-flash-tts": (0.50, 10.00),
}
PRICES.update({k: tuple(v) for k, v in json.loads(os.getenv("BUKTI_PRICES", "{}")).items()})


def estimate_cost(model: str | None, input_tokens: int | None, output_tokens: int | None) -> float | None:
    if not model or (input_tokens is None and output_tokens is None):
        return None
    p_in, p_out = PRICES.get(model, (0.0, 0.0))
    return round(((input_tokens or 0) * p_in + (output_tokens or 0) * p_out) / 1_000_000, 6)


class Event(BaseModel):
    event_id: str = Field(default_factory=lambda: f"evt_{secrets.token_hex(6)}")
    ts: str = Field(default_factory=now_iso)
    type: str
    app_id: str | None = None
    user_id: str | None = None
    agent: str | None = None
    model: str | None = None
    tool: str | None = None
    latency_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    status: str = "ok"
    detail: str = ""


_timelines: dict[str, deque] = defaultdict(lambda: deque(maxlen=400))
_queue: asyncio.Queue | None = None


def emit(type: str, **fields) -> Event:  # noqa: A002 - matches the event schema field name
    fields.setdefault("app_id", current_app_id.get())
    fields.setdefault("user_id", current_user_id.get())
    if fields.get("cost_usd") is None:
        fields["cost_usd"] = estimate_cost(fields.get("model"), fields.get("input_tokens"), fields.get("output_tokens"))
    fields["detail"] = str(fields.get("detail") or "")[:500]
    ev = Event(type=type, **fields)
    if ev.app_id:
        _timelines[ev.app_id].append(ev)
    log.info(type, extra={"event": ev.model_dump(exclude_none=True)})
    if _queue is not None:
        try:
            _queue.put_nowait(ev)
        except asyncio.QueueFull:
            log.warning("event queue full; dropping BigQuery write for one event")
    return ev


def timeline(app_id: str) -> list[Event]:
    return list(_timelines.get(app_id, []))


async def flusher() -> None:
    """Batch events into BigQuery every two seconds. Never blocks a request."""
    global _queue
    _queue = asyncio.Queue(maxsize=10_000)
    if not settings.use_bigquery:
        return
    from google.cloud import bigquery

    client = bigquery.Client(project=settings.project)
    table = f"{settings.project}.{settings.bq_dataset}.events"
    while True:
        await asyncio.sleep(2)
        batch: list[dict] = []
        while not _queue.empty() and len(batch) < 500:
            batch.append(_queue.get_nowait().model_dump())
        if not batch:
            continue
        try:
            errors = await asyncio.to_thread(client.insert_rows_json, table, batch)
            if errors:
                log.warning("bigquery event insert errors", extra={"error": str(errors)[:300]})
        except Exception as exc:  # noqa: BLE001 - telemetry must never take the app down
            log.warning("bigquery event insert failed", extra={"error": str(exc)[:300]})
