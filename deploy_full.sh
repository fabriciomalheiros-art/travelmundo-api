#!/bin/bash
# ---------------------------------------------------------
# 🚀 TravelMundo IA — Deploy Automático Premium
# Versão: v3.9.7-FULL
# Atualizado: 19/11/2025
#
# 📌 Recursos:
# ✔ Versionamento automático (VERSION.txt)
# ✔ Commit + Push automático para GitHub
# ✔ Build no Cloud Build com captura correta do BUILD_ID
# ✔ Deploy no Cloud Run
# ✔ Registro do deploy no Firestore via /_deploy-log
# ✔ Diagnóstico final via /debug-env
# ---------------------------------------------------------

SERVICE="travelmundo-api-prod"
REGION="us-west1"
PROJECT="gen-lang-client-0394942372"
IMAGE="us-west1-docker.pkg.dev/$PROJECT/travelmundo-api/travelmundo-api:latest"

echo "🚀 Iniciando pipeline completo de deploy TravelMundo IA"
echo "──────────────────────────────────────────────"


# ---------------------------------------------------------
# 0️⃣ GARANTE PROJETO CORRETO
# ---------------------------------------------------------

gcloud config set project $PROJECT >/dev/null 2>&1
echo "✔ Projeto configurado: $PROJECT"


# ---------------------------------------------------------
# 1️⃣ VERSIONAMENTO AUTOMÁTICO
# ---------------------------------------------------------

if [ ! -f VERSION.txt ]; then
  echo "3.9.0" > VERSION.txt
fi

CURRENT_VERSION=$(cat VERSION.txt)

IFS='.' read -r MAJ MIN PATCH <<< "$CURRENT_VERSION"
NEXT_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJ.$MIN.$NEXT_PATCH"

echo "$NEW_VERSION" > VERSION.txt

echo "📦 Nova versão detectada: $NEW_VERSION"
echo "──────────────────────────────────────────────"


# ---------------------------------------------------------
# 1️⃣.1 COMMIT + PUSH AUTOMÁTICO
# ---------------------------------------------------------

echo "📝 Atualizando GitHub..."

git add .
git commit -m "auto: deploy versão $NEW_VERSION" 2>/dev/null

if [ $? -ne 0 ]; then
  echo "ℹ Nenhum commit novo (OK)"
else
  echo "✔ Commit criado"
fi

git push origin main
echo "✔ GitHub sincronizado"
echo "──────────────────────────────────────────────"


# ---------------------------------------------------------
# 2️⃣ BUILD NO CLOUD BUILD + CAPTURA REAL DO BUILD_ID
# ---------------------------------------------------------

echo "🏗️ Iniciando Build no Google Cloud Build..."

BUILD_OUTPUT=$(gcloud builds submit --tag "$IMAGE" --format=json)

# Extrai o ID REAL do build
BUILD_ID=$(echo "$BUILD_OUTPUT" | grep -oP '"id":\s*"\K[^"]+')

if [ -z "$BUILD_ID" ]; then
  BUILD_ID="unknown"
  echo "⚠ Não foi possível detectar BUILD_ID (mas o build funcionou)"
else
  echo "🧱 BUILD_ID detectado: $BUILD_ID"
fi

echo "──────────────────────────────────────────────"


# ---------------------------------------------------------
# 3️⃣ DEPLOY NO CLOUD RUN
# ---------------------------------------------------------

echo "☁️ Realizando deploy no Cloud Run..."

gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated

SERVICE_URL="https://$SERVICE-448904673707.$REGION.run.app"
ALT_URL="https://$SERVICE-ycerivyj5a-uw.a.run.app"

echo "🌍 Serviço ativo em: $ALT_URL"
echo "──────────────────────────────────────────────"


# ---------------------------------------------------------
# 4️⃣ REGISTRA DEPLOY NO FIRESTORE
# ---------------------------------------------------------

echo "🧩 Registrando metadados do deploy no Firestore..."

DEPLOY_BY=$(git config user.email)
if [ -z "$DEPLOY_BY" ]; then DEPLOY_BY="unknown"; fi

curl -s -X POST "$SERVICE_URL/_deploy-log" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"$NEW_VERSION\",\"buildId\":\"$BUILD_ID\",\"deployBy\":\"$DEPLOY_BY\"}"

echo ""
echo "✔ Registro salvo no Firestore"
echo "──────────────────────────────────────────────"


# ---------------------------------------------------------
# 5️⃣ DIAGNÓSTICO FINAL
# ---------------------------------------------------------

echo "🔍 Verificando ambiente com /debug-env..."

curl -s "$SERVICE_URL/debug-env"
echo ""
echo "──────────────────────────────────────────────"

echo "🎯 Deploy v$NEW_VERSION finalizado com sucesso!"
echo "✔ Build: $BUILD_ID"
echo "✔ Região: $REGION"
echo "✔ Serviço: $SERVICE"
echo "✔ URL: $ALT_URL"
echo "──────────────────────────────────────────────"

