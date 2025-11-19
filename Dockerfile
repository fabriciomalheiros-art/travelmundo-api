# ---------------------------------------------------------
# 🌍 TravelMundo API - Dockerfile v3.8.0
# Build otimizado para Cloud Run (Node 20 + segurança)
# ---------------------------------------------------------

# Etapa 1: Build base
FROM node:20-alpine AS builder

# Define diretório de trabalho
WORKDIR /app

# Copia arquivos de dependências
COPY package*.json ./

# Instala dependências (sem as dev)
RUN npm install --omit=dev

# Copia o resto do projeto
COPY . .

# ---------------------------------------------------------
# Etapa 2: Execução no ambiente de produção
# ---------------------------------------------------------
FROM node:20-alpine

# Diretório de trabalho final
WORKDIR /app

# Copia o resultado do builder
COPY --from=builder /app ./

# Define variáveis padrão
ENV NODE_ENV=production
ENV PORT=8080

# Expõe a porta padrão do Cloud Run
EXPOSE 8080

# Comando para iniciar a API
CMD ["npm", "start"]
