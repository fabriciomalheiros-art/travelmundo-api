# ============================================================
# 🌍 TravelMundo IA - Dockerfile (v3.1.7)
# 🔧 Build otimizado p/ Cloud Build + Cloud Run
# ============================================================

# 🏗️ Etapa 1: Build de dependências
FROM node:20-alpine AS builder

WORKDIR /app

# Copia apenas os arquivos de dependência (melhora cache)
COPY package*.json ./

# Instala dependências (sem pacotes de dev)
RUN npm install --omit=dev

# Copia o restante da aplicação
COPY . .

# ============================================================
# 🧩 Etapa 2: Runtime leve e seguro
# ============================================================
FROM node:20-alpine

WORKDIR /app

# Copia somente o conteúdo necessário da etapa anterior
COPY --from=builder /app ./

# Define variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=8080

# Cloud Run usa essa porta automaticamente
EXPOSE 8080

# 🏁 Comando de inicialização
CMD ["npm", "start"]

