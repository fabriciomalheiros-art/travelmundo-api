# 🌍 TravelMundo API

API responsável pelo controle de créditos, registro de usuários e integração com Hotmart.

## 🧠 Estrutura
- `index.js`: Código principal da API (Express.js)
- `.env`: Variáveis sensíveis (não versionar)
- `package.json`: Dependências e scripts
- `.env.example`: Modelo público das variáveis

## 🔗 Endpoints Principais

### GET /ping
Verifica se a API está online.

**Exemplo de retorno:**
```json
{ "message": "TravelMundo API online ✅" }
```

### GET /credits?email=user@example.com
Retorna créditos e plano atual do usuário.

### POST /register
```json
{
  "action": "register",
  "email": "user@example.com",
  "name": "Fabricio Menezes"
}
```

### POST /deduct
```json
{
  "action": "deduct",
  "email": "user@example.com",
  "module": "travel"
}
```

### POST /webhook (Hotmart)
Recebe payload de transações confirmadas e adiciona créditos automaticamente.

## 🚀 Execução Local
```bash
npm install
npm run dev
```
Depois acesse:
```
http://localhost:8080/ping
```

## 🌐 Deploy Cloud Run
```bash
npm run deploy
```
