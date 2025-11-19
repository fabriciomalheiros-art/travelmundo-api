#!/bin/bash
echo "🩺 Verificando status geral da TravelMundo API..."
SERVICE="travelmundo-api-prod"
REGION="us-west1"

echo "──────────────────────────────────────────────"
echo "🌐 Checando endpoint de diagnóstico..."
curl -s "https://travelmundo-api-prod-448904673707.us-west1.run.app/debug-env" | jq .

echo "──────────────────────────────────────────────"
echo "🧠 Testando conexão com Firestore..."
curl -s "https://travelmundo-api-prod-448904673707.us-west1.run.app/test-firebase" | jq .

echo "──────────────────────────────────────────────"
echo "🧾 Listando revisões recentes..."
gcloud run revisions list --service=$SERVICE --region=$REGION --limit=3 --format="table(name,serviceName,createTime,status.conditions[0].type)"
echo "──────────────────────────────────────────────"
echo "✅ Diagnóstico concluído."
