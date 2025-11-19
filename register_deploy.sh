#!/bin/bash
set -euo pipefail

# -------------------------------------------------------
# 🌍 TravelMundo IA — Registro Automático de Deploy
# -------------------------------------------------------
# O que faz:
#  - Coleta metadados do deploy (version, build_id, revision, url, project_id, deployedBy)
#  - Envia para o endpoint /deploy-log do backend (Cloud Run)
#  - Tenta ser o mais "auto-descobrível" possível
# -------------------------------------------------------

# ===== Configs base (ajuste se necessário) =====
SERVICE="travelmundo-api-prod"
REGION="us-west1"
# Se você tem outro domínio/URL, troque abaixo:
API_URL="https://travelmundo-api-prod-448904673707.us-west1.run.app/deploy-log"

# ===== Descoberta automática =====
PROJECT_ID="$(gcloud config get-value project 2>/dev/null || echo '')"
ACCOUNT_EMAIL="$(gcloud config get-value account 2>/dev/null || echo '')"

# Última revisão pronta (ready)
REVISION="$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --format='value(status.latestReadyRevisionName)' 2>/dev/null || echo '')"

# URL pública do serviço
SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --format='value(status.url)' 2>/dev/null || echo '')"

# Último build do Cloud Build
BUILD_ID="$(gcloud builds list \
  --project="$PROJECT_ID" \
  --sort-by=~createTime --limit=1 \
  --format='value(id)' 2>/dev/null || echo '')"

# ===== Versão (argumento > arquivo > git) =====
# Uso: ./register_deploy.sh 3.8.1-Stable
if [[ "${1:-}" != "" ]]; then
  VERSION="$1"
elif [[ -f VERSION.txt ]]; then
  VERSION="$(cat VERSION.txt | tr -d '[:space:]')"
else
  # fallback: short commit
  if git rev-parse --short HEAD >/dev/null 2>&1; then
    VERSION="git-$(git rev-parse --short HEAD)"
  else
    VERSION="manual"
  fi
fi

# ===== Segurança básica e avisos =====
[[ -z "$PROJECT_ID" ]] && echo "⚠️  PROJECT_ID vazio (verifique 'gcloud config set project ...')" || true
[[ -z "$REVISION"   ]] && echo "⚠️  REVISION vazio (serviço pode não ter revisão pronta)" || true
[[ -z "$SERVICE_URL" ]] && echo "⚠️  SERVICE_URL vazio" || true
[[ -z "$BUILD_ID"   ]] && BUILD_ID="manual"

DEPLOY_BY="${ACCOUNT_EMAIL:-fabriciomalheiros@gmail.com}"

# ===== Log no terminal =====
echo "🧱 Registrando deploy no Firestore..."
echo "──────────────────────────────────────────────"
echo "📦 Versão:         $VERSION"
echo "👤 Deploy by:      $DEPLOY_BY"
echo "🏗️  Build ID:       $BUILD_ID"
echo "🧩 Revision:       $REVISION"
echo "🌐 Service URL:    $SERVICE_URL"
echo "🗃️  Project ID:     $PROJECT_ID"
echo "→ Endpoint POST:  $API_URL"
echo "──────────────────────────────────────────────"

# ===== Payload =====
PAYLOAD="$(jq -n \
  --arg version "$VERSION" \
  --arg deployedBy "$DEPLOY_BY" \
  --arg buildId "$BUILD_ID" \
  --arg revision "$REVISION" \
  --arg serviceUrl "$SERVICE_URL" \
  --arg projectId "$PROJECT_ID" \
  '{
    version: $version,
    deployedBy: $deployedBy,
    buildId: $buildId,
    revision: $revision,
    serviceUrl: $serviceUrl,
    projectId: $projectId
  }'
)"

# Se não tiver jq instalado no Cloud Shell (geralmente tem), gera manualmente
if [[ -z "${PAYLOAD}" ]]; then
  PAYLOAD="{\"version\":\"$VERSION\",\"deployedBy\":\"$DEPLOY_BY\",\"buildId\":\"$BUILD_ID\",\"revision\":\"$REVISION\",\"serviceUrl\":\"$SERVICE_URL\",\"projectId\":\"$PROJECT_ID\"}"
fi

# ===== Disparo com retry =====
set +e
HTTP_RES=$(curl -sS -w "HTTPSTATUS:%{http_code}" -o /tmp/deploy_log_res.json \
  -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  --retry 3 --retry-connrefused --max-time 20 \
  -d "$PAYLOAD")
STATUS="${HTTP_RES##*HTTPSTATUS:}"
set -e

echo "📨 Resposta HTTP: $STATUS"
if [[ "$STATUS" == "200" || "$STATUS" == "201" ]]; then
  echo "✅ Deploy registrado com sucesso!"
  echo "📝 Corpo:"
  cat /tmp/deploy_log_res.json
  echo
else
  echo "❌ Falha ao registrar deploy. Corpo de resposta:"
  cat /tmp/deploy_log_res.json || true
  echo
  exit 1
fi
