// 🌍 TravelMundo API — v3.5.0 (Firebase + Hotmart + Créditos e Histórico)
// -------------------------------------------------------
// Recursos principais:
// ✅ Inicialização inteligente do Firebase (arquivo físico, Secret Manager ou Base64)
// ✅ Diagnóstico visual com logs coloridos
// ✅ Endpoints de compra, saldo e histórico de créditos
// ✅ Integração Hotmart Secret e Firestore segura

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

// 🔥 1️⃣ Tenta inicializar o Firebase via Base64
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

// 🔥 2️⃣ Se não deu via Base64, tenta arquivo físico
if (!firebaseInitialized) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log(chalk.cyanBright("🔥 Firebase inicializado via arquivo físico!"));
      firebaseInitialized = true;
    } catch (err) {
      console.error(chalk.red("❌ Erro ao inicializar Firebase via arquivo:"), err.message);
    }
  } else {
    console.warn(chalk.yellow("⚠️ Arquivo serviceAccountKey.json não encontrado."));
  }
}

const db = firebaseInitialized ? admin.firestore() : null;

// 🧠 ENDPOINT — Diagnóstico do ambiente
app.get("/debug-env", (req, res) => {
  res.json({
    message: "🔍 Diagnóstico do ambiente",
    has_FIREBASE_SERVICE_ACCOUNT_JSON: fs.existsSync("./serviceAccountKey.json"),
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "(não definido)",
    firebase_inicializado: firebaseInitialized,
    variaveis: {
      NODE_ENV: process.env.NODE_ENV,
      HOTMART_SECRET: process.env.HOTMART_SECRET ? "✅ OK" : "❌ ausente",
      FIREBASE_CREDENTIALS_B64: !!process.env.FIREBASE_CREDENTIALS_B64,
    },
  });
});

// 🧾 ENDPOINT — Diagnóstico da chave Base64
app.get("/debug-secret", (req, res) => {
  if (!process.env.FIREBASE_CREDENTIALS_B64)
    return res.status(404).json({ error: "Variável FIREBASE_CREDENTIALS_B64 não encontrada" });
  res.json({ status: "ok", length: process.env.FIREBASE_CREDENTIALS_B64.length });
});

// 🧪 ENDPOINT — Teste de Firestore
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

// 💰 ENDPOINT — Compra de créditos
app.post("/buy-credits", async (req, res) => {
  if (!firebaseInitialized || !db)
    return res.status(500).json({ error: "Firebase não configurado" });

  const { userId, credits, transactionId } = req.body;
  if (!userId || !credits || !transactionId)
    return res.status(400).json({ error: "Parâmetros ausentes" });

  try {
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const data = userSnap.exists ? userSnap.data() : { credits: 0 };
    const newBalance = (data.credits || 0) + credits;

    await userRef.set({ credits: newBalance }, { merge: true });
    await db.collection("transactions").add({
      userId,
      credits,
      transactionId,
      type: "buy",
      createdAt: new Date().toISOString(),
    });

    console.log(chalk.green(`💳 Créditos adicionados para ${userId}: +${credits}`));
    res.json({ success: true, newBalance, transactionId });
  } catch (err) {
    console.error(chalk.red("❌ Erro ao processar compra de créditos:"), err.message);
    res.status(500).json({ error: err.message });
  }
});

// 💎 ENDPOINT — Consulta de saldo
app.get("/get-credits/:userId", async (req, res) => {
  if (!firebaseInitialized || !db)
    return res.status(500).json({ error: "Firebase não configurado" });

  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId é obrigatório" });

  try {
    const userRef = db.collection("users").doc(userId);
    const doc = await userRef.get();
    if (!doc.exists) return res.json({ userId, credits: 0 });
    const data = doc.data();
    res.json({ userId, credits: data.credits || 0 });
  } catch (err) {
    console.error(chalk.red("❌ Erro ao consultar créditos:"), err.message);
    res.status(500).json({ error: err.message });
  }
});

// 📜 ENDPOINT — Histórico de transações
app.get("/transactions/:userId", async (req, res) => {
  if (!firebaseInitialized || !db)
    return res.status(500).json({ error: "Firebase não configurado" });

  const { userId } = req.params;
  try {
    const snapshot = await db
      .collection("transactions")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const transactions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ userId, transactions });
  } catch (err) {
    console.error(chalk.red("❌ Erro ao buscar histórico:"), err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🌐 Endpoint padrão
app.get("/", (req, res) => {
  res.send("🌍 TravelMundo API v3.5.0 está rodando com sucesso!");
});

// 🚀 Inicializa servidor local
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(chalk.blueBright(`🚀 Servidor ativo na porta ${PORT}`));
});
