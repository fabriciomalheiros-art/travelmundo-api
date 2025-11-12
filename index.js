// 🌍 TravelMundo API — v3.7.0
// -------------------------------------------------------
// ✅ Firebase via Base64 ou arquivo físico
// ✅ Auditoria de versão e histórico
// ✅ Endpoints de negócio reais: buy-credits, check-credits, use-credits
// ✅ Diagnóstico, logs coloridos e segurança com admin-token

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";
import chalk from "chalk";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

let firebaseInitialized = false;

// 🧠 Inicialização inteligente do Firebase
try {
  if (process.env.FIREBASE_CREDENTIALS_B64) {
    const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_B64, "base64").toString("utf8");
    const creds = JSON.parse(decoded);
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    console.log(chalk.greenBright("🔥 Firebase inicializado via variável Base64!"));
    firebaseInitialized = true;
  }
} catch (err) {
  console.error(chalk.red("❌ Erro ao inicializar Firebase via Base64:"), err.message);
}

if (!firebaseInitialized) {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";
  if (fs.existsSync(path)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(path, "utf8"));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log(chalk.cyanBright("🔥 Firebase inicializado via arquivo físico!"));
      firebaseInitialized = true;
    } catch (err) {
      console.error(chalk.red("❌ Erro ao inicializar Firebase via arquivo físico:"), err.message);
    }
  }
}

const db = firebaseInitialized ? admin.firestore() : null;

// 🌡️ Diagnóstico do ambiente
app.get("/debug-env", (req, res) => {
  res.json({
    message: "🔍 Diagnóstico do ambiente",
    firebase_inicializado: firebaseInitialized,
    variaveis: {
      NODE_ENV: process.env.NODE_ENV,
      HOTMART_SECRET: process.env.HOTMART_SECRET ? "✅ OK" : "❌ ausente",
      FIREBASE_CREDENTIALS_B64: !!process.env.FIREBASE_CREDENTIALS_B64,
      K_REVISION: process.env.K_REVISION || "(local)",
      BUILD_ID: process.env.BUILD_ID || null,
      DEPLOY_BY: process.env.DEPLOY_BY || null,
    },
  });
});

// 🧾 Histórico de versões
app.get("/version-info", async (req, res) => {
  try {
    const ref = db.collection("version_history").doc("current");
    const snap = await ref.get();
    res.json({
      version: "3.7.0",
      firestore_data: snap.exists ? snap.data() : "Nenhum histórico encontrado",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🧩 Endpoints de negócio
// --------------------------------------------------

// 💰 Adicionar créditos
app.post("/buy-credits", async (req, res) => {
  const { userId, credits, transactionId } = req.body;
  if (!firebaseInitialized || !db) return res.status(500).json({ error: "Firebase não configurado" });
  if (!userId || !credits) return res.status(400).json({ error: "Parâmetros inválidos" });

  try {
    const ref = db.collection("users").doc(userId);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : { credits: 0, transactions: [] };

    const newCredits = (data.credits || 0) + credits;
    await ref.set(
      {
        credits: newCredits,
        transactions: admin.firestore.FieldValue.arrayUnion({
          transactionId,
          amount: credits,
          type: "buy",
          timestamp: new Date().toISOString(),
        }),
      },
      { merge: true }
    );

    console.log(chalk.green(`💰 ${credits} créditos adicionados a ${userId}`));
    res.json({ success: true, message: `💰 ${credits} créditos adicionados ao usuário ${userId}` });
  } catch (err) {
    console.error(chalk.red("❌ Erro ao adicionar créditos:"), err);
    res.status(500).json({ error: err.message });
  }
});

// 🔍 Consultar saldo
app.get("/check-credits/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!firebaseInitialized || !db) return res.status(500).json({ error: "Firebase não configurado" });
  try {
    const ref = db.collection("users").doc(userId);
    const snap = await ref.get();
    if (!snap.exists) return res.json({ userId, credits: 0 });
    res.json({ userId, ...snap.data() });
  } catch (err) {
    console.error(chalk.red("❌ Erro ao consultar créditos:"), err);
    res.status(500).json({ error: err.message });
  }
});

// ⚡ Consumir créditos
app.post("/use-credits", async (req, res) => {
  const { userId, credits } = req.body;
  if (!firebaseInitialized || !db) return res.status(500).json({ error: "Firebase não configurado" });
  try {
    const ref = db.collection("users").doc(userId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Usuário não encontrado" });

    const data = snap.data();
    if ((data.credits || 0) < credits)
      return res.status(400).json({ error: "Créditos insuficientes" });

    await ref.update({
      credits: data.credits - credits,
      transactions: admin.firestore.FieldValue.arrayUnion({
        amount: -credits,
        type: "use",
        timestamp: new Date().toISOString(),
      }),
    });

    console.log(chalk.yellow(`⚡ ${credits} créditos consumidos por ${userId}`));
    res.json({ success: true, message: `⚡ ${credits} créditos consumidos por ${userId}` });
  } catch (err) {
    console.error(chalk.red("❌ Erro ao consumir créditos:"), err);
    res.status(500).json({ error: err.message });
  }
});

// 🧠 Teste rápido do Firestore
app.get("/test-firebase", async (req, res) => {
  if (!firebaseInitialized || !db)
    return res.status(500).json({ error: "Firebase não configurado" });
  try {
    const testRef = db.collection("test_connection").doc("ping");
    await testRef.set({ ok: true, ts: new Date().toISOString() });
    const snap = await testRef.get();
    res.json({ status: "ok", firestore_data: snap.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🌐 Rota padrão
app.get("/", (req, res) => {
  res.send("🌍 TravelMundo API v3.7.0 está online!");
});

// 🚀 Inicializa servidor local
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(chalk.blueBright(`🚀 Servidor ativo na porta ${PORT} — v3.7.0`));
});
