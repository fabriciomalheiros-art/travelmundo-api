#!/bin/bash
set -e

# ============================
# 🔐 Grant permissions (final)
# ============================

PROJECT_ID="gen-lang-client-0394942372"
SERVICE_ACCOUNT_ID="travelmundo-api-prod-sa"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
SECRET_ID="firebase-service-account"   # nome do Secret no Secret Manager

echo "🔐 Iniciando configuração de permissões no projeto: ${PROJECT_ID}"
echo "👤 Service Account alvo: ${SERVICE_ACCOUNT_EMAIL}"
echo "🗝️ Secret alvo: ${SECRET_ID}"
echo

# 1) Criar Service Account (idempotente)
echo "🧭 Verificando/criando Service Account..."
if gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "✅ Service Account já existe."
else
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_ID}" \
    --display-name="TravelMundo API (prod) – runtime" \
    --project="${PROJECT_ID}"
  echo "✅ Service Account criado."
fi
echo

# 2) Conceder papéis em nível de PROJETO (com --condition=None)
echo "📜 Concedendo papéis no PROJETO (com --condition=None)..."

# Acesso ao Firestore (Datastore)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/datastore.user" \
  --condition=None

# Leitor de segredos (caso você queira conceder no projeto inteiro)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None

# (Opcional) Log writer — útil para Cloud Logging
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/logging.logWriter" \
  --condition=None

echo "✅ Papéis no projeto aplicados."
echo

# 3) **Recomendado**: conceder acesso apenas ao Secret específico (escopo mínimo)
#    Isso é adicional e mais seguro que project-wide.
echo "🔒 Vinculando acesso SOMENTE ao Secret ${SECRET_ID}..."
gcloud secrets add-iam-policy-binding "${SECRET_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}"
echo "✅ Binding no Secret aplicado."
echo

# 4) Mostrar resumo
echo "🧾 Resumo:"
echo "   • Projeto:            ${PROJECT_ID}"
echo "   • Service Account:    ${SERVICE_ACCOUNT_EMAIL}"
echo "   • Secret:             ${SECRET_ID}"
echo
echo "🎉 Permissões configuradas com sucesso!"

