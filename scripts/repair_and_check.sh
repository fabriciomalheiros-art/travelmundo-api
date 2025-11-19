#!/bin/bash
set -e

echo "🧭 Iniciando processo completo de reparo, integridade, build e deploy do TravelMundo API..."

# 1) Verifica arquivo .rar
if [ ! -f ~/travelmundo-api.rar ]; then
  echo "❌ Arquivo travelmundo-api.rar não encontrado em ~/ !"
  exit 1
fi

# 2) Testa integridade do .rar
echo "🧪 Verificando integridade do arquivo .rar..."
unrar t ~/travelmundo-api.rar > integrity.log 2>&1 || true
if grep -q "All OK" integrity.log; then
  echo "✅ Arquivo .rar íntegro (sem erros detectados)"
else
  echo "⚠️ Atenção: possíveis problemas detectados na integridade! Veja: cat integrity.log"
fi
rm -f integrity.log

# 3) Backup da pasta atual, se existir
if [ -d ~/travelmundo-api ]; then
  BACKUP_DIR=~/travelmundo-api.bak_$(date +%s)
  echo "📦 Criando backup em: $BACKUP_DIR"
  mv ~/travelmundo-api "$BACKUP_DIR"
fi

# 4) Extração para pasta temporária
echo "🗂️ Extraindo travelmundo-api.rar..."
rm -rf ~/tmp_extract && mkdir -p ~/tmp_extract
unrar x -o+ ~/travelmundo-api.rar ~/tmp_extract/ > /dev/null

# detecta subpasta raiz
if [ -d ~/tmp_extract/travelmundo-api ]; then
  SRC=~/tmp_extract/travelmundo-api
else
  SRC=~/tmp_extract
fi

# 5) Sincroniza TUDO (inclui ocultos)
echo "🔄 Sincronizando arquivos..."
mkdir -p ~/travelmundo-api
rsync -a "$SRC"/ ~/travelmundo-api/

# 6) Limpa temporários
rm -rf ~/tmp_extract

# 7) Relatório de verificação
echo -e "\n✅ SINCRONIZAÇÃO CONCLUÍDA\n"
echo "📁 Tamanho total:"; du -sh ~/travelmundo-api
echo -e "\n📄 Total de arquivos:"; find ~/travelmundo-api -type f | wc -l
echo -e "\n📂 Total de pastas:";  find ~/travelmundo-api -type d | wc -l
echo -e "\n👁️ Ocultos na raiz:";  ls -1a ~/travelmundo-api | grep "^\." || echo "Nenhum"

# 8) Build no Cloud Build
echo -e "\n🚀 Build no Google Cloud Build...\n"
cd ~/travelmundo-api
gcloud builds submit . \
  --tag us-west1-docker.pkg.dev/gen-lang-client-0394942372/travelmundo-api/travelmundo-api:latest

echo -e "\n✅ Build OK. Imagem:"
echo "   us-west1-docker.pkg.dev/gen-lang-client-0394942372/travelmundo-api/travelmundo-api:latest"

# 9) Deploy no Cloud Run (CORS aberto p/ testes)
echo -e "\n🚢 Deploy no Cloud Run...\n"
gcloud run deploy travelmundo-api \
  --image us-west1-docker.pkg.dev/gen-lang-client-0394942372/travelmundo-api/travelmundo-api:latest \
  --region us-west1 \
  --platform managed \
  --allow-unauthenticated \
  --service-account travelmundo-api-sa@gen-lang-client-0394942372.iam.gserviceaccount.com \
  --memory 512Mi \
  --cpu 1 \
  --port 8080 \
  --timeout 300s \
  --set-env-vars NODE_ENV=production,CORS_ORIGIN=*,HOTMART_SECRET=y4GJWDRbL1IXEOwXRwWN2G0GyQKkPJ22417386 \
  --set-secrets FIREBASE_SERVICE_ACCOUNT_JSON=firebase-service-account:latest

echo -e "\n✅ Deploy concluído!"
URL=$(gcloud run services describe travelmundo-api --region us-west1 --format='value(status.url)')
echo "🌐 URL da API: $URL"
