// 🌍 TravelMundo API — v3.9.1 Stable
// -------------------------------------------------------
// Recursos principais:
// ✔️ Inicialização inteligente do Firebase (Base64 ou arquivo físico)
// ✔️ Diagnóstico completo (/debug-env)
// ✔️ Registro de deploy (/ _deploy-log)
// ✔️ Endpoints de negócio (créditos + transações)
// ✔️ Logs coloridos (chalk)
// ✔️ Cloud Run ready (PORT dinâmico)
// ✔️ Hotmart Secret compatível

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
let firebaseMode = "none";
let firebaseProjectId = null;
let firebaseClientEmail = null;

// -------------------------------------------------------------
// 🔥 1) Inicialização do Firebase (Base64 > arquivo físico)
// -------------------------------------------------------------
try {
  if (process.env.FIREBASE_CREDENTIALS_B64) {
    const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_B64, "base64").toString("utf8");
    const creds = JSON.parse(decoded);

    admin.initializeApp({
      credential: admin.credential.cert(creds),
    });

    firebaseInitialized = true;
    firebaseMode = "base64";
    firebaseProjectId = creds.project_id || null;
    firebaseClientEmail = creds.client_email || null;

    console.log(chalk.green("🔥 Firebase inicializado via Base64."));
  }
} catch (err) {
  console.log(chalk.red("❌ Erro ao inicializar via Base64:", err.message));
}

if (!firebaseInitialized) {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";

  if (fs.existsSync(path)) {
    try {
      const creds = JSON.parse(fs.readFileSync(path, "utf8"));

      admin.initializeApp({
        credential: admin.credential.cert(creds),
      });

      firebaseInitialized = true;
      firebaseMode = "file";
      firebaseProjectId = creds.project_id || null;
      firebaseClientEmail = creds.client_email || null;

      console.log(chalk.cyan("🔥 Firebase inicializado via arquivo físico."));
    } catch (err) {
      console.log(chalk.red("❌ Erro ao inicializar via arquivo:", err.message));
    }
  } else {
    console.log(chalk.yellow("⚠️ Nenhum método de inicialização Firebase encontrado."));
  }
}

const db = firebaseInitialized ? admin.firestore() : null;

// -------------------------------------------------------------
// 🧠 2) Endpoint de Diagnóstico Completo
// -------------------------------------------------------------
app.get("/debug-env", (req, res) => {
  res.json({
    message: "🔍 Diagnóstico do ambiente",
    firebase_inicializado: firebaseInitialized,
    variaveis: {
      NODE_ENV: process.env.NODE_ENV,
      HOTMART_SECRET: process.env.HOTMART_SECRET ? "✅ OK" : "❌ ausente",
      FIREBASE_CREDENTIALS_B64: !!process.env.FIREBASE_CREDENTIALS_B64,
      K_REVISION: process.env.K_REVISION || null,
      BUILD_ID: process.env.BUILD_ID || null,
      DEPLOY_BY: process.env.DEPLOY_BY || null,
    },
    credentials_inspect: {
      mode: firebaseMode,
      project_id: firebaseProjectId,
      client_email: firebaseClientEmail,
    },
  });
});

// -------------------------------------------------------------
// 📘 3) Registro do Deploy no Firestore
// -------------------------------------------------------------
app.post("/_deploy-log", async (req, res) => {
  if (!db)
    return res.status(500).json({ error: "Firebase não inicializado" });

  try {
    const { version, buildId, deployBy } = req.body;

    await db.collection("system_info")
      .doc("deploy_log")
      .set(
        {
          lastDeploy: new Date().toISOString(),
          version,
          buildId,
          deployBy,
          firebaseMode,
          firebaseProjectId,
          firebaseClientEmail,
        },
        { merge: true }
      );

    res.json({ ok: true, message: "Deploy log registrado com sucesso." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 💰 4) Endpoints de Créditos
// -------------------------------------------------------------

// Adicionar créditos
app.post("/buy-credits", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firebase não inicializado" });

  const { userId, credits, transactionId } = req.body;

  try {
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const currentCredits = userSnap.exists ? userSnap.data().credits || 0 : 0;

    const newBalance = currentCredits + credits;

    await userRef.set(
      { credits: newBalance, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    await db.collection("transactions").add({
      userId,
      credits,
      type: "credit",
      transactionId,
      timestamp: new Date().toISOString(),
    });

    res.json({ ok: true, newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Consumir créditos
app.post("/consume-credit", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firebase não inicializado" });

  const { userId, credits, reason } = req.body;

  try {
    const userRef = db.collection("users").doc(userId);
    const doc = await userRef.get();
    const current = doc.exists ? doc.data().credits || 0 : 0;

    if (current < credits) {
      return res.status(400).json({ error: "Créditos insuficientes" });
    }

    const newBalance = current - credits;

    await userRef.update({
      credits: newBalance,
      updatedAt: new Date().toISOString(),
    });

    await db.collection("transactions").add({
      userId,
      credits,
      type: "debit",
      reason,
      timestamp: new Date().toISOString(),
    });

    res.json({ ok: true, newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Consultar saldo
app.get("/credits/:userId", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firebase não inicializado" });

  try {
    const snap = await db.collection("users").doc(req.params.userId).get();
    res.json({
      userId: req.params.userId,
      credits: snap.exists ? snap.data().credits || 0 : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar transações
app.get("/transactions/:userId", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firebase não inicializado" });

  const limit = Number(req.query.limit) || 20;

  try {
    const snap = await db
      .collection("transactions")
      .where("userId", "==", req.params.userId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 🌐 Home
// -------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("🌍 TravelMundo API — v3.9.1 está online.");
});

// -------------------------------------------------------------
// 🚀 Start Server (Cloud Run)
// -------------------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(chalk.blue(`🚀 Servidor ativo na porta ${PORT}`));
});
