"""Pydantic models for the Bukti API. Mirrors docs/CONTRACT.md exactly."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

Market = Literal["ID", "IN"]
Lang = Literal["id", "ta", "en"]
EvidenceType = Literal["ledger", "statement", "receipt", "shop", "other"]
EvidenceStatus = Literal["ready", "needs_review", "excluded"]
CaseKind = Literal["demo", "real"]
Status = Literal["draft", "extracting", "extracted", "interviewed", "assessing", "ready", "decided"]
AgentName = Literal["extractor", "interviewer", "verifier", "reconciler", "integrity", "benchmark", "policy", "memo"]
CheckResult = Literal["pass", "warn", "fail"]
MemoDecision = Literal["approve", "approve_reduced", "refer", "decline"]
OfficerAction = Literal["approve", "adjust", "decline"]

AGENT_ORDER: list[AgentName] = ["extractor", "interviewer", "verifier", "reconciler", "integrity", "benchmark", "policy", "memo"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Persona(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    business: str = Field(min_length=1, max_length=80)
    city: str = Field(default="", max_length=80)


class DemoPack(BaseModel):
    id: str
    persona: Persona
    market: Market
    language: Lang
    label: Literal["genuine", "inflated", "fabricated"]
    hero: bool
    has_photos: bool


class Evidence(BaseModel):
    id: str
    type: EvidenceType
    label: str
    url: str
    width: int
    height: int
    sha256: str = ""
    ahash: str = ""
    src: str = ""  # where the bytes live: "pack:<path>", "object:<storage path>" (uploads), legacy "upload:<id>"
    # Real uploads (empty for demo-pack evidence)
    mime: str = "image/jpeg"
    original_name: str = ""
    gcs_uri: str = ""        # the processed page image in Cloud Storage
    original_uri: str = ""   # the file exactly as uploaded (a PDF is stored once, beside its first page)
    page: int | None = None  # 1-based page number when the evidence is a page of a PDF
    parent_id: str | None = None  # id shared by all pages of one uploaded PDF
    ai_type: EvidenceType | None = None
    ai_confidence: float | None = None
    label_source: Literal["pack", "ai", "borrower"] = "pack"
    status: EvidenceStatus = "ready"
    note: str = ""
    # Set when a notebook page has been read: what the page turned out to be, and why if no lines were kept.
    read_kind: Literal["daily_records", "period_summary", "not_records", "unreadable"] | None = None
    read_note: str = ""


class Entry(BaseModel):
    id: str
    evidence_id: str
    date: str
    description: str
    amount_in: int = 0
    amount_out: int = 0
    bbox: list[int] = Field(default_factory=lambda: [0, 0, 0, 0])
    row_bbox: list[int] | None = None
    confidence: float = 0.0


class StatementDay(BaseModel):
    date: str
    transactions: int
    total: int
    evidence_id: str
    bbox: list[int] | None = None


class PageNote(BaseModel):
    evidence_id: str
    text: str


class Fact(BaseModel):
    id: str
    field: str
    label: str
    value: str
    quote: str
    ts: str = Field(default_factory=now_iso)


class Check(BaseModel):
    id: str
    agent: AgentName
    name: str
    result: CheckResult
    summary: str
    detail: str
    evidence_refs: list[str] = Field(default_factory=list)


class DailyPoint(BaseModel):
    date: str
    ledger: int
    statement: int


class Metrics(BaseModel):
    ledger_sales_total: int
    ledger_purchases_total: int
    statement_total: int
    digital_share: float
    peer_share_band: list[float]
    peer_median_daily_sales: int
    verified_monthly_sales: int
    net_monthly_cashflow: int
    weekly_pattern: list[float]
    daily: list[DailyPoint]


class ScheduleItem(BaseModel):
    week: int
    due_date: str
    amount: int


class Ref(BaseModel):
    text: str
    refs: list[str] = Field(default_factory=list)


class Citation(BaseModel):
    source: str
    text: str


class Memo(BaseModel):
    decision: MemoDecision
    amount: int
    tenor_weeks: int
    schedule: list[ScheduleItem]
    headline: str
    reasons: list[Ref]
    risks: list[Ref]
    coaching: list[str]
    borrower_message: str
    borrower_reasons: list[str] = Field(default_factory=list)
    citations: list[Citation]
    model: str


class AgentStep(BaseModel):
    agent: AgentName
    status: Literal["pending", "running", "done", "error"] = "pending"
    summary: str = ""
    started_at: str | None = None
    ended_at: str | None = None


class Decision(BaseModel):
    action: OfficerAction
    amount: int
    note: str
    officer: str
    ts: str = Field(default_factory=now_iso)


class Consent(BaseModel):
    photos: bool
    voice: bool
    ts: str = Field(default_factory=now_iso)


class Application(BaseModel):
    id: str
    kind: CaseKind = "demo"
    pack_id: str | None = None
    owner_uid: str | None = None
    consent: Consent | None = None
    persona: Persona
    market: Market
    language: Lang
    currency: Literal["Rp", "₹"]
    status: Status = "draft"
    created_at: str = Field(default_factory=now_iso)
    evidence: list[Evidence] = Field(default_factory=list)
    entries: list[Entry] = Field(default_factory=list)
    statement: list[StatementDay] = Field(default_factory=list)
    facts: list[Fact] = Field(default_factory=list)
    page_notes: list[PageNote] = Field(default_factory=list)
    checks: list[Check] = Field(default_factory=list)
    metrics: Metrics | None = None
    memo: Memo | None = None
    agent_trace: list[AgentStep] = Field(default_factory=lambda: [AgentStep(agent=a) for a in AGENT_ORDER])
    decision: Decision | None = None

    def step(self, agent: AgentName) -> AgentStep:
        for s in self.agent_trace:
            if s.agent == agent:
                return s
        s = AgentStep(agent=agent)
        self.agent_trace.append(s)
        return s


class ApplicationSummary(BaseModel):
    id: str
    kind: CaseKind = "demo"
    persona: Persona
    market: Market
    status: Status
    created_at: str
    amount: int | None = None
    decision: str | None = None


class ConsentIn(BaseModel):
    photos: bool
    voice: bool


class CreateApplication(BaseModel):
    market: Market
    language: Lang
    persona: Persona
    consent: ConsentIn


class EvidenceUpdate(BaseModel):
    type: EvidenceType


class DecisionIn(BaseModel):
    action: OfficerAction
    amount: int | None = None
    note: str = ""


class CopilotIn(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    session_id: str | None = None


class TtsIn(BaseModel):
    text: str = Field(max_length=1200)
    lang: Lang
