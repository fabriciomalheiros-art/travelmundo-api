#!/bin/bash
API="https://travelmundo-api-prod-448904673707.us-west1.run.app"
USER="teste-prod"
TX1="tx-prod-001"
TX2="tx-prod-002"

echo "🚀 Iniciando smoke test TravelMundo IA (ambiente produção)"
echo "──────────────────────────────────────────────"

# 1️⃣ Teste diagnóstico
curl -s "$API/debug-env" | jq .

# 2️⃣ Creditar 10
echo "💰 Adicionando 10 créditos..."
curl -s -X POST "$API/buy-credits" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$USER\",\"credits\":10,\"transactionId\":\"$TX1\"}" | jq .

# 3️⃣ Consumir 3
echo "💸 Consumindo 3 créditos..."
curl -s -X POST "$API/consume-credit" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$USER\",\"credits\":3,\"reason\":\"teste_prompt\"}" | jq .

# 4️⃣ Ver saldo
echo "🧾 Verificando saldo..."
curl -s "$API/credits/$USER" | jq .

# 5️⃣ Ver transações
echo "📊 Últimas transações..."
curl -s "$API/transactions/$USER?limit=5" | jq .

echo "──────────────────────────────────────────────"
echo "✅ Smoke test concluído — verifique o Firestore (coleções: users e transactions)."
