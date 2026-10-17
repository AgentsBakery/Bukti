# Bukti — operations runbook

Project `bukti-ai` · region `asia-southeast1` · gcloud config dir `~/.config/gcloud-bukti`
(`export CLOUDSDK_CONFIG=$HOME/.config/gcloud-bukti`).

## Deploy

- **Normal path:** push to `main` → GitHub Actions gates → deploy by digest → smoke test → automatic rollback.
- **Manual / first time:** `./deploy.sh` (idempotent; `./deploy.sh infra` provisions without deploying).
- **Rollback:** `gcloud run services update-traffic bukti --region asia-southeast1 --to-revisions <rev>=100`.

## Google sign-in (Firebase Auth)

One-time console steps (the Firebase terms must be accepted in the console):

1. https://console.firebase.google.com → *Add Firebase to an existing Google Cloud project* → `bukti-ai`.
2. *Build → Authentication → Get started → Sign-in method → Google → Enable* (support email) → *Save*.

Then (scripted by Claude once step 2 is done): create the Firebase web app, add the Cloud Run domain to
*Authorized domains*, and set `BUKTI_FIREBASE_API_KEY` / `BUKTI_FIREBASE_APP_ID` on the service. These are public
web-config values, not secrets. Until they are set, `/api/auth/config` returns `enabled:false` and the app shows
guest access only.

## Data stores

| Store | What | Access |
|---|---|---|
| Firestore `applications` | One document per application | runtime SA |
| Firestore `users` | One document per signed-in user | runtime SA |
| BigQuery `bukti.peer_benchmarks` | Peer bands for reconciliation | runtime SA (read) |
| BigQuery `bukti.events` | Typed events: agents, models, tools, guardrails, decisions, sign-ins | runtime SA (dataset WRITER) |
| BigQuery `bukti_logs.*` | Every log line (Cloud Logging sink `bukti-logs-to-bq`) | sink writer identity (dataset WRITER) |
| GCS `bukti-ai-evidence` | Uploaded photos | runtime SA (bucket objectAdmin) |

## SonarQube

- URL: `https://bukti-sonarqube-lgmfuzrnzq-as.a.run.app` (scales to zero; first load takes ~2 minutes).
- Admin password: `gcloud secrets versions access latest --secret sonar-admin-password`.
- Re-deploy / rotate CI token: `./infra/sonarqube/deploy-sonarqube.sh`.
- Quality gate "Bukti": new code must keep reliability, security and maintainability at A.
- Turn it off: `gcloud sql instances patch bukti-sonar-db --activation-policy NEVER` and delete the
  `SONAR_HOST_URL` repository variable (the CI job then skips).

## Model and region facts (see GUARDRAILS.md)

- Flash, Argon and TTS: `global` endpoint only. Live: `us-central1` only. Model Armor template: `asia-southeast1`
  (no malicious-URI filter there).
- Probe a model before changing an id:
  `python -c "from google import genai; print(genai.Client(enterprise=True, project='bukti-ai', location='global').models.generate_content(model='<id>', contents='ok').text)"`

## Costs

See [COSTS.md](COSTS.md). After the finale: `gcloud run services update bukti --region asia-southeast1 --min-instances 0`.
