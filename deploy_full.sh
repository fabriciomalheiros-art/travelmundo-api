#!/bin/bash

# =========================================================
# 🚀 TravelMundo IA — Ultra Premium CI/CD Pipeline
# Versão: v4.0.0
# Autor: Fabricio & ChatGPT — Engenharia Conjunta
# =========================================================

# 🟦 CORES
BLUE="\033[1;34m"
GREEN="\033[1;32m"
RED="\033[1;31m"
YELLOW="\033[1;33m"
CYAN="\033[1;36m"
RESET="\033[0m"

# 🌀 ANIMAÇÃO (loading)
loading() {
  local msg=$1
  local i=0
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

  tput civis
  while kill -0 $! 2>/dev/null; do
    printf "\r${CYAN}${spin:i++%${#spin}:1}${RESET} %s" "$msg"
    sleep 0.12
  done
  tput cnorm
  printf "\r${GREEN}✔${RESET} %s\n" "$msg"
}

# 🟦 CONFIGURAÇÃO
SERVICE="travelmundo-api-prod"
REGION="us-west1"
PROJECT="gen-lang-client-0394942372"
IMAGE="us-west1-docker.pkg.dev/$PROJECT/travelmundo-api/travelmundo-api:latest"
SERVICE_URL="https://$SERVICE-448904673707.$REGION.run.app"

echo -e "${BLUE}🚀 Iniciando Ultra Deploy TravelMundo IA — v4.0${RESET}"
echo "──────────────────────────────────────────────"

# =========================================================
# 0️⃣ CHECAR PROJETO
# =========================================================
echo -e "${YELLOW}🧭 Verificando projeto ativo...${RESET}"
gcloud config set project $PROJECT >/dev/null 2>&1 &
loading "Projeto configurado: $PROJECT"

# =========================================================
# 1️⃣ VALIDAR SECRETS
# =========================================================
echo -e "${YELLOW}🔐 Validando secrets...${RESET}"

if ! gcloud secrets describe firebase-service-account >/dev/null 2>&1; then
  echo -e "${RED}❌ ERRO: Secret firebase-service-account NÃO existe!${RESET}"
  exit 1
fi

if ! gcloud secrets describe HOTMART_SECRET >/dev/null 2>&1; then
  echo -e "${RED}❌ ERRO: Secret HOTMART_SECRET NÃO existe!${RESET}"
  exit 1
fi

echo -e "${GREEN}✔ Secrets OK${RESET}"

# =========================================================
# 2️⃣ VERSIONAMENTO AUTOMÁTICO
# =========================================================
echo -e "${YELLOW}📦 Atualizando versão...${RESET}"

if [ ! -f VERSION.txt ]; then
  echo "4.0.0" > VERSION.txt
fi

CURRENT_VERSION=$(cat VERSION.txt)
IFS='.' read -r MAJ MIN PATCH <<< "$CURRENT_VERSION"
NEXT_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJ.$MIN.$NEXT_PATCH"
echo "$NEW_VERSION" > VERSION.txt

echo -e "${GREEN}✔ Nova versão: $NEW_VERSION${RESET}"

# =========================================================
# 3️⃣ GIT — PUSH AUTOMÁTICO
# =========================================================
echo -e "${YELLOW}⬆ Enviando commit para GitHub...${RESET}"

git add .
git commit -m "auto: deploy versão $NEW_VERSION" 2>/dev/null
git push origin main &
loading "Código sincronizado com GitHub"

# =========================================================
# 4️⃣ BUILD + ROLLBACK AUTOMÁTICO
# =========================================================
echo -e "${YELLOW}🏗️ Iniciando Cloud Build...${RESET}"

set -e
BUILD_OUTPUT=$(gcloud builds submit --tag "$IMAGE" --format=json) || {
  echo -e "${RED}❌ BUILD FALHOU — ROLLBACK ATIVADO${RESET}"
  git reset --hard HEAD~1
  exit 1
}

BUILD_ID=$(echo "$BUILD_OUTPUT" | grep -oP '"id":\s*"\K[^"]+')
echo -e "${GREEN}✔ BUILD_ID: $BUILD_ID${RESET}"

# =========================================================
# 5️⃣ DEPLOY + ROLLBACK EM CASO DE FALHA
# =========================================================
echo -e "${YELLOW}☁️ Realizando deploy...${RESET}"

if ! gcloud run deploy "$SERVICE" \
    --image "$IMAGE" \
    --region "$REGION" \
    --allow-unauthenticated >/dev/null 2>&1; then
  echo -e "${RED}❌ DEPLOY FALHOU — ROLLBACK DA IMAGEM${RESET}"
  gcloud container images delete "$IMAGE" --quiet
  exit 1
fi

echo -e "${GREEN}✔ Deploy concluído${RESET}"

# =========================================================
# 6️⃣ REGISTRO NO FIRESTORE
# =========================================================
echo -e "${YELLOW}🧩 Registrando deploy no Firestore...${RESET}"

DEPLOY_BY=$(git config user.email)

curl -s -X POST "$SERVICE_URL/_deploy-log" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"$NEW_VERSION\",\"buildId\":\"$BUILD_ID\",\"deployBy\":\"$DEPLOY_BY\"}" >/dev/null

echo -e "${GREEN}✔ Registro salvo no Firestore${RESET}"

# =========================================================
# 7️⃣ DIAGNÓSTICO FINAL
# =========================================================
echo -e "${YELLOW}🔍 Diagnóstico /debug-env...${RESET}"
curl -s "$SERVICE_URL/debug-env"
echo ""

# =========================================================
# 8️⃣ FINAL CINEMATOGRÁFICO
# =========================================================
echo -e "
${BLUE}═══════════════════════════════════════════════
🎉 DEPLOY COMPLETO — TravelMundo IA v$NEW_VERSION
🧱 Build ID: $BUILD_ID
☁️ Cloud Run: $SERVICE
🌍 URL: $SERVICE_URL
═══════════════════════════════════════════════${RESET}
"
