// Bukti API types — mirrors docs/CONTRACT.md exactly. Do not drift from the contract.

export type Market = 'ID' | 'IN'
export type Lang = 'id' | 'ta' | 'en'
export type EvidenceType = 'ledger' | 'statement' | 'receipt' | 'shop' | 'other'
export type EvidenceStatus = 'ready' | 'needs_review' | 'excluded'
export type CaseKind = 'demo' | 'real'
export type Status = 'draft' | 'extracting' | 'extracted' | 'interviewed' | 'assessing' | 'ready' | 'decided'
export type AgentName = 'extractor' | 'interviewer' | 'verifier' | 'reconciler' | 'integrity' | 'benchmark' | 'policy' | 'memo'

export interface Persona {
  name: string
  business: string
  city: string
}

export interface DemoPack {
  id: string
  persona: Persona
  market: Market
  language: Lang
  label: 'genuine' | 'inflated' | 'fabricated'
  hero: boolean
  has_photos: boolean
}

export interface Evidence {
  id: string
  type: EvidenceType
  label: string
  url: string
  width: number
  height: number
  // Real uploads only
  original_name?: string
  page?: number | null
  parent_id?: string | null
  ai_type?: EvidenceType | null
  ai_confidence?: number | null
  label_source?: 'pack' | 'ai' | 'borrower'
  status?: EvidenceStatus
  note?: string
}

/** [ymin, xmin, ymax, xmax], each normalised 0–1000 (Gemini convention). */
export type BBox = [number, number, number, number]

export interface Entry {
  id: string
  evidence_id: string
  date: string
  description: string
  amount_in: number
  amount_out: number
  bbox: BBox
  row_bbox?: BBox
  confidence: number
}

export interface StatementDay {
  date: string
  transactions: number
  total: number
  evidence_id: string
  bbox?: BBox
}

export interface Fact {
  id: string
  field: string
  label: string
  value: string
  quote: string
  ts: string
}

export type CheckResult = 'pass' | 'warn' | 'fail'

export interface Check {
  id: string
  agent: AgentName
  name: string
  result: CheckResult
  summary: string
  detail: string
  evidence_refs: string[]
}

export interface Metrics {
  ledger_sales_total: number
  ledger_purchases_total: number
  statement_total: number
  digital_share: number
  peer_share_band: [number, number]
  peer_median_daily_sales: number
  verified_monthly_sales: number
  net_monthly_cashflow: number
  weekly_pattern: number[]
  daily: { date: string; ledger: number; statement: number }[]
}

export interface ScheduleItem {
  week: number
  due_date: string
  amount: number
}

export type MemoDecision = 'approve' | 'approve_reduced' | 'refer' | 'decline'

export interface Memo {
  decision: MemoDecision
  amount: number
  tenor_weeks: number
  schedule: ScheduleItem[]
  headline: string
  reasons: { text: string; refs: string[] }[]
  risks: { text: string; refs: string[] }[]
  coaching: string[]
  borrower_message: string
  /** Three case-specific reasons in the borrower's language, written by the memo model. */
  borrower_reasons?: string[]
  citations: { source: string; text: string }[]
  model: string
}

export type StepStatus = 'pending' | 'running' | 'done' | 'error'

export interface AgentStep {
  agent: AgentName
  status: StepStatus
  summary: string
  started_at?: string
  ended_at?: string
}

export type DecisionAction = 'approve' | 'adjust' | 'decline'

export interface Decision {
  action: DecisionAction
  amount: number
  note: string
  officer: string
  ts: string
}

export interface Application {
  id: string
  pack_id: string | null
  persona: Persona
  market: Market
  language: Lang
  currency: 'Rp' | '₹'
  status: Status
  created_at: string
  evidence: Evidence[]
  entries: Entry[]
  statement: StatementDay[]
  facts: Fact[]
  checks: Check[]
  metrics: Metrics | null
  memo: Memo | null
  agent_trace: AgentStep[]
  decision: Decision | null
  owner_uid?: string | null
  kind?: CaseKind
  consent?: { photos: boolean; voice: boolean; ts: string } | null
  /** What the current viewer may do (sent by the server for every application it returns). */
  access?: { edit: boolean; decide: boolean; officer: boolean; owner: boolean }
}

export interface ApplicationSummary {
  id: string
  kind?: CaseKind
  persona: Persona
  market: Market
  status: Status
  created_at: string
  amount?: number
  decision?: string
}

export interface Health {
  ok: boolean
  version: string
  models: unknown
}

// ---- SSE events -----------------------------------------------------------

export type StreamEvent =
  | { type: 'agent'; agent: AgentName; status: 'running' | 'done' | 'error'; summary: string }
  | { type: 'evidence_scan'; evidence_id: string }
  | { type: 'entry'; entry: Entry }
  | { type: 'statement_day'; day: StatementDay }
  | { type: 'check'; check: Check }
  | { type: 'metrics'; metrics: Metrics }
  | { type: 'memo'; memo: Memo }
  | { type: 'error'; message: string }
  | { type: 'done'; application: Application }

// ---- Interview WebSocket --------------------------------------------------

export type InterviewServerMessage =
  | { type: 'transcript'; role: 'user' | 'agent'; text: string; final: boolean }
  | { type: 'fact'; fact: Fact }
  | { type: 'interrupted' }
  | { type: 'done'; facts: Fact[] }
  | { type: 'error'; message: string }

export const AGENT_ORDER: AgentName[] = [
  'extractor',
  'interviewer',
  'verifier',
  'reconciler',
  'integrity',
  'benchmark',
  'policy',
  'memo',
]

// ---- Auth (optional Google sign-in) ----------------------------------------

export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

export interface AuthConfig {
  enabled: boolean
  firebase?: FirebaseWebConfig
}

export interface User {
  uid: string
  email: string
  name: string
  photo_url: string | null
  role: 'officer' | 'borrower'
  created_at: string
  last_login_at: string
  login_count: number
}

// ---- Officer Copilot ---------------------------------------------------------

export type CopilotEvent =
  | { type: 'session'; session_id: string }
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'highlight'; refs: string[]; note: string }
  | { type: 'answer_delta'; text: string }
  | { type: 'answer'; text: string; refs: string[] }
  | { type: 'error'; message: string }
  | { type: 'done' }

// ---- Agent run log -------------------------------------------------------------

export type RunEventType =
  | 'auth.login'
  | 'application.created'
  | 'evidence.uploaded'
  | 'stage.started'
  | 'stage.completed'
  | 'agent.started'
  | 'agent.completed'
  | 'model.call'
  | 'tool.call'
  | 'interview.started'
  | 'interview.completed'
  | 'copilot.question'
  | 'decision.made'
  | 'guardrail.blocked'
  | 'guardrail.fallback'

/** Contract name: `Event`. Renamed here so it doesn't shadow the DOM's Event. */
export interface RunEvent {
  event_id: string
  ts: string
  type: RunEventType
  app_id: string | null
  user_id: string | null
  agent: string | null
  model: string | null
  tool: string | null
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  status: 'ok' | 'error' | 'blocked'
  detail: string
}
