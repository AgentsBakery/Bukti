"""Bukti API: FastAPI + ADK, served from one Cloud Run service together with the web app."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import sys
import wave
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from google.genai import types

from agents import classifier, copilot
from agents.pipeline import run_stage
from app import access, guards, packs, telemetry
from app.auth import Caller, auth_enabled, caller_from_token, optional_caller, required_caller, users, FIREBASE_WEB_CONFIG
from app.config import settings
from app.genai import client
from app.schemas import (Application, Consent, CopilotIn, CreateApplication, Decision, DecisionIn, Evidence,
                         EvidenceUpdate, TtsIn, now_iso)
from app.store import image_fingerprint, new_id, normalise_image, pdf_pages, store


class JsonFormatter(logging.Formatter):
    """One JSON object per line so Cloud Logging indexes severity and fields."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {"severity": record.levelname, "logger": record.name, "message": record.getMessage()}
        for key, value in record.__dict__.items():
            if key in {"app_id", "agent", "stage", "error", "attempt", "evidence_id", "pack_id", "event"}:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
log = logging.getLogger("bukti.api")

async def _warm_models() -> None:
    """First calls to a model from a fresh process can take minutes; pay that cost before a judge arrives."""
    async def ping(model: str) -> None:
        try:
            await client().aio.models.generate_content(model=model, contents="ok")
            log.info("model warm", extra={"agent": model})
        except Exception as exc:  # noqa: BLE001
            log.warning("model warm-up failed", extra={"agent": model, "error": str(exc)[:200]})
    await asyncio.gather(ping(settings.model_extract), ping(settings.model_memo))


@asynccontextmanager
async def lifespan(_: FastAPI):
    tasks = [asyncio.create_task(_warm_models() if settings.warm_models else asyncio.sleep(0)),
             asyncio.create_task(telemetry.flusher())]
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(title="Bukti", version="0.1.0", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(guards.SecurityHeaders)


async def _app_or_404(app_id: str) -> Application:
    a = await store.get(app_id)
    if a is None:
        raise HTTPException(404, "application not found")
    return a


async def _visible(app_id: str, caller: Caller | None) -> Application:
    return access.require_view(await store.get(app_id), caller)


@app.get("/api/health")
async def health():
    return {"ok": True, "version": app.version, "project": settings.project,
            "models": {"extract": settings.model_extract, "memo": settings.model_memo,
                       "live": settings.model_live, "tts": settings.model_tts, "copilot": settings.model_extract},
            "auth": auth_enabled()}


@app.get("/api/demo/packs")
async def demo_packs():
    return [p.model_dump() for p in packs.list_packs()]


# ---------- Auth (optional Google sign-in) ----------

@app.get("/api/auth/config")
async def auth_config():
    return {"enabled": auth_enabled(), **({"firebase": FIREBASE_WEB_CONFIG} if auth_enabled() else {})}


def _role(caller: Caller) -> str:
    return "officer" if access.is_officer(caller) else "borrower"


@app.post("/api/auth/session", dependencies=[Depends(guards.rate_limit("load"))])
async def auth_session(caller: Caller = Depends(required_caller)):
    user = await users.upsert_login(caller, _role(caller))
    telemetry.emit("auth.login", user_id=user.uid, detail=f"login #{user.login_count} as {user.role}")
    return user.model_dump()


@app.get("/api/me")
async def me(caller: Caller = Depends(required_caller)):
    user = await users.get(caller.uid)
    out = (user or await users.upsert_login(caller, _role(caller))).model_dump()
    return {**out, "role": _role(caller)}


@app.get("/api/me/applications")
async def my_applications(caller: Caller = Depends(required_caller)):
    return [s.model_dump() for s in await store.list_real(owner_uid=caller.uid)]


@app.post("/api/demo/packs/{pack_id}/load", dependencies=[Depends(guards.rate_limit("load"))])
async def load_pack(pack_id: str, caller: Caller | None = Depends(optional_caller)):
    if pack_id not in {p.id for p in packs.list_packs()}:
        raise HTTPException(404, "unknown pack")
    a = await packs.load_pack(pack_id)
    if caller:
        a.owner_uid = caller.uid
        await store.save(a)
    telemetry.emit("application.created", app_id=a.id, user_id=caller.uid if caller else None,
                   detail=f"demo pack {pack_id}")
    return {"application_id": a.id}


@app.post("/api/applications", dependencies=[Depends(guards.rate_limit("load"))])
async def create_application(body: CreateApplication, caller: Caller = Depends(required_caller)):
    """A real application, owned by the signed-in borrower who starts it."""
    if not body.consent.photos:
        raise HTTPException(400, "Bukti needs your permission to read your photos.")
    a = Application(
        id=new_id("app"), kind="real", market=body.market, language=body.language,
        currency="Rp" if body.market == "ID" else "₹", owner_uid=caller.uid, persona=body.persona,
        consent=Consent(photos=body.consent.photos, voice=body.consent.voice))
    await store.save(a)
    telemetry.emit("application.created", app_id=a.id, user_id=caller.uid, detail="real application")
    return {"application_id": a.id}


@app.get("/api/applications")
async def list_applications(caller: Caller | None = Depends(optional_caller)):
    """Console queue: real cases this caller may see (all, for officers; their own, for borrowers), then demos."""
    real = []
    if caller is not None:
        real = await store.list_real(owner_uid=None if access.is_officer(caller) else caller.uid)
    return [s.model_dump() for s in real + await store.list_demo()]


@app.get("/api/applications/{app_id}")
async def get_application(app_id: str, caller: Caller | None = Depends(optional_caller)):
    return access.app_out(await _visible(app_id, caller), caller)


@app.delete("/api/applications/{app_id}", dependencies=[Depends(guards.rate_limit("edit"))])
async def delete_application(app_id: str, caller: Caller = Depends(required_caller)):
    a = await _visible(app_id, caller)
    if a.kind != "real" or a.owner_uid != caller.uid:
        raise HTTPException(403, "Only the borrower who started this application can delete it.")
    async with store.lock(app_id):
        await store.delete_application(app_id)
    telemetry.emit("application.deleted", app_id=app_id, user_id=caller.uid, detail="deleted by borrower")
    return {"deleted": app_id}


# ---------- Evidence ----------

MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_PDF_BYTES = 20 * 1024 * 1024
LABELS = {"ledger": "Notebook page", "statement": "Payment statement", "receipt": "Receipt", "shop": "Shop photo",
          "other": "Not used"}


def _relabel(a: Application) -> None:
    """Number uploaded evidence by type ("Notebook page 2"); demo-pack labels are left alone."""
    counts: dict[str, int] = {}
    for ev in a.evidence:
        if ev.src.startswith("pack:"):
            continue
        counts[ev.type] = counts.get(ev.type, 0) + 1
        ev.label = LABELS[ev.type] + (f" {counts[ev.type]}" if ev.type in ("ledger", "statement", "receipt") else "")


def _editable(a: Application) -> None:
    if a.kind == "real" and a.status != "draft":
        raise HTTPException(409, "This application has already been read; its documents can no longer change.")


@app.post("/api/applications/{app_id}/evidence", dependencies=[Depends(guards.rate_limit("upload"))])
async def upload_evidence(app_id: str, file: UploadFile = File(...), type: str | None = Form(None),
                          caller: Caller | None = Depends(optional_caller)):
    """One photo or PDF. A PDF becomes one evidence item per page. Without `type`, Gemini labels each page."""
    a = await _visible(app_id, caller)
    access.require_edit(a, caller)
    _editable(a)
    if type is not None and type not in LABELS:
        raise HTTPException(400, "type must be ledger, statement, receipt, shop or other")
    data = await file.read()
    is_pdf = data[:5] == b"%PDF-"
    if len(data) > (MAX_PDF_BYTES if is_pdf else MAX_IMAGE_BYTES):
        raise HTTPException(413, f"File too large; the limit is {(MAX_PDF_BYTES if is_pdf else MAX_IMAGE_BYTES) // 2**20} MB.")
    try:
        pages = await asyncio.to_thread(pdf_pages, data) if is_pdf else [await asyncio.to_thread(normalise_image, data)]
    except Exception as exc:  # noqa: BLE001
        telemetry.emit("guardrail.blocked", app_id=app_id, status="blocked", detail="unreadable upload rejected")
        what = "PDF" if is_pdf else "image"
        raise HTTPException(400, f"This {what} can't be read: {str(exc)[:120]}") from exc
    if len(a.evidence) + len(pages) > guards.MAX_EVIDENCE_PER_APPLICATION:
        raise HTTPException(409, f"An application can hold at most {guards.MAX_EVIDENCE_PER_APPLICATION} photos and pages.")

    name = (file.filename or ("document.pdf" if is_pdf else "photo.jpg"))[-120:]
    ext = "pdf" if is_pdf else (name.rsplit(".", 1)[-1].lower() if "." in name else "jpg")[:5]
    parent = new_id("doc") if is_pdf else None
    labels = await asyncio.gather(*(classifier.classify(p, a.market) for p in pages)) if type is None else [None] * len(pages)
    items: list[Evidence] = []
    for i, (page, label) in enumerate(zip(pages, labels, strict=True)):
        ev_id = new_id("ev")
        folder = f"applications/{app_id}/{ev_id}"
        try:
            gcs_page = await store.put_object(f"{folder}/page.jpg", page, "image/jpeg")
            gcs_original = (await store.put_object(f"{folder}/original.{ext}", data,
                                                   "application/pdf" if is_pdf else (file.content_type or "image/jpeg"))
                            if i == 0 else "")
        except Exception as exc:  # noqa: BLE001
            log.exception("evidence storage failed", extra={"app_id": app_id})
            raise HTTPException(503, "Could not save the file. Please try again.") from exc
        w, h, sha, ahash = image_fingerprint(page)
        if type is not None:
            etype, source, status, note = type, "borrower", ("excluded" if type == "other" else "ready"), ""
        elif label is None:
            etype, source, status, note = "other", "ai", "needs_review", "Please choose what this is."
        else:
            etype, source = label.type, "ai"
            status = ("excluded" if label.type == "other"
                      else "needs_review" if label.confidence < classifier.REVIEW_BELOW else "ready")
            note = label.reason[:120]
        items.append(Evidence(
            id=ev_id, type=etype, label=LABELS[etype], url=f"/api/applications/{app_id}/evidence/{ev_id}/image",
            width=w, height=h, sha256=sha, ahash=ahash, src=f"object:{folder}/page.jpg", mime="image/jpeg",
            original_name=name, gcs_uri=gcs_page, original_uri=gcs_original,
            page=(i + 1) if is_pdf else None, parent_id=parent,
            ai_type=label.type if label else None, ai_confidence=label.confidence if label else None,
            label_source=source, status=status, note=note))
    async with store.lock(app_id):
        fresh = await _app_or_404(app_id)
        if len(fresh.evidence) + len(items) > guards.MAX_EVIDENCE_PER_APPLICATION:
            await store.delete_objects([u for ev in items for u in (ev.gcs_uri, ev.original_uri)])
            raise HTTPException(409, f"An application can hold at most {guards.MAX_EVIDENCE_PER_APPLICATION} photos and pages.")
        fresh.evidence.extend(items)
        _relabel(fresh)
        await store.save(fresh)
    telemetry.emit("evidence.uploaded", app_id=app_id, user_id=caller.uid if caller else None,
                   detail=f"{'PDF, ' + str(len(pages)) + ' pages' if is_pdf else 'image'}, {len(data) // 1024} KB: "
                          + ", ".join(f"{ev.type}{'?' if ev.status == 'needs_review' else ''}" for ev in items))
    by_id = {ev.id: ev for ev in fresh.evidence}
    return [access.evidence_out(fresh, by_id[ev.id]) for ev in items]


@app.patch("/api/applications/{app_id}/evidence/{evidence_id}", dependencies=[Depends(guards.rate_limit("edit"))])
async def update_evidence(app_id: str, evidence_id: str, body: EvidenceUpdate,
                          caller: Caller | None = Depends(optional_caller)):
    async with store.lock(app_id):
        a = await _visible(app_id, caller)
        access.require_edit(a, caller)
        _editable(a)
        ev = next((e for e in a.evidence if e.id == evidence_id), None)
        if ev is None:
            raise HTTPException(404, "evidence not found")
        ev.type, ev.label_source = body.type, "borrower"
        ev.status, ev.note = ("excluded" if body.type == "other" else "ready"), ""
        _relabel(a)
        await store.save(a)
    telemetry.emit("evidence.relabelled", app_id=app_id, detail=f"{ev.ai_type or '?'} -> {body.type}")
    return access.evidence_out(a, ev)


@app.delete("/api/applications/{app_id}/evidence/{evidence_id}", dependencies=[Depends(guards.rate_limit("edit"))])
async def delete_evidence(app_id: str, evidence_id: str, caller: Caller | None = Depends(optional_caller)):
    async with store.lock(app_id):
        a = await _visible(app_id, caller)
        access.require_edit(a, caller)
        _editable(a)
        ev = next((e for e in a.evidence if e.id == evidence_id), None)
        if ev is None:
            raise HTTPException(404, "evidence not found")
        a.evidence = [e for e in a.evidence if e.id != evidence_id]
        uris = [ev.gcs_uri]
        # A PDF's original file is stored beside its first page; keep it while any of its pages remain.
        siblings = [e for e in a.evidence if ev.parent_id and e.parent_id == ev.parent_id]
        if ev.original_uri and siblings:
            siblings[0].original_uri = ev.original_uri
        elif ev.original_uri:
            uris.append(ev.original_uri)
        _relabel(a)
        await store.save(a)
    if ev.src.startswith("object:"):
        await store.delete_objects(uris + ([] if ev.gcs_uri else [ev.src[len("object:"):]]))
    telemetry.emit("evidence.removed", app_id=app_id, detail=ev.type)
    return {"deleted": evidence_id}


@app.get("/api/applications/{app_id}/evidence/{evidence_id}/image")
async def application_image(app_id: str, evidence_id: str, exp: int | None = None, sig: str | None = None):
    a = await store.get(app_id)
    if a is None or not access.link_ok(a, evidence_id, exp, sig):
        raise HTTPException(404, "image not found")
    ev = next((e for e in a.evidence if e.id == evidence_id), None)
    data = await store.evidence_bytes(a, ev) if ev else None
    if data is None:
        raise HTTPException(404, "image not found")
    cache = "public, max-age=86400" if a.kind == "demo" else "private, max-age=3600"
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": cache})


@app.get("/api/evidence/{evidence_id}/image")
async def evidence_image(evidence_id: str):
    """Demo-pack images (and uploads made before per-application storage)."""
    path = store.image_path(evidence_id)
    if path is None:
        raise HTTPException(404, "image not found")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=86400"})


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _replay_extract(a: Application):
    for ev in [e for e in a.evidence if e.type == "ledger"]:
        yield _sse({"type": "evidence_scan", "evidence_id": ev.id})
    yield _sse({"type": "agent", "agent": "extractor", "status": "running", "summary": "Reading the notebook"})
    for en in a.entries:
        await asyncio.sleep(0.05)
        yield _sse({"type": "entry", "entry": en.model_dump()})
    for d in a.statement:
        yield _sse({"type": "statement_day", "day": d.model_dump()})
    step = a.step("extractor")
    yield _sse({"type": "agent", "agent": "extractor", "status": step.status, "summary": step.summary})


async def _replay_assess(a: Application):
    for step in a.agent_trace:
        if step.agent in ("extractor", "interviewer"):
            continue
        yield _sse({"type": "agent", "agent": step.agent, "status": "running", "summary": step.summary})
        await asyncio.sleep(0.25)
        for c in [c for c in a.checks if c.agent == step.agent]:
            yield _sse({"type": "check", "check": c.model_dump()})
        if step.agent == "policy" and a.metrics:
            yield _sse({"type": "metrics", "metrics": a.metrics.model_dump()})
        if step.agent == "memo" and a.memo:
            yield _sse({"type": "memo", "memo": a.memo.model_dump()})
        yield _sse({"type": "agent", "agent": step.agent, "status": step.status, "summary": step.summary})


def _stream(stage: str, app_id: str, force: bool, caller: Caller | None = None):
    user_id = caller.uid if caller else None

    async def gen():
        telemetry.current_app_id.set(app_id)
        telemetry.current_user_id.set(user_id)
        a = await store.get(app_id)
        if a is None:
            yield _sse({"type": "error", "message": "application not found"})
            return
        done = (stage == "extract" and a.entries) or (stage == "assess" and a.memo)
        if done and not force:
            replay = _replay_extract(a) if stage == "extract" else _replay_assess(a)
            async for chunk in replay:
                yield chunk
        elif guards.stage_slots.locked():
            yield _sse({"type": "error", "message": "Bukti is busy with other applications. Please try again in a minute."})
        else:
            if stage == "assess":
                a.status = "assessing"
                if not a.facts:
                    s = a.step("interviewer")
                    if s.status == "pending":
                        s.status, s.summary = "done", "Interview skipped"
                await store.save(a)
            started = asyncio.get_running_loop().time()
            telemetry.emit("stage.started", agent=stage)
            status = "ok"
            try:
                async with guards.stage_slots:
                    async for payload in run_stage(stage, app_id):
                        yield _sse(payload)
            except Exception as exc:  # noqa: BLE001
                status = "error"
                log.exception("stage failed", extra={"stage": stage, "app_id": app_id})
                yield _sse({"type": "error", "message": f"{stage} failed: {str(exc)[:200]}"})
            telemetry.emit("stage.completed", agent=stage, status=status,
                           latency_ms=int((asyncio.get_running_loop().time() - started) * 1000))
        a = await store.get(app_id)
        yield _sse({"type": "done", "application": access.app_out(a, caller)})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/applications/{app_id}/extract/stream", dependencies=[Depends(guards.rate_limit("stage"))])
async def extract_stream(app_id: str, force: bool = False, caller: Caller | None = Depends(optional_caller)):
    a = await _visible(app_id, caller)
    if a.kind == "real":
        access.require_edit(a, caller)
        if not any(e.type == "ledger" and e.status != "excluded" for e in a.evidence):
            raise HTTPException(409, "Add at least one notebook page first.")
        if any(e.status == "needs_review" for e in a.evidence):
            raise HTTPException(409, "Please check the documents marked 'please check' first.")
    return _stream("extract", app_id, force, caller)


@app.get("/api/applications/{app_id}/assess/stream", dependencies=[Depends(guards.rate_limit("stage"))])
async def assess_stream(app_id: str, force: bool = False, caller: Caller | None = Depends(optional_caller)):
    a = await _visible(app_id, caller)
    if not a.entries and not a.memo:
        raise HTTPException(409, "No sales have been read yet. Add notebook pages with daily sales and read them first.")
    return _stream("assess", app_id, force, caller)


@app.get("/api/applications/{app_id}/events")
async def app_events(app_id: str, caller: Caller | None = Depends(optional_caller)):
    await _visible(app_id, caller)
    return [e.model_dump() for e in telemetry.timeline(app_id)]


@app.post("/api/applications/{app_id}/copilot", dependencies=[Depends(guards.rate_limit("copilot"))])
async def ask_copilot(app_id: str, body: CopilotIn, caller: Caller | None = Depends(optional_caller)):
    await _visible(app_id, caller)
    uid = caller.uid if caller else None

    async def gen():
        telemetry.current_app_id.set(app_id)
        telemetry.current_user_id.set(uid)
        async for payload in copilot.ask(app_id, body.question, body.session_id, uid):
            yield _sse(payload)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/applications/{app_id}/decision", dependencies=[Depends(guards.rate_limit("decision"))])
async def decide(app_id: str, body: DecisionIn, caller: Caller | None = Depends(optional_caller)):
    async with store.lock(app_id):
        a = await _visible(app_id, caller)
        access.require_decide(a, caller)
        amount = body.amount if body.amount is not None else (a.memo.amount if a.memo else 0)
        if body.action == "decline":
            amount = 0
        a.decision = Decision(action=body.action, amount=max(0, int(amount)), note=body.note[:500],
                              officer=caller.name if caller else "Loan officer (demo)", ts=now_iso())
        a.status = "decided"
        await store.save(a)
    telemetry.emit("decision.made", app_id=app_id, user_id=caller.uid if caller else None,
                   detail=f"{body.action} (memo said {a.memo.decision if a.memo else 'n/a'})")
    return access.app_out(a, caller)


# ---------- Speech ----------

VOICE = {"id": "Kore", "ta": "Kore", "en": "Kore"}
LANG_CODE = {"id": "id-ID", "ta": "ta-IN", "en": "en-US"}


def _wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


TTS_TIMEOUT_S = 30


async def _tts(text: str, lang: str) -> bytes:
    key = hashlib.sha256(f"v2:{settings.model_tts}:{lang}:{text}".encode()).hexdigest()[:24]
    cache = settings.cache_dir / "tts" / f"{key}.wav"
    if cache.exists():
        return cache.read_bytes()
    started = asyncio.get_running_loop().time()
    # Plain text only: the TTS model reads any style instruction in `contents` aloud.
    resp = await asyncio.wait_for(client().aio.models.generate_content(
        model=settings.model_tts,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                language_code=LANG_CODE[lang],
                voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE[lang]))),
        ),
    ), timeout=TTS_TIMEOUT_S)
    usage = resp.usage_metadata
    telemetry.emit("model.call", agent="tts", model=settings.model_tts,
                   latency_ms=int((asyncio.get_running_loop().time() - started) * 1000),
                   input_tokens=getattr(usage, "prompt_token_count", None),
                   output_tokens=getattr(usage, "candidates_token_count", None), detail=lang)
    blob = resp.candidates[0].content.parts[0].inline_data
    # Newer TTS models return a complete WAV; older ones return raw 24 kHz PCM.
    wav = blob.data if (blob.mime_type or "").startswith("audio/wav") or blob.data[:4] == b"RIFF" else _wav(blob.data)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(wav)
    return wav


@app.post("/api/tts", dependencies=[Depends(guards.rate_limit("tts"))])
async def tts(body: TtsIn):
    try:
        return Response(await _tts(body.text, body.lang), media_type="audio/wav")
    except Exception as exc:  # noqa: BLE001
        log.warning("tts failed", extra={"error": str(exc)[:200]})
        raise HTTPException(503, "tts unavailable") from exc


@app.get("/api/applications/{app_id}/explain-audio", dependencies=[Depends(guards.rate_limit("tts"))])
async def explain_audio(app_id: str, caller: Caller | None = Depends(optional_caller)):
    a = await _visible(app_id, caller)
    if not a.memo or not a.memo.borrower_message:
        raise HTTPException(404, "no explanation yet")
    try:
        return Response(await _tts(a.memo.borrower_message, a.language), media_type="audio/wav")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(503, "tts unavailable") from exc


# ---------- Interview ----------

@app.websocket("/ws/interview/{app_id}")
async def interview(ws: WebSocket, app_id: str, lang: str = "id"):
    from agents.interviewer import run_interview

    await ws.accept()
    a = await store.get(app_id)
    if a is not None and a.kind == "real":
        # Browsers can't put a sign-in header on a WebSocket, so a real case's borrower signs in with the first message.
        caller = None
        try:
            first = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=10))
            caller = await caller_from_token(str(first.get("token", ""))) if first.get("type") == "auth" else None
        except (TimeoutError, ValueError, RuntimeError, WebSocketDisconnect):
            caller = None
        if caller is None or caller.uid != a.owner_uid or not (a.consent and a.consent.voice):
            await ws.send_text(json.dumps({"type": "error", "message": "Sign in as the borrower who started this "
                                           "application, and allow the voice interview, to continue."}))
            await ws.close()
            return
    problem = ("application not found" if a is None
               else "Too many interviews from this device. Please wait a few minutes." if not guards.allow_ws(ws, "interview")
               else "All interview lines are busy. Please try again in a minute." if guards.interview_slots.locked()
               else None)
    if problem:
        await ws.send_text(json.dumps({"type": "error", "message": problem}))
        await ws.close()
        return
    telemetry.current_app_id.set(app_id)
    telemetry.emit("interview.started", app_id=app_id, agent="interviewer", detail=f"lang={lang}")
    started = asyncio.get_running_loop().time()
    async with guards.interview_slots:
        await run_interview(ws, a, lang if lang in ("id", "ta", "en") else a.language)
    a = await store.get(app_id)
    telemetry.emit("interview.completed", app_id=app_id, agent="interviewer", detail=f"{len(a.facts)} facts",
                   latency_ms=int((asyncio.get_running_loop().time() - started) * 1000))


# ---------- Web app ----------

# HEAD too: link checkers (and the deploy smoke test) probe the page with HEAD, which GET-only routes reject with 405.
@app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def spa(path: str):
    if path.startswith(("api/", "ws/")):
        raise HTTPException(404)
    dist = settings.web_dist
    target = (dist / path).resolve()
    if path and target.is_file() and dist.resolve() in target.parents:
        return FileResponse(target)
    index = dist / "index.html"
    if index.exists():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return JSONResponse({"bukti": "web app not built yet; run npm run build in web/"})
