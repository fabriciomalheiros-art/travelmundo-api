# ===============================
# 🌍 TravelMundo API - Dockerfile (Optimized for Cloud Build & Cloud Run)
# ===============================

# 🏗️ Etapa 1: Build de dependências
FROM node:18-alpine AS builder

# Define o diretório de trabalho
WORKDIR /app

# Copia apenas os arquivos de dependências primeiro (melhor cache)
COPY package*.json ./

# Instala as dependências
RUN npm install --production

# Copia o restante do código da aplicação
COPY . .

# ===============================
# 🧩 Etapa 2: Execução leve
FROM node:18-alpine

WORKDIR /app

# Copia apenas o resultado da etapa anterior (sem cache sujo)
COPY --from=builder /app .

# Define variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=8080

# Expõe a porta padrão usada pelo Cloud Run
EXPOSE 8080

# 🏁 Comando para iniciar o servidor
CMD ["npm", "start"]
