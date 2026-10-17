#!/usr/bin/env bash
# Deploy SonarQube (Cloud Run + Cloud SQL Postgres via Auth Proxy sidecar) and wire it into GitHub Actions.
# Idempotent. Scales to zero when idle; CI wakes it before scanning.
set -euo pipefail

export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-$HOME/.config/gcloud-bukti}"
PROJECT="${PROJECT:-bukti-ai}"
REGION="${REGION:-asia-southeast1}"
DB_INSTANCE="bukti-sonar-db"
INSTANCE="${PROJECT}:${REGION}:${DB_INSTANCE}"
SA="bukti-sonar@${PROJECT}.iam.gserviceaccount.com"
TAG="26.10.0.133078"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/bukti/sonarqube:${TAG}"
REPO="${REPO:-AgentsBakery/Bukti}"
HERE="$(cd "$(dirname "$0")" && pwd)"
gc() { gcloud --project "$PROJECT" --quiet "$@"; }
rand() { python3 -c 'import secrets; print(secrets.token_urlsafe(24))'; }
# SonarQube requires upper, lower, digit and a special character.
admin_pw() { python3 -c 'import secrets; print(secrets.token_urlsafe(20) + "Aa9#")'; }

echo "==> Database and user"
gc sql databases describe sonarqube --instance "$DB_INSTANCE" >/dev/null 2>&1 || gc sql databases create sonarqube --instance "$DB_INSTANCE"
if ! gc secrets describe sonar-db-password >/dev/null 2>&1; then
  pw=$(rand)
  printf '%s' "$pw" | gc secrets create sonar-db-password --replication-policy=user-managed --locations="$REGION" --data-file=-
  gc sql users create sonar --instance "$DB_INSTANCE" --password "$pw" >/dev/null
fi

echo "==> Service account (Cloud SQL client + read its own DB secret only)"
gc iam service-accounts describe "$SA" >/dev/null 2>&1 || gc iam service-accounts create bukti-sonar --display-name "SonarQube on Cloud Run"
gc projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/cloudsql.client --condition=None >/dev/null
gc secrets add-iam-policy-binding sonar-db-password --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor >/dev/null

echo "==> Image"
gc builds submit "$HERE" --tag "$IMAGE" --region "$REGION" >/dev/null

echo "==> Cloud Run"
export PROJECT IMAGE INSTANCE
envsubst < "$HERE/service.yaml" > /tmp/bukti-sonarqube-service.yaml
gc run services replace /tmp/bukti-sonarqube-service.yaml --region "$REGION" >/dev/null
URL=$(gc run services describe bukti-sonarqube --region "$REGION" --format 'value(status.url)')
echo "    $URL"

echo "==> Wait for SonarQube to report UP"
for _ in $(seq 1 60); do
  status=$(curl -fsS "$URL/api/system/status" 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])' 2>/dev/null || true)
  [[ "$status" == "UP" ]] && break
  sleep 10
done
[[ "$status" == "UP" ]] || { echo "SonarQube did not come up (status: ${status:-none})"; exit 1; }

echo "==> Admin password, project, CI token"
if ! gc secrets describe sonar-admin-password >/dev/null 2>&1; then
  admin=$(admin_pw)
  factory="admin"  # SonarQube's public factory default, replaced immediately below
  curl -fsS --user "admin:${factory}" -X POST "$URL/api/users/change_password" \
    --data-urlencode "login=admin" --data-urlencode "previousPassword=${factory}" --data-urlencode "password=$admin"
  printf '%s' "$admin" | gc secrets create sonar-admin-password --replication-policy=user-managed --locations="$REGION" --data-file=-
fi
admin=$(gc secrets versions access latest --secret sonar-admin-password)
curl -fsS -u "admin:$admin" -X POST "$URL/api/projects/create" -d "project=bukti" -d "name=Bukti" >/dev/null 2>&1 || true
curl -fsS -u "admin:$admin" -X POST "$URL/api/user_tokens/revoke" -d "name=github-actions" >/dev/null 2>&1 || true
token=$(curl -fsS -u "admin:$admin" -X POST "$URL/api/user_tokens/generate" -d "name=github-actions" \
  -d "type=PROJECT_ANALYSIS_TOKEN" -d "projectKey=bukti" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

echo "==> GitHub: SONAR_TOKEN secret + SONAR_HOST_URL variable"
printf '%s' "$token" | gh secret set SONAR_TOKEN -R "$REPO"
gh variable set SONAR_HOST_URL -R "$REPO" -b "$URL"
echo "Done. Admin password is in Secret Manager (sonar-admin-password)."
