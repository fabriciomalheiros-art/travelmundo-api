#!/bin/bash
# 🧩 TravelMundo API — Log Viewer Automático v1.4 (Stable)
# ---------------------------------------------------------
# Uso:
#   ./check_logs.sh             → mostra logs normais
#   ./check_logs.sh --errors    → mostra apenas erros
#   ./check_logs.sh --summary   → resumo de status + erros

SERVICE="travelmundo-api-prod"
REGION="us-west1"
PROJECT="gen-lang-client-0394942372"
LIMIT=40

echo "🔍 Buscando revisão ativa do serviço '$SERVICE'..."
REVISION=$(gcloud run revisions list --region=$REGION --service=$SERVICE --format="value(METADATA.name)" | head -n 1)
if [ -z "$REVISION" ]; then
  echo "❌ Nenhuma revisão encontrada. Verifique se o serviço existe."
  exit 1
fi
echo "✅ Revisão ativa: $REVISION"
echo "──────────────────────────────────────────────"

# Detecta erro e faz fallback automático
run_logs() {
  CMD="gcloud beta run revisions logs read \"$REVISION\" --region=$REGION --limit=$LIMIT --project=$PROJECT --format='value(textPayload)'"
  OUTPUT=$(eval $CMD 2>&1)
  if echo "$OUTPUT" | grep -q "TypeError"; then
    echo "⚠️  Recurso revisions.logs falhou — usando fallback para services.logs..."
    OUTPUT=$(gcloud beta run services logs read "$SERVICE" \
      --region=$REGION --limit=$LIMIT --project=$PROJECT --format="value(textPayload)" 2>/dev/null)
  fi
  echo "$OUTPUT"
}

if [[ "$1" == "--errors" ]]; then
  echo "🚨 Modo diagnóstico ativado — filtrando erros..."
  echo "──────────────────────────────────────────────"
  run_logs | grep -E "Error|ERROR|500|Firebase não configurado|ERR_|unauthorized" \
  | sed -E \
      -e 's/(Error|ERROR|500|ERR_)/\x1b[1;31m\1\x1b[0m/g' \
      -e 's/(Firebase|unauthorized)/\x1b[1;33m\1\x1b[0m/g'
  echo "──────────────────────────────────────────────"
  echo "🧩 Dica: use './check_logs.sh' sem argumentos para ver todos os logs."

elif [[ "$1" == "--summary" ]]; then
  echo "🧭 Resumo de status e diagnósticos"
  echo "──────────────────────────────────────────────"
  LOGS=$(run_logs)
  TOTAL=$(echo "$LOGS" | wc -l)
  ERRORS=$(echo "$LOGS" | grep -E "Error|ERROR|500|Firebase não configurado|ERR_|unauthorized" | wc -l)
  OK=$(echo "$LOGS" | grep -E "Firebase inicializado|Servidor ativo|✅" | wc -l)
  echo "📄 Total de linhas: $TOTAL"
  echo "✅ Linhas OK: $OK"
  echo "❌ Linhas com erro: $ERRORS"
  echo "──────────────────────────────────────────────"
  echo "📅 Últimos eventos:"
  echo "$LOGS" | tail -n 10
  echo "──────────────────────────────────────────────"
  echo "🌐 URL: https://$SERVICE-448904673707.$REGION.run.app"
  echo "⏰ Execução concluída em: $(date '+%Y-%m-%d %H:%M:%S')"

else
  echo "📅 Logs recentes da revisão:"
  echo "──────────────────────────────────────────────"
  run_logs | sed -E \
      -e 's/(🔥|✅|🚀|⚠️)/\x1b[1;32m\1\x1b[0m/g' \
      -e 's/(❌)/\x1b[1;31m\1\x1b[0m/g' \
      -e 's/(🔍|🧩|💰)/\x1b[1;36m\1\x1b[0m/g' \
      -e 's/(v[0-9]+\.[0-9]+\.[0-9]+)/\x1b[1;35m\1\x1b[0m/g'
  echo "──────────────────────────────────────────────"
  echo "🌐 URL: https://$SERVICE-448904673707.$REGION.run.app"
  echo "⏰ Execução concluída em: $(date '+%Y-%m-%d %H:%M:%S')"
fi
