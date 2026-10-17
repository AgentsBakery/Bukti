# Bukti — how to test

Live URL: **https://bukti-474706728997.asia-southeast1.run.app** (no login needed).

## 1. Manual test script (10 minutes, any laptop; phone for the borrower view)

| # | Do | Expect |
|---|---|---|
| 1 | Open the URL | Ink & Paper landing; three cards: *Be Ibu Sari*, *Be Murugan*, *Watch a fake ledger get caught* |
| 2 | Click **Be Ibu Sari** (desktop) | Demo mode: phone on the left, officer console on the right, same application |
| 3 | Phone: choose **Bahasa Indonesia** → **Lanjut** → **Baca buku saya** | Ink scan line; numbers lift off the page into the digital ledger; QRIS days stamp *cocok*; the console's ledger fills in alongside |
| 4 | Phone: **Cerita** → allow the microphone → answer in Bahasa (or English) | The interviewer greets Ibu Sari, asks about the shop, then asks why week 2 is quieter (from her notebook); fact stamps appear; it thanks her and ends |
| 5 | Phone: **Hasil** | Calm progress, then “Ibu Sari, Anda bisa meminjam Rp 2.700.000”; coin calendar with smaller coins mid-month; **Dengarkan** plays the explanation in Bahasa |
| 6 | Console: click a reason in the memo | The cited lines light up on the notebook photo; click a highlight → the ledger row |
| 7 | Console: **Officer Copilot** → “Why are sales lower in week 2?” | Tool chips (*reading checks*, *comparing with QRIS*); week-2 lines highlighted; answer with cited ids |
| 8 | Console: **Run log** | Agent steps, model calls with latency, tokens and estimated cost; totals |
| 9 | Console: **Approve** (A, then Enter) | Phone shows *DISETUJUI*; audit trail records the decision (with your name if signed in) |
| 10 | Back to landing → **Watch a fake ledger get caught** (Ibu Rina) | Red stamps: notebook vs QRIS, daily rhythm, idle-day sales, round numbers, too-regular entries, **Hidden instructions (Model Armor)**; decision *refer*; borrower sees a respectful “your officer will review” |
| 11 | **Be Murugan** | Same flow in Tamil (UPI, ₹25,500) |
| 12 | `/login` → **Continue with Google** (once Firebase is enabled) | Popup sign-in; your avatar in the header; decisions carry your name; `users/{uid}` created in Firestore |

## 2. Automated tests

```bash
uv run pytest -q
```

- `tests/test_analysis.py` — the rules separate all 8 packs correctly on ground truth (genuine → approve, inflated →
  reduced, fabricated → refer) and the repayment schedule follows the shop's month.
- `tests/test_api.py` — security headers, docs disabled, per-IP rate limiting, upload validation, the extract stream.

## 3. End-to-end evaluation (real models)

```bash
GOOGLE_CLOUD_PROJECT=bukti-ai uv run uvicorn app.main:app --port 8080
uv run python eval/run_eval.py --base http://localhost:8080 --force
```

Writes `eval/results/results.md`: line-level extraction accuracy against ground truth, decision accuracy, seconds
from evidence to decision. Baseline on the generated placeholder pages: 290/290 lines, 8/8 decisions. Re-run after
the team's handwritten photos are added to `data/packs/<id>/photos/`.

## 4. Voice interview without a microphone

```bash
PYTHONPATH=. uv run python eval/interview_smoke.py --base wss://bukti-474706728997.asia-southeast1.run.app \
  --app <application id> --lang id     # or --lang ta
```

Speaks synthetic borrower answers (Gemini TTS) into the interview WebSocket and prints the transcript and recorded
facts.

## 5. Copilot from the command line

```bash
curl -N -X POST "$URL/api/applications/<id>/copilot" -H 'content-type: application/json' \
  -d '{"question":"Which days do not match the QRIS records?"}'
```

## 6. Security checks locally (same as CI)

```bash
uvx ruff check app agents eval tests --select E,F,W,B,S,UP --ignore E501,S101,S311,B008,UP017
uvx bandit -q -r app agents -ll
uvx pip-audit -r <(uv export --frozen --no-dev --no-hashes --no-emit-project)
(cd web && npm audit --omit=dev --audit-level=high)
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.30.0 git /repo --redact
docker run --rm -v "$PWD:/src" semgrep/semgrep:1.160.0 semgrep scan --metrics=off --config p/python --config p/typescript --error
docker build -t bukti:scan . && docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.70.0 image --severity HIGH,CRITICAL --ignore-unfixed bukti:scan
```

## 7. Checking the logs and tables

```bash
bq query --nouse_legacy_sql 'SELECT type, COUNT(*), ROUND(SUM(cost_usd),4) FROM `bukti-ai.bukti.events` GROUP BY type'
bq ls bukti_logs        # Cloud Logging sink tables
```

Firestore: `applications/{id}` and `users/{uid}` in the Firebase or Cloud console.
