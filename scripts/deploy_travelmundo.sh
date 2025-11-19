#!/bin/bash
set -e

echo "🚀 Iniciando processo completo de build, deploy e verificação do TravelMundo API..."
cd ~/travelmundo-api

PROJECT_ID="gen-lang-client-0394942372"
REGION="us-west1"
SERVICE_NAME="travelmundo-api-prod"
IMAGE="us-west1-docker.pkg.dev/${PROJECT_ID}/travelmundo-api/travelmundo-api:latest"
SERVICE_ACCOUNT="${SERVICE_NAME}-sa@${PROJECT_ID}.iam.gserviceaccount.com"
SECRET_NAME="firebase-service-account"
HOTMART_SECRET="y4GJWDRbL1IXEOwXRwWN2G0GyQKkPJ22417386"

echo "📁 Diretório atual: $(pwd)"
echo "✅ Dockerfile encontrado."

# 🔧 Build da imagem
echo "🏗️ Iniciando build no Cloud Build..."
gcloud builds submit . \
  --tag ${IMAGE} \
  --project=${PROJECT_ID}

echo "✅ Build concluído com sucesso!"

# 🚢 Deploy no Cloud Run
echo "🚢 Fazendo deploy para Cloud Run (${SERVICE_NAME})..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE} \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --service-account ${SERVICE_ACCOUNT} \
  --memory 512Mi \
  --cpu 1 \
  --port 8080 \
  --timeout 300s \
  --set-env-vars NODE_ENV=production,HOTMART_SECRET=${HOTMART_SECRET},GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase-service-account/service-account.json \
  --set-secrets FIREBASE_SERVICE_ACCOUNT_JSON=${SECRET_NAME}:latest \
  --project=${PROJECT_ID}

echo "✅ Deploy concluído com sucesso!"

URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='value(status.url)')
echo "🌐 URL do serviço: ${URL}"

echo "⏳ Aguardando propagação..."
sleep 20

echo "🧠 Testando /debug-env..."
curl -s ${URL}/debug-env | jq . || true

