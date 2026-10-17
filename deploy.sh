#!/usr/bin/env bash
# Provision and deploy Bukti to Cloud Run. Idempotent: safe to re-run.
# Usage: ./deploy.sh [infra]    (infra = provision only; uses gcloud config in $CLOUDSDK_CONFIG, default ~/.config/gcloud-bukti)
set -euo pipefail

export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-$HOME/.config/gcloud-bukti}"
PROJECT="${PROJECT:-bukti-ai}"
REGION="${REGION:-asia-southeast1}"
SERVICE="${SERVICE:-bukti}"
SA_NAME="bukti-run"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
BUCKET="${BUCKET:-${PROJECT}-evidence}"
DATASET="bukti"
LIVE_LOCATION="${LIVE_LOCATION:-us-central1}"

gc() { gcloud --project "$PROJECT" --quiet "$@"; }

echo "==> APIs"
gc services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com firestore.googleapis.com bigquery.googleapis.com storage.googleapis.com \
  modelarmor.googleapis.com logging.googleapis.com

echo "==> Service account (least privilege)"
gc iam service-accounts describe "$SA" >/dev/null 2>&1 || gc iam service-accounts create "$SA_NAME" --display-name "Bukti Cloud Run"
for role in roles/aiplatform.user roles/datastore.user roles/bigquery.jobUser roles/bigquery.dataViewer roles/logging.logWriter roles/modelarmor.user; do
  gc projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$role" --condition=None >/dev/null
done

echo "==> Cloud Build service account (source deploys build as the default compute SA)"
PROJECT_NUMBER=$(gc projects describe "$PROJECT" --format 'value(projectNumber)')
gc projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role roles/cloudbuild.builds.builder --condition=None >/dev/null

echo "==> Firestore (native mode)"
gc firestore databases describe --database='(default)' >/dev/null 2>&1 || gc firestore databases create --location="$REGION" --type=firestore-native

echo "==> Evidence bucket"
gcloud storage buckets describe "gs://$BUCKET" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://$BUCKET" --project "$PROJECT" --location "$REGION" --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --project "$PROJECT" \
  --member "serviceAccount:$SA" --role roles/storage.objectAdmin >/dev/null

echo "==> BigQuery peer benchmarks"
bq --project_id "$PROJECT" --location "$REGION" show "$DATASET" >/dev/null 2>&1 || bq --project_id "$PROJECT" --location "$REGION" mk -d "$DATASET"
bq --project_id "$PROJECT" --location "$REGION" load --replace --source_format=CSV --skip_leading_rows=1 \
  "$DATASET.peer_benchmarks" data/benchmarks/peer_benchmarks.csv \
  market:STRING,sector:STRING,region:STRING,median_daily_sales:INT64,share_p25:FLOAT64,share_p75:FLOAT64,n_shops:INT64,source:STRING

if [[ "${1:-}" == "infra" ]]; then echo "==> Infra ready (skipping Cloud Run deploy)"; exit 0; fi

echo "==> Model Armor template (prompt-injection and safety screen for borrower-written text)"
TOKEN=$(gcloud auth print-access-token)
curl -fsS -o /dev/null -X POST \
  "https://modelarmor.${REGION}.rep.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/templates?templateId=bukti-shield" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"filterConfig":{"piAndJailbreakFilterSettings":{"filterEnforcement":"ENABLED","confidenceLevel":"LOW_AND_ABOVE"},"raiSettings":{"raiFilters":[{"filterType":"HATE_SPEECH","confidenceLevel":"MEDIUM_AND_ABOVE"},{"filterType":"HARASSMENT","confidenceLevel":"MEDIUM_AND_ABOVE"},{"filterType":"DANGEROUS","confidenceLevel":"MEDIUM_AND_ABOVE"},{"filterType":"SEXUALLY_EXPLICIT","confidenceLevel":"MEDIUM_AND_ABOVE"}]}}}' \
  || echo "   (template already exists)"

echo "==> Events table + log sink (BigQuery)"
bq --project_id "$PROJECT" --location "$REGION" show "$DATASET.events" >/dev/null 2>&1 || \
  bq --project_id "$PROJECT" --location "$REGION" mk --table --time_partitioning_field ts --time_partitioning_type DAY \
    --clustering_fields type,app_id "$DATASET.events" data/benchmarks/events_schema.json
bq --project_id "$PROJECT" --location "$REGION" show bukti_logs >/dev/null 2>&1 || \
  bq --project_id "$PROJECT" --location "$REGION" mk -d bukti_logs
gc logging sinks describe bukti-logs-to-bq >/dev/null 2>&1 || gc logging sinks create bukti-logs-to-bq \
  "bigquery.googleapis.com/projects/$PROJECT/datasets/bukti_logs" --use-partitioned-tables \
  --log-filter="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$SERVICE\""
echo "    (grant the sink writer identity WRITER on bukti_logs and the runtime SA WRITER on $DATASET; see docs/OPERATIONS.md)"

echo "==> Cloud Run"
gc run deploy "$SERVICE" --source . --region "$REGION" --service-account "$SA" \
  --no-invoker-iam-check --min-instances 1 --max-instances 1 --cpu 2 --memory 2Gi \
  --concurrency 60 --timeout 900 --session-affinity --no-cpu-throttling \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT,BUKTI_BUCKET=$BUCKET,BUKTI_FIRESTORE=1,BUKTI_BIGQUERY=1,BUKTI_BQ_DATASET=$DATASET,BUKTI_LIVE_LOCATION=$LIVE_LOCATION"

URL=$(gc run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')
echo "==> Deployed: $URL"
curl -fsS "$URL/api/health" && echo
