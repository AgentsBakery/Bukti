# Bukti — what it costs

List prices checked on the official pricing pages on **2026-10-17** for **asia-southeast1 (Singapore)** and the
Gemini Enterprise Agent Platform. Token counts are **measured** from our own runs (BigQuery `bukti.events`), not
guessed. Monthly figures assume 730 hours.

> **Intro pricing ends soon.** Gemini 3.8 Flash and Flash TTS intro prices run to **2026-12-31**; Gemini 4 Argon's to
> **2026-11-30**. After that each doubles. On Agent Platform the discount arrives as 50% credit back on the 7th of the
> next month, so cash flow follows the standard price.

## 1. Model prices (USD per 1M tokens)

| Model | Used for | Input | Output | Notes |
|---|---|---|---|---|
| gemini-3.8-flash | notebook + statement reading, Officer Copilot | 0.75 | 3.75 | from 2027-01-01: 1.50 / 7.50 |
| gemini-4-argon | credit memo | 2.00 | 10.00 | from 2026-12-01: 4.00 / 20.00 |
| gemini-3.8-live | voice interview | audio 3.00 · text 0.75 | audio 12.00 · text 4.50 | non-global only; every turn re-bills the whole session context; 25 audio tokens/s |
| gemini-3.8-flash-tts | spoken guidance + outcome | 0.50 | 9.00 (audio) | ≈ $0.00225 per 10 s of speech |
| Model Armor | screening borrower text | $0.10 per 1M tokens | | **2M tokens/month free** |

An image at `MEDIA_RESOLUTION_HIGH` costs up to 1,120 tokens.

## 2. Gemini cost per application (measured)

| Step | Tokens (measured / modelled) | Cost |
|---|---|---|
| Read 2 notebook pages + 1 statement (Flash) | in ≈ 5,130 · out ≈ 4,580 (incl. bounding boxes) | **$0.021** |
| Voice interview, ~2 min, 6 turns (Live) | ≈ 7,200 audio-in (context re-billed) · 1,200 audio-out · 5,400 text-in | **≈ $0.042** |
| Credit memo (Argon) | in ≈ 3,000 · out ≈ 700 | **$0.013** |
| Spoken guidance + borrower explanation (TTS) | ≈ 1,200 audio tokens; repeats are cached by text | **≈ $0.010** |
| Model Armor | ≈ 2,000 tokens screened | **$0** (free tier) |
| **Full application** | | **≈ $0.09** |
| Each Officer Copilot question (Flash, ~5 calls with tool results) | in ≈ 20,000 · out ≈ 2,500 | **≈ $0.024** |

- **Uploaded pages** (real applications) are read with more thinking for accuracy: about +$0.02 per notebook page
  over a demo-pack page, plus ≈ $0.001 per page to classify it on upload.
- **Judge running a demo pack** (reads are pre-computed and bundled): ≈ **$0.07** with interview + memo, plus
  ≈ $0.024 per copilot question.
- After intro pricing ends: a full application rises to ≈ **$0.15**.
- The console's **Run log** and `bukti.events` show the actual cost of every application.

## 3. Infrastructure per month (always-on demo)

| Service | Configuration | Monthly |
|---|---|---|
| Cloud Run `bukti` | 2 vCPU · 2 GiB · 1 always-warm instance · instance-based billing (Tier 2: $0.0000216/vCPU-s, $0.0000024/GiB-s) | **≈ $121** (≈ $126 less free tier) |
| Cloud SQL Postgres (SonarQube DB) | db-f1-micro + 10 GiB SSD + backups | **≈ $13** |
| Cloud Run `bukti-sonarqube` | 3 vCPU · 6.5 GiB incl. proxy sidecar; scales to zero; ≈ $0.29/hour while up, ≈ 20 min per CI run | **≈ $5–10** (60 runs) |
| Firestore | applications + users; well inside the daily free tier at demo scale | ≈ $0 |
| BigQuery | benchmarks, events (streaming inserts ≈ 1 KB/row), log sink; inside the free query/storage tiers | < $1 |
| Cloud Logging | far below 50 GiB/month free | $0 |
| Artifact Registry | ≈ 0.5 GB per image; keep the last 10 | ≈ $0.5–3 |
| Cloud Storage | uploaded photos (Singapore has no always-free tier) | < $0.10 |
| Secret Manager | 2 secrets (inside the free 6 versions) | $0 |
| Cloud Build | inside 2,500 free minutes | $0 |
| Firebase Auth | Google sign-in | $0 |
| **Total** | | **≈ $140/month + Gemini usage** |

## 4. Scenarios

| Scenario | Infra | Gemini | Total |
|---|---|---|---|
| Judging window (19 Oct – 6 Nov, ~3 weeks), 300 judge demos with one copilot question each | ≈ $95 | ≈ $30 | **≈ $125** |
| Idle demo, one month | ≈ $140 | ≈ $0 | **≈ $140** |
| Pilot with a lender: 10,000 applications/month, 2 copilot questions each | ≈ $140 (scale to 2–3 instances: ≈ $250–360) | ≈ $1,400 (≈ $2,400 after intro pricing) | **≈ $1.6k–2.8k** — about **$0.16–0.28 per credit decision**, versus a field visit that costs more than the loan's margin |

## 5. Cost levers

1. **After the finale (4 Dec):** set `--min-instances 0` (≈ $121 → a few dollars; first request then cold-starts in
   ~10 s) or drop to 1 vCPU / 1 GiB (≈ $58).
2. **Artifact Registry cleanup policy** keeping the last 10 images.
3. **Stop or delete Cloud SQL** when SonarQube is not needed (≈ $13 → $0); the CI quality gate then skips itself.
4. **Context caching** for the copilot and memo system prompts (cached input is 10× cheaper).
5. **Batch API** (half price) for offline evaluation runs.
6. Set a **billing budget alert** (e.g. $200/month) on the billing account.
