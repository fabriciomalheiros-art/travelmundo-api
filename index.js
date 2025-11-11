// 🌍 TravelMundo API — v3.4.1 (Firebase + Hotmart + Créditos + Histórico)
// -----------------------------------------------------------
// Recursos principais:
// ✅ Inicialização via Base64, arquivo físico ou Secret Manager
// ✅ Logs coloridos com chalk
// ✅ Endpoints de debug (/debug-env, /test-firebase)
// ✅ Endpoints de negócio (/buy-credits, /use-credit, /user/:id, /transactions/:userId)
// ✅ Firestore com controle de créditos e histórico de transações

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

// 🔥 1️⃣ Inicializa via Base64 (preferencial)
try {
  if (process.env.FIREBASE_CREDENTIALS_B64) {
    const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_B64, "base64").toString("utf8");
    const creds = JSON.parse(decoded);
    admin.initializeApp({
      credential: admin.credential.cert(creds),
    });
    console.log(chalk.greenBright("🔥 Firebase inicializado via variável Base64!"));
    firebaseInitialized = true;
  }
} catch (err) {
  console.error(chalk.red("❌ Erro ao inicializar Firebase via Base64:"), err.message);
}

// 🔥 2️⃣ Fallback via arquivo físico
if (!firebaseInitialized) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
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

// -----------------------------------------------------------
// 🧠 ENDPOINT — Diagnóstico do ambiente
// -----------------------------------------------------------
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

// -----------------------------------------------------------
// 🧪 ENDPOINT — Teste de conexão com Firebase
// -----------------------------------------------------------
app.get("/test-firebase", async (req, res) => {
  if (!firebaseInitialized || !db) return res.status(500).json({ error: "Firebase não configurado" });
  try {
    const testRef = db.collection("test_connection").doc("ping");
    await testRef.set({ ok: true, ts: new Date().toISOString() });
    const snap = await testRef.get();
    res.json({ status: "ok", firestore_data: snap.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 💰 ENDPOINT — Comprar créditos
// -----------------------------------------------------------
app.post("/buy-credits", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firestore não inicializado" });
  const { userId, credits, transactionId } = req.body;

  if (!userId || !credits || !transactionId) {
    return res.status(400).json({ error: "Parâmetros inválidos: userId, credits e transactionId são obrigatórios" });
  }

  try {
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const currentCredits = userSnap.exists ? userSnap.data().credits || 0 : 0;
    const newCredits = currentCredits + credits;

    await userRef.set(
      { credits: newCredits, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    const txData = {
      userId,
      type: "purchase",
      credits,
      transactionId,
      timestamp: new Date().toISOString(),
    };
    await db.collection("transactions").add(txData);

    console.log(chalk.green(`💰 [BUY] Usuário ${userId} adicionou ${credits} créditos → Total: ${newCredits}`));

    res.json({
      success: true,
      message: `✅ ${credits} créditos adicionados com sucesso!`,
      totalCredits: newCredits,
      transaction: txData,
    });
  } catch (err) {
    console.error(chalk.red("❌ Erro ao adicionar créditos:"), err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// ⚡ ENDPOINT — Utilizar 1 crédito
// -----------------------------------------------------------
app.post("/use-credit", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firestore não inicializado" });
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Parâmetro userId é obrigatório" });

  try {
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) return res.status(404).json({ error: "Usuário não encontrado" });

    const data = userSnap.data();
    const currentCredits = data.credits || 0;

    if (currentCredits <= 0) return res.status(400).json({ error: "Créditos insuficientes" });

    const newCredits = currentCredits - 1;

    await userRef.update({
      credits: newCredits,
      updatedAt: new Date().toISOString(),
    });

    const txData = {
      userId,
      type: "usage",
      credits: -1,
      timestamp: new Date().toISOString(),
    };
    await db.collection("transactions").add(txData);

    console.log(chalk.yellow(`⚡ [USE] Usuário ${userId} utilizou 1 crédito → Restam: ${newCredits}`));

    res.json({
      success: true,
      message: "✅ Crédito utilizado com sucesso.",
      remainingCredits: newCredits,
      transaction: txData,
    });
  } catch (err) {
    console.error(chalk.red("❌ Erro ao usar crédito:"), err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 💳 ENDPOINT — Consultar saldo do usuário
// -----------------------------------------------------------
app.get("/user/:id", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firestore não inicializado" });
  const userId = req.params.id;

  try {
    const userRef = db.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) return res.status(404).json({ error: "Usuário não encontrado" });

    res.json({ userId, credits: doc.data().credits || 0, updatedAt: doc.data().updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 📜 ENDPOINT — Histórico de transações do usuário
// -----------------------------------------------------------
app.get("/transactions/:userId", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firestore não inicializado" });
  const { userId } = req.params;

  try {
    const txRef = db
      .collection("transactions")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc");

    const snapshot = await txRef.get();
    if (snapshot.empty) return res.json({ userId, transactions: [] });

    const transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log(chalk.magenta(`📜 Histórico solicitado → ${userId} (${transactions.length} transações)`));

    res.json({
      userId,
      totalTransactions: transactions.length,
      transactions,
    });
  } catch (err) {
    console.error(chalk.red("❌ Erro ao buscar transações:"), err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 🌐 Endpoint padrão
// -----------------------------------------------------------
app.get("/", (req, res) => {
  res.send("🌍 TravelMundo API v3.4.1 — Online, Firebase ativo e endpoints de créditos prontos!");
});

// -----------------------------------------------------------
// 🚀 Inicializa servidor
// -----------------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(chalk.blueBright(`🚀 Servidor ativo na porta ${PORT}`));
});
