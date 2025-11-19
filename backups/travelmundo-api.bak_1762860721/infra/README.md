# 🌍 Infraestrutura TravelMundo IA - Versão Final

## 🚀 Visão Geral
Esta infraestrutura conecta o ecossistema **TravelMundo IA** (Lovable + AI Studio + Cloud Run + Firestore + Hotmart) em um pipeline escalável e seguro.

### 🧩 Estrutura
- **1-preparacao-gcp/** – Criação e configuração do projeto GCP
- **2-deploy-cloud-run/** – Deploy da API Node.js no Cloud Run
- **3-firestore/** – Estrutura e índices do Firestore
- **4-lovable-integration/** – Integração com frontend Lovable
- **5-ai-studio-integration/** – Comunicação com AI Studio
- **6-webhook-hotmart/** – Webhook de créditos Hotmart
- **7-monitoramento-escalabilidade/** – Logging, métricas e alertas
- **ci-cd/** – Automação de deploy via tags (Cloud Build + GitHub Actions)

## 🧱 Projeto
- **Projeto GCP:** travelmundoia-prod
- **Região:** us-west1
- **Frontend:** https://travelmundo-ia.lovable.app
- **Backend (AI Studio):** https://portal-travelmundo-ia-v2-448904673707.us-west1.run.app
- **Repositório:** https://github.com/fabriciomalheiros-art/travelmundo-api

## 🔐 Variáveis (.env.example)
Configure suas variáveis de ambiente antes do deploy:

```
FIRESTORE_PROJECT_ID=travelmundoia-prod
PUBLIC_API_KEY=pub_xxxxxxxxxxxxxxxxx
BACKEND_API_KEY=srv_xxxxxxxxxxxxxxxxx
HOTMART_SECRET=hot_xxxxxxxxxxxxxxxxx
JWT_SECRET=jwt_xxxxxxxxxxxxxxxxx
REDIS_URL=redis://10.0.0.3:6379
NODE_ENV=production
LOG_LEVEL=info
```

## ⚙️ CI/CD - Deploy Manual via Tag
Fluxo seguro de publicação (produção):

```bash
git add .
git commit -m "Ajustes"
git tag v1.0.0
git push origin v1.0.0
```
O **Cloud Build** detectará a tag e fará o deploy automático no Cloud Run.

---
📩 **Contato técnico:** fabriciomalheiros@gmail.com  
📍 **Autor:** Fabricio Menezes (TravelMundo IA)
