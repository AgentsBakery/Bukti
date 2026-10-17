# Bukti API contract

One FastAPI service serves the API under `/api`, the interview WebSocket under `/ws`, and the built SPA at `/`.
All money values are integers in the market's minor-less unit (Rupiah, Rupee). Dates are ISO `YYYY-MM-DD`.

## Flow

```
Landing ──► load demo pack (or new application + camera uploads)
  Foto   ──► GET  /api/applications/{id}/extract/stream   (SSE: ledger + statement read, entries stream in)
  Cerita ──► WS   /ws/interview/{id}?lang=id|ta|en        (voice interview informed by the extraction)
  Hasil  ──► GET  /api/applications/{id}/assess/stream    (SSE: reconcile → integrity → benchmark → policy → memo)
Officer console polls GET /api/applications/{id} every 1.5 s and posts the decision.
```

## Endpoints

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ok, version, models}` |
| GET | `/api/demo/packs` | | `DemoPack[]` |
| POST | `/api/demo/packs/{pack_id}/load` | | `{application_id}` |
| POST | `/api/applications` | `{market, language, persona: Persona, consent: {photos: true, voice: bool}}` — **sign-in required** | `{application_id}` (a real case owned by the caller) |
| POST | `/api/applications/{id}/evidence` | multipart: `file` (image ≤15 MB or PDF ≤20 MB, ≤10 pages), `type?` | `Evidence[]` — one per PDF page; without `type` Gemini labels each |
| PATCH | `/api/applications/{id}/evidence/{evidence_id}` | `{type: EvidenceType}` | `Evidence` (relabelled by the borrower) |
| DELETE | `/api/applications/{id}/evidence/{evidence_id}` | | `{deleted}` (and its files in Cloud Storage) |
| DELETE | `/api/applications/{id}` | owner only | `{deleted}` — the case, its Firestore document and every file |
| GET | `/api/applications/{id}/evidence/{evidence_id}/image` | `exp`, `sig` (real cases) | the page image (signed link, ≤2 h) |
| GET | `/api/evidence/{evidence_id}/image` | | demo-pack image bytes |
| GET | `/api/applications/{id}` | | `Application` + `access: {edit, decide, officer, owner}` |
| GET | `/api/applications` | | `ApplicationSummary[]` (console queue: real cases the caller may see, then demos) |
| GET | `/api/me/applications` | sign-in required | the caller's real `ApplicationSummary[]` |
| GET | `/api/applications/{id}/extract/stream` | | SSE stream (see events) |
| GET | `/api/applications/{id}/assess/stream` | | SSE stream (see events) |
| POST | `/api/applications/{id}/decision` | `{action: "approve"\|"adjust"\|"decline", amount?: int, note?: string}` | `Application` |
| GET | `/api/applications/{id}/explain-audio` | | `audio/wav` borrower explanation in their language (P2) |
| POST | `/api/tts` | `{text: string, lang: Lang}` | `audio/wav` (spoken UI instructions; client falls back to `speechSynthesis` on error) |
| WS | `/ws/interview/{id}?lang=id` | see Interview | |

## Types (TypeScript)

```ts
type Market = "ID" | "IN";
type Lang = "id" | "ta" | "en";
type EvidenceType = "ledger" | "statement" | "receipt" | "shop";
type Status = "draft" | "extracting" | "extracted" | "interviewed" | "assessing" | "ready" | "decided";
type AgentName = "extractor" | "interviewer" | "verifier" | "reconciler" | "integrity" | "benchmark" | "policy" | "memo";

interface Persona { name: string; business: string; city: string }

interface DemoPack {
  id: string;               // "sari", "murugan", "rina", ...
  persona: Persona;
  market: Market;
  language: Lang;
  label: "genuine" | "inflated" | "fabricated";  // shown only in judge mode
  hero: boolean;
  has_photos: boolean;      // false = placeholder pages rendered from ground truth
}

interface Evidence {
  id: string;
  type: EvidenceType;
  label: string;            // "Ledger page 1", "QRIS statement", ...
  url: string;              // GET image URL
  width: number;
  height: number;
}

// bbox follows Gemini's convention: [ymin, xmin, ymax, xmax], each normalised 0–1000.
type BBox = [number, number, number, number];

interface Entry {
  id: string;
  evidence_id: string;
  date: string;
  description: string;
  amount_in: number;
  amount_out: number;
  bbox: BBox;               // box around the amount
  row_bbox?: BBox;          // box around the whole line
  confidence: number;       // 0–1
}

interface StatementDay { date: string; transactions: number; total: number; evidence_id: string; bbox?: BBox }

interface Fact {
  id: string;
  field: string;            // "daily_sales" | "busy_days" | "slow_period_reason" | "loan_purpose" | "years_in_business" | ...
  label: string;            // human label in English
  value: string;            // as spoken, normalised ("Rp 450.000")
  quote: string;            // what the borrower said, original language
  ts: string;
}

interface Check {
  id: string;
  agent: AgentName;
  name: string;             // "Ledger vs QRIS", "Round-number test", ...
  result: "pass" | "warn" | "fail";
  summary: string;          // one plain sentence
  detail: string;           // numbers behind it
  evidence_refs: string[];  // entry ids, evidence ids, fact ids
}

interface Metrics {
  ledger_sales_total: number;
  ledger_purchases_total: number;
  statement_total: number;
  digital_share: number;            // statement_total / ledger_sales_total
  peer_share_band: [number, number];// p25–p75 for this market + business type
  peer_median_daily_sales: number;
  verified_monthly_sales: number;
  net_monthly_cashflow: number;
  weekly_pattern: number[];         // relative cash by week of month, e.g. [1.15, 0.74, 1.0, 1.2]
  daily: { date: string; ledger: number; statement: number }[];
}

interface ScheduleItem { week: number; due_date: string; amount: number }

interface Memo {
  decision: "approve" | "approve_reduced" | "refer" | "decline";
  amount: number;
  tenor_weeks: number;
  schedule: ScheduleItem[];          // cash-flow shaped: larger in strong weeks
  headline: string;                  // officer-facing one-liner
  reasons: { text: string; refs: string[] }[];
  risks: { text: string; refs: string[] }[];
  coaching: string[];                // borrower-facing, their language
  borrower_message: string;          // borrower-facing summary, their language
  borrower_reasons: string[];        // 3 case-specific reasons, borrower's language (result screen "Why?")
  citations: { source: string; text: string }[];
  model: string;
}

interface AgentStep { agent: AgentName; status: "pending" | "running" | "done" | "error"; summary: string; started_at?: string; ended_at?: string }

interface Decision { action: "approve" | "adjust" | "decline"; amount: number; note: string; officer: string; ts: string }

interface Application {
  id: string;
  pack_id: string | null;
  persona: Persona;
  market: Market;
  language: Lang;
  currency: "Rp" | "₹";
  status: Status;
  created_at: string;
  evidence: Evidence[];
  entries: Entry[];
  statement: StatementDay[];
  facts: Fact[];
  checks: Check[];
  metrics: Metrics | null;
  memo: Memo | null;
  agent_trace: AgentStep[];
  decision: Decision | null;
}

interface ApplicationSummary { id: string; persona: Persona; market: Market; status: Status; created_at: string; amount?: number; decision?: string }
```

## SSE events (`text/event-stream`, one JSON object per `data:` line)

```ts
{ type: "agent", agent: AgentName, status: "running" | "done" | "error", summary: string }
{ type: "evidence_scan", evidence_id: string }          // start the ink scan-line on this photo
{ type: "entry", entry: Entry }                          // one per extracted line → lift-off animation
{ type: "statement_day", day: StatementDay }
{ type: "check", check: Check }
{ type: "metrics", metrics: Metrics }
{ type: "memo", memo: Memo }
{ type: "error", message: string }
{ type: "done", application: Application }
```

## Interview WebSocket `/ws/interview/{id}?lang=id`

Client → server:
- first text frame, when signed in: `{"type":"auth","token":"<Firebase ID token>"}` — required for a real case
  (browsers can't put headers on a WebSocket, and tokens never go in the URL); demo cases ignore it
- binary frames: raw PCM16 mono 16 kHz little-endian microphone audio
- text `{"type":"end"}` to finish early

Server → client:
- binary frames: raw PCM16 mono 24 kHz agent speech
- text JSON:
  - `{type:"transcript", role:"user"|"agent", text:string, final:boolean}` — `final:false` events are
    incremental fragments to append; a `final:true` event carries the COMPLETE utterance and replaces the
    buffered fragments for that turn
  - `{type:"fact", fact: Fact}`
  - `{type:"interrupted"}` (stop playback)
  - `{type:"done", facts: Fact[]}`
  - `{type:"error", message:string}`

## Auth (Google sign-in via Firebase Auth) and access

Demo cases never need sign-in. A **real** application needs the borrower to sign in. When signed in, the client sends
`Authorization: Bearer <Firebase ID token>` on every `/api` request; the backend verifies it.

| Who | Demo case | Real case |
|---|---|---|
| anyone | view, add/relabel evidence, run, decide | — (404) |
| the borrower who created it | as above | view, add/relabel/remove evidence, run, interview, delete |
| a loan officer (`BUKTI_OFFICER_EMAILS`) | as above | view (read-only evidence), run, **decide** |

Photos of real cases are served through links signed with HMAC (`BUKTI_URL_KEY`, from Secret Manager) that expire
within two hours, because `<img>` tags can't carry a sign-in header. Files live in
`gs://bukti-ai-evidence/applications/{case}/{evidence}/page.jpg` and `original.<ext>`; the bucket blocks public access.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/auth/config` | | `{enabled: boolean, firebase?: {apiKey, authDomain, projectId, appId}}` — `enabled:false` → show guest-only |
| POST | `/api/auth/session` | (Bearer token required) | `User` — upserts the user row, logs `auth.login` |
| GET | `/api/me` | (Bearer optional) | `User` or `401` |

```ts
interface User { uid: string; email: string; name: string; photo_url: string | null; role: "officer" | "borrower";
                 created_at: string; last_login_at: string; login_count: number }
```

`Application.kind: "demo" | "real"`, `Application.owner_uid`, `Application.consent: {photos, voice, ts}`.
`Evidence` for uploads adds `original_name, page, parent_id, ai_type, ai_confidence, label_source ("ai"|"borrower"),
status ("ready"|"needs_review"|"excluded"), note`; `EvidenceType` adds `"other"` (not used). `Decision.officer` carries
the signed-in officer's name (or "Loan officer (demo)" for guests on demo cases).

## Officer Copilot (tool-using Gemini agent over one case)

`POST /api/applications/{id}/copilot` with `{question: string, session_id?: string}` → `text/event-stream`:

```ts
{ type: "session", session_id: string }                      // reuse to keep the conversation
{ type: "tool", name: string, args: object }                   // e.g. get_checks, get_entries — show "Looking at …"
{ type: "highlight", refs: string[], note: string }            // entry / check / statement ids → highlight on the photo
{ type: "answer_delta", text: string }                         // streamed answer text (append)
{ type: "answer", text: string, refs: string[] }               // final answer (replace) + ids it cites
{ type: "error", message: string }
{ type: "done" }
```

Suggested questions: "Why are sales lower in week 2?", "Which days don't match the QRIS records?",
"Is this notebook genuine?", "What should I ask the borrower before approving?"

## Agent run log (observability)

`GET /api/applications/{id}/events` → `Event[]` (newest last), also written to BigQuery `bukti.events`.

```ts
interface Event {
  event_id: string; ts: string;
  type: "auth.login" | "application.created" | "evidence.uploaded" | "stage.started" | "stage.completed"
      | "agent.started" | "agent.completed" | "model.call" | "tool.call" | "interview.started"
      | "interview.completed" | "copilot.question" | "decision.made" | "guardrail.blocked";
  app_id: string | null; user_id: string | null;
  agent: string | null; model: string | null; tool: string | null;
  latency_ms: number | null; input_tokens: number | null; output_tokens: number | null;
  cost_usd: number | null; status: "ok" | "error" | "blocked"; detail: string;
}
```
