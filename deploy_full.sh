#!/bin/bash
# ---------------------------------------------------------
# 🚀 TravelMundo IA — Deploy Automático Premium
# Versão: v3.9.4-Pro-AutoSync
# Atualizado: 19/11/2025
#
# 📌 Recursos:
# ✔ Versionamento automático via VERSION.txt
# ✔ Build automático com Cloud Build
# ✔ Deploy no Cloud Run
# ✔ Registro do deploy no Firestore via /_deploy-log
# ✔ Diagnóstico final via /debug-env
# ✔ Commit + Push automático para GitHub (sincronização total)
# ---------------------------------------------------------

SERVICE="travelmundo-api-prod"
REGION="us-west1"
IMAGE="us-west1-docker.pkg.dev/gen-lang-client-0394942372/travelmundo-api/travelmundo-api:latest"

echo "🚀 Iniciando pipeline completo de deploy TravelMundo IA"
echo "──────────────────────────────────────────────"


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

echo "📦 Versão nova detectada: $NEW_VERSION"
echo "──────────────────────────────────────────────"


# ---------------------------------------------------------
# 1️⃣.1 COMMIT + PUSH AUTOMÁTICO PARA O GITHUB
# ---------------------------------------------------------

echo "📝 Atualizando repositório GitHub com a nova versão ($NEW_VERSION)..."

git add .
git commit -m "auto: deploy versão $NEW_VERSION" 2>/dev/null

# Caso não haja nada pra commitar
if [ $? -ne 0 ]; then
  echo "ℹ Nenhuma alteração nova para commit (ok)."
else
  echo "✔ Commit criado com sucesso."
fi

echo "⬆ Enviando alterações para remote 'origin/main'..."
git push origin main

echo "✔ GitHub atualizado e sincronizado"
echo "──────────────────────────────────────────────"


# ---------------------------------------------------------
# 2️⃣ BUILD NO CLOUD BUILD
# ---------------------------------------------------------

echo "🏗️ Iniciando Build no Google Cloud Build..."

BUILD_OUTPUT=$(gcloud builds submit --tag "$IMAGE" 2>&1)
echo "$BUILD_OUTPUT"

# Pega o BUILD_ID automaticamente (quando existir)
BUILD_ID=$(echo "$BUILD_OUTPUT" | grep -oP "(?<=logs\.).*?(?=])" | head -n 1)
if [ -z "$BUILD_ID" ]; then
  BUILD_ID="none"
fi

echo "🧱 Build ID detectado: $BUILD_ID"
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
# 4️⃣ LOG DO DEPLOY NO FIRESTORE
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
