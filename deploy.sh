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
for role in roles/aiplatform.user roles/datastore.user roles/bigquery.jobUser roles/bigquery.dataViewer roles/logging.logWriter; do
  gc projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$role" --condition=None >/dev/null
done

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

echo "==> Cloud Run"
gc run deploy "$SERVICE" --source . --region "$REGION" --service-account "$SA" \
  --allow-unauthenticated --min-instances 1 --max-instances 1 --cpu 2 --memory 2Gi \
  --concurrency 60 --timeout 900 --session-affinity --no-cpu-throttling \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT,BUKTI_BUCKET=$BUCKET,BUKTI_FIRESTORE=1,BUKTI_BIGQUERY=1,BUKTI_BQ_DATASET=$DATASET,BUKTI_LIVE_LOCATION=$LIVE_LOCATION"

URL=$(gc run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')
echo "==> Deployed: $URL"
curl -fsS "$URL/api/health" && echo
