# Bukti — architecture

> Evidence-based credit for informal micro-businesses. Google Cloud AI Builder Cup JAPAC 2026, BFSI theme.
> Companion docs: [TESTING.md](TESTING.md) · [COSTS.md](COSTS.md) · [OPERATIONS.md](OPERATIONS.md) ·
> [CONTRACT.md](CONTRACT.md) (API) · [PITCH.md](PITCH.md) (video + deck)

## 1. What it does

A warung owner in Indonesia or a kirana owner in Tamil Nadu has years of business records — in a handwritten
notebook, a QRIS/UPI payment history and a shoebox of receipts — but no financial statements, so banks can't lend.

Bukti turns that evidence into an explainable credit decision:

1. **Photo (Foto).** The borrower photographs notebook pages and their payment statement. Gemini 3.8 Flash reads
   every line; each number keeps a bounding box back to where it was written.
2. **Story (Cerita).** A two-minute voice interview in Bahasa Indonesia or Tamil with Gemini 3.8 Live. The
   interviewer has already read the notebook, so it asks about *their* numbers.
3. **Result (Hasil).** ADK agents benchmark the shop against peers (BigQuery), reconcile the notebook against the
   payment rail, test for fabrication (including Model Armor screening of hidden instructions to the AI), size an
   affordable loan with repayments shaped to the shop's month, and Gemini 4 Argon writes the memo.
4. **Decision.** A loan officer reviews an evidence-linked memo, asks the **Officer Copilot** questions, and
   approves, adjusts or declines. The borrower hears the outcome in their own language.

Principle: **Gemini reads and explains; rules decide; a human approves.**

## 2. GCP architecture

```mermaid
flowchart LR
  subgraph Users
    B[Borrower<br/>mobile web]
    O[Loan officer<br/>console]
    J[Judge<br/>demo mode]
  end

  subgraph GCP_SG["Google Cloud · asia-southeast1 (Singapore)"]
    direction TB
    CR["Cloud Run: bukti<br/>FastAPI + ADK 2.12 + React SPA<br/>1 always-warm instance"]
    FS[(Firestore<br/>applications · users)]
    GCS[(Cloud Storage<br/>uploaded photos)]
    BQ[(BigQuery<br/>peer_benchmarks · events)]
    BQL[(BigQuery bukti_logs<br/>Cloud Logging sink)]
    MA[Model Armor<br/>bukti-shield template]
    SM[Secret Manager]
    LOG[Cloud Logging]
    AR[(Artifact Registry)]
    SQ["Cloud Run: bukti-sonarqube<br/>+ Cloud SQL Auth Proxy sidecar"]
    SQL[(Cloud SQL Postgres 17<br/>no authorized networks)]
  end

  subgraph AP["Gemini Enterprise Agent Platform"]
    FL[gemini-3.8-flash<br/>vision extraction + copilot]
    AG[gemini-4-argon<br/>credit memo]
    TTS[gemini-3.8-flash-tts<br/>spoken guidance]
    LV["gemini-3.8-live<br/>(us-central1)<br/>voice interview"]
  end

  FB[Firebase Auth<br/>Google sign-in, optional]
  GH[GitHub Actions] -->|Workload Identity Federation<br/>no keys| AR
  GH -->|deploy scanned digest| CR
  GH -->|quality gate| SQ

  B & O & J -->|HTTPS · SSE · WebSocket| CR
  O -.->|ID token| FB
  CR --> FL & AG & TTS
  CR -->|bidi audio| LV
  CR --> MA
  CR --> FS & GCS & BQ
  CR --> LOG --> BQL
  SQ --> SQL
  SQ -.-> SM
```

| Component | Why it is there |
|---|---|
| Cloud Run `bukti` | One service serves the web app, REST, SSE streams and the interview WebSocket. `min-instances=1` so judges never hit a cold start; `max-instances=1` keeps in-memory state consistent; session affinity for WebSockets. |
| Gemini 3.8 Flash | Reads handwriting and statements with structured output + bounding boxes; powers the Officer Copilot. |
| Gemini 4 Argon | Writes the officer memo and the borrower message from the policy engine's numbers. |
| Gemini 3.8 Live | Native-audio interview in Bahasa / Tamil with tool calls. Only served from US regions. |
| Gemini 3.8 Flash TTS | Speaks instructions and the outcome to low-literacy borrowers. |
| Model Armor | Prompt-injection / jailbreak and safety screening of all borrower-written text and copilot questions. |
| Firestore | Applications (write-through from memory) and the `users` table. |
| BigQuery | `peer_benchmarks` (policy input), `events` (typed audit + agent telemetry), `bukti_logs` (every log line). |
| Firebase Auth | Optional Google sign-in; the demo never requires it. |
| Artifact Registry + GitHub Actions | CI builds, scans, pushes and deploys by digest. |
| SonarQube on Cloud Run + Cloud SQL | Self-hosted code-quality gate; scales to zero; DB only reachable through the IAM-authenticated proxy. |

## 3. User flows

### Borrower (mobile)

```mermaid
flowchart TD
  L[Landing] -->|"Be Ibu Sari" / own phone| LANG[Pick language<br/>Bahasa · தமிழ் · English]
  LANG --> FOTO[Foto: shoebox of evidence<br/>camera + blur/dark check]
  FOTO -->|"Baca buku saya"| READ[Ink scan line sweeps the page<br/>numbers lift off into the digital ledger<br/>QRIS days stamp matched / gap]
  READ --> CERITA[Cerita: voice interview<br/>ink-blot orb · live captions · fact stamps]
  CERITA -->|or skip| HASIL[Hasil: agents run calmly in the background]
  HASIL --> OUT{Outcome}
  OUT -->|approve| A[“You can borrow Rp 2.700.000”<br/>coin calendar shaped to her month]
  OUT -->|reduced| R[Smaller amount based on verified sales<br/>+ how to qualify for more]
  OUT -->|refer| F[“Your loan officer will review”<br/>never an accusation]
  A & R & F --> LISTEN[Listen: TTS in her language]
```

### Loan officer (desktop)

```mermaid
flowchart TD
  S[Sign in with Google<br/>or continue as guest] --> Q[Application queue]
  Q --> CASE[Case file]
  CASE --> EV[Evidence viewer<br/>click a number ↔ highlight on the photo]
  CASE --> GRAPH[Agent graph + run log<br/>latency · tokens · cost]
  CASE --> PROOF[Proof chain: 9 checks as stamps]
  CASE --> MEMO[Memo with cited reasons and risks]
  CASE --> COP[Officer Copilot<br/>“Why is week 2 low?”]
  COP -->|tool calls + highlights| EV
  MEMO --> DEC[Decide: approve · adjust · decline<br/>fairness panel · affordability slider]
  DEC --> AUD[Audit trail + decision.made event]
```

### Judge

```mermaid
flowchart LR
  URL[Public URL<br/>no login] --> CARDS{Three cards}
  CARDS --> SARI[Be Ibu Sari · Bahasa]
  CARDS --> MUR[Be Murugan · Tamil]
  CARDS --> RINA[Watch a fake ledger get caught]
  SARI & MUR & RINA --> DEMO[Demo mode: phone + console side by side, live]
```

## 4. Agent architecture

```mermaid
flowchart TB
  subgraph EXTRACT["Stage 1 — extract (ADK custom agent)"]
    X[ExtractorAgent<br/>pages in parallel · hedged requests<br/>gemini-3.8-flash vision + bbox]
  end
  subgraph INTERVIEW["Stage 2 — interview (ADK run_live)"]
    I[Interviewer LlmAgent<br/>gemini-3.8-live · Bahasa / Tamil]
    T1[[record_fact]]
    T2[[end_interview]]
    I --> T1 & T2
  end
  subgraph ASSESS["Stage 3 — assess (ADK SequentialAgent)"]
    BM[BenchmarkAgent<br/>BigQuery peers] --> PAR
    subgraph PAR["ParallelAgent: verify"]
      RC[ReconcilerAgent<br/>share · rhythm · idle days]
      IG[IntegrityAgent<br/>round numbers · regularity ·<br/>reused photos · Model Armor]
    end
    PAR --> PO[PolicyAgent<br/>verified cash → affordable loan<br/>cash-flow-shaped schedule]
    PO --> ME[MemoAgent]
    ME --> MW[memo_writer LlmAgent<br/>gemini-4-argon · output schema]
  end
  subgraph COPILOT["On demand — Officer Copilot (LlmAgent)"]
    C[copilot · gemini-3.8-flash]
    C --> CT1[[get_case_summary]] & CT2[[get_checks]] & CT3[[get_entries]]
    C --> CT4[[compare_with_payments]] & CT5[[get_interview_facts]] & CT6[[highlight_evidence]]
  end
  EXTRACT -->|evidence brief| INTERVIEW
  INTERVIEW -->|facts| ASSESS
  ASSESS -->|case file| COPILOT
  PLUG{{ObservabilityPlugin<br/>on every Runner}} -.-> EXTRACT & INTERVIEW & ASSESS & COPILOT
```

| Agent | Type | Model | Decides or explains | Guardrails |
|---|---|---|---|---|
| Extractor | `BaseAgent` (custom) | gemini-3.8-flash | Reads | response schema, bbox clamp, implausible-amount drop, 60 s timeout + hedge, cache by image hash |
| Interviewer | `LlmAgent` (live) | gemini-3.8-live | Asks | no protected attributes, never promises a loan, 5-min cap, reconnect once, quotes only reach the memo after Model Armor |
| Benchmark | `BaseAgent` | — (BigQuery) | Decides input | validated identifiers, parameterised query, cached |
| Reconciler | `BaseAgent` | — | **Decides** | deterministic, unit-tested on ground truth |
| Integrity | `BaseAgent` | — + Model Armor | **Decides** | screens notes, descriptions, quotes |
| Policy | `BaseAgent` | — | **Decides** | 30% weekly affordability cap, first-loan caps, refer on ≥2 integrity failures |
| Memo writer | `LlmAgent` | gemini-4-argon | Explains | output schema, never sets numbers, 120 s timeout → rules-only memo |
| Officer Copilot | `LlmAgent` + 6 tools | gemini-3.8-flash | Explains | read-only tools scoped to one case, Model Armor on questions, 90 s timeout |

Why this split: credit decisions must be reproducible and auditable, so every number and every verdict comes from
deterministic agents that are unit-tested against ground truth. LLMs do what they are uniquely good at — reading
messy handwriting, interviewing in local languages, and explaining — and are bounded by schemas, timeouts and
guardrails. ADK gives one runtime for all of it (custom agents, sequential/parallel orchestration, live audio,
tool-using agents) and a single plugin point for observability.

### One application end to end

```mermaid
sequenceDiagram
  autonumber
  participant P as Phone (borrower)
  participant API as Cloud Run (FastAPI)
  participant X as Extractor
  participant G as Gemini 3.8 Flash
  participant L as Gemini 3.8 Live
  participant A as Assess agents
  participant R as Gemini 4 Argon
  participant C as Console (officer)
  P->>API: POST /demo/packs/sari/load
  P->>API: GET /extract/stream (SSE)
  API->>X: run extract stage
  X->>G: page 1, page 2, statement (parallel)
  G-->>X: lines + boxes
  X-->>P: entry events → lift-off animation
  C->>API: poll application (entries fill in live)
  P->>API: WS /ws/interview (PCM 16 kHz)
  API->>L: bidi audio + evidence brief
  L-->>P: speech 24 kHz + transcripts
  L->>API: record_fact(...) ×5
  P->>API: GET /assess/stream (SSE)
  API->>A: benchmark → reconcile ∥ integrity → policy
  A->>R: memo prompt (numbers fixed)
  R-->>A: headline, reasons, coaching, borrower message
  API-->>P: memo → coin calendar
  C->>API: POST /copilot "why is week 2 low?"
  C->>API: POST /decision approve
```

## 5. Data model

```mermaid
erDiagram
  USER ||--o{ APPLICATION : owns
  APPLICATION ||--|{ EVIDENCE : has
  EVIDENCE ||--o{ ENTRY : "lines read from"
  EVIDENCE ||--o{ STATEMENT_DAY : "rows read from"
  APPLICATION ||--o{ FACT : "interview"
  APPLICATION ||--o{ CHECK : "verification"
  APPLICATION ||--o| MEMO : "recommendation"
  APPLICATION ||--o| DECISION : "officer"
  APPLICATION ||--o{ EVENT : "telemetry"
  USER {
    string uid PK
    string email
    string name
    string role
    timestamp created_at
    timestamp last_login_at
    int login_count
  }
  APPLICATION {
    string id PK
    string pack_id
    string owner_uid FK
    string market "ID | IN"
    string language "id | ta | en"
    string status
  }
  EVIDENCE {
    string id PK
    string type "ledger | statement | receipt | shop"
    string sha256
    string ahash "perceptual hash"
    string src "pack: or upload:"
  }
  ENTRY {
    string id PK
    date date
    int amount_in
    int amount_out
    int_array bbox "ymin xmin ymax xmax 0-1000"
    float confidence
  }
  CHECK {
    string id PK "chk_share, chk_rhythm, ..."
    string result "pass | warn | fail"
    string summary
  }
  MEMO {
    string decision
    int amount
    int tenor_weeks
    json schedule
    json reasons_with_refs
  }
  EVENT {
    string event_id PK
    timestamp ts
    string type
    string agent
    string model
    int latency_ms
    int input_tokens
    int output_tokens
    float cost_usd
  }
```

Where it lives: `APPLICATION` and children → Firestore `applications/{id}` (one document); `USER` → Firestore
`users/{uid}`; `EVENT` → BigQuery `bukti.events` (partitioned by day, clustered by type and application); every log
line → BigQuery `bukti_logs` via a Cloud Logging sink; benchmarks → BigQuery `bukti.peer_benchmarks`; uploaded
photos → `gs://bukti-ai-evidence/uploads/`.

## 6. Security and guardrails

```mermaid
flowchart LR
  IN[Request] --> RL[Per-IP token buckets<br/>+ concurrency caps]
  RL --> AUTH[Optional Firebase ID token<br/>verified against Google keys]
  AUTH --> VAL[Validation<br/>image decode · 15 MB · 12 photos · enums]
  VAL --> MA[Model Armor<br/>borrower text + copilot questions]
  MA --> LLM[Gemini<br/>schemas · timeouts · hedges · fallbacks]
  LLM --> RULES[Deterministic policy<br/>sets every number]
  RULES --> HUMAN[Human officer decides]
  HUMAN --> OUT[Response<br/>CSP · HSTS · nosniff · COOP]
```

- **Identity & access.** Runtime SA: Agent Platform user, Firestore user, BigQuery job user + dataset-level writer on
  `bukti` only, read on benchmarks, its own bucket, Model Armor user. CI deployer SA: push to one Artifact Registry
  repo, `run.developer`, act-as the runtime SA — via WIF scoped to `AgentsBakery/Bukti`, no keys. SonarQube SA: Cloud
  SQL client + its own DB secret.
- **Public access** uses Cloud Run's `--no-invoker-iam-check` because the organisation enforces domain-restricted
  sharing; the org policy is untouched.
- **Data.** All synthetic. Logs carry ids, never names, quotes or amounts. Firestore, GCS, BigQuery and Cloud SQL are
  in asia-southeast1; model calls go to Agent Platform's global endpoint (Live: us-central1).
- **Responsible AI.** No protected attributes are used or asked; flagged cases are referred, not auto-declined;
  borrower messages are dignity-first; every reason cites evidence.

## 7. CI/CD

```mermaid
flowchart LR
  PUSH[push / PR] --> BE[Backend<br/>ruff · pytest · bandit · pip-audit]
  PUSH --> FE[Frontend<br/>tsc · oxlint · build · npm audit]
  PUSH --> SEC[gitleaks<br/>full history]
  PUSH --> SAST[Semgrep]
  PUSH --> SONAR[SonarQube<br/>quality gate]
  BE & FE --> IMG[Build image<br/>Trivy image + Dockerfile scan]
  IMG -->|main only| PUSHIMG[Push digest<br/>Artifact Registry via WIF]
  PUSHIMG & SEC & SAST & SONAR --> DEP[Deploy digest to Cloud Run]
  DEP --> SMOKE{Smoke test}
  SMOKE -->|fail| RB[Roll traffic back]
  SMOKE -->|pass| LIVE[Live]
```

## 8. Observability

- **Run log in the console**: every agent start/finish, model call (model, latency, input/output tokens, cost), tool
  call, guardrail block and decision for the selected application.
- **BigQuery `bukti.events`**, e.g. cost per application:

```sql
SELECT app_id, ROUND(SUM(cost_usd), 4) AS usd, SUM(input_tokens + output_tokens) AS tokens,
       COUNTIF(type = 'guardrail.blocked') AS blocked
FROM `bukti-ai.bukti.events`
WHERE ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY app_id ORDER BY usd DESC;
```

- **BigQuery `bukti_logs`**: every structured log line from the service (Cloud Logging sink), for incident review.

## 9. Repository map

| Path | What |
|---|---|
| `app/main.py` | FastAPI routes, SSE stages, interview WebSocket, TTS, SPA serving |
| `app/guards.py` | Rate limits, concurrency caps, security headers |
| `app/auth.py` | Optional Firebase sign-in, `users` table |
| `app/telemetry.py` | Events, cost estimates, BigQuery writer |
| `app/store.py`, `app/packs.py` | Applications, evidence images, demo packs |
| `agents/extractor.py` | Vision extraction agent |
| `agents/assess.py`, `agents/analysis.py` | Benchmark, reconcile, integrity, policy, memo |
| `agents/interviewer.py` | Live voice interviewer |
| `agents/copilot.py` | Officer Copilot |
| `agents/observability.py` | ADK plugin |
| `agents/shield.py` | Model Armor client |
| `web/` | React + Vite + Tailwind app (borrower, console, demo, login) |
| `data/` | Pack generator, packs, policy, benchmarks, bundled reads |
| `eval/` | End-to-end eval, interview smoke test, cache bundler |
| `infra/sonarqube/` | SonarQube image, Cloud Run service, deploy script |
| `.github/workflows/ci-cd.yml` | Pipeline |

## 10. Built so far (chronological)

| Commit | Milestone |
|---|---|
| `f299445` | Evidence packs, ADK pipeline and API |
| `6e17b60` | Deploy script, Dockerfile, eval harness, policy, README |
| `e1f663c` | Verified live on bukti-ai: warm-up, timeouts, interview smoke test |
| `968a2ea` | Hedged vision calls, live reconnect, cached benchmarks, public access |
| `6b89062` | Model Armor screening of borrower text |
| `111ba5b` | Pitch kit, legible scan pacing |
| `282d3f5` | Ink & Paper web app; ruff/bandit/Semgrep fixes |
| `1b5e664` | CI/CD with security gates, WIF deploys, runtime guardrails |
| `a17eb9b` | SonarQube on Cloud Run + Cloud SQL |
| `9b54e81` | Fixes for findings raised by the pipeline's own gates |
| `84cd5e7` | Officer Copilot, observability plugin, optional sign-in, events and log tables |

## 11. Known limitations

- Demo data is synthetic; accuracy numbers come from team-handwritten pages, not real borrowers.
- One Cloud Run instance by design (in-memory sessions); scaling out needs Agent Platform Sessions for ADK and
  Firestore-only reads.
- The officer console is open to guests in the demo; production would require sign-in and roles for officers.
- Live interview runs in us-central1 (the only Live region), so audio crosses regions.
- Sign-in requires the Google provider to be enabled in Firebase (see OPERATIONS.md).
