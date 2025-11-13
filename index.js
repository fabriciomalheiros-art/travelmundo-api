// 🌍 TravelMundo API — v3.9.2 (Stable)
// -------------------------------------------------------
// Recursos principais:
// ✅ Inicialização inteligente do Firebase (Base64 ou Arquivo)
// ✅ Diagnóstico avançado do ambiente (/debug-env)
// ✅ Endpoints de crédito: buy-credits, consume-credit, credits, transactions
// ✅ Registro automático de deploy (/ _deploy-log)
// ✅ Versionamento: /version-info e /version-history
// ✅ Sanitização de payload (sem valores undefined para Firestore)
// -------------------------------------------------------

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

// 🔥 1) TENTAR INICIALIZAR VIA BASE64
try {
  if (process.env.FIREBASE_CREDENTIALS_B64) {
    const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_B64, "base64").toString("utf8");
    const creds = JSON.parse(decoded);

    admin.initializeApp({
      credential: admin.credential.cert(creds),
    });

    console.log(chalk.green("🔥 Firebase inicializado via Base64."));
    firebaseInitialized = true;
  }
} catch (err) {
  console.error(chalk.red("❌ Erro ao inicializar via Base64:"), err.message);
}

// 🔥 2) SE FALHAR, TENTAR VIA ARQUIVO FÍSICO
if (!firebaseInitialized) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";

  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      console.log(chalk.cyan("🔥 Firebase inicializado via arquivo físico."));
      firebaseInitialized = true;
    } catch (err) {
      console.error(chalk.red("❌ Erro ao inicializar via arquivo físico:"), err.message);
    }
  } else {
    console.warn(chalk.yellow("⚠️ Arquivo serviceAccountKey.json não encontrado."));
  }
}

// 🔥 Firestore
const db = firebaseInitialized ? admin.firestore() : null;

// -------------------------------------------------------
// 🧠 ENDPOINT: DEBUG DO AMBIENTE
// -------------------------------------------------------
app.get("/debug-env", (req, res) => {
  let projectId = null;
  let clientEmail = null;

  try {
    const decoded = JSON.parse(
      Buffer.from(process.env.FIREBASE_CREDENTIALS_B64, "base64").toString("utf8")
    );
    projectId = decoded.project_id;
    clientEmail = decoded.client_email;
  } catch {}

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
      mode: process.env.FIREBASE_CREDENTIALS_B64 ? "base64" : "file",
      project_id: projectId,
      client_email: clientEmail,
    },
  });
});

// -------------------------------------------------------
// 🧠 ENDPOINT: VERSION INFO
// -------------------------------------------------------
app.get("/version-info", async (req, res) => {
  try {
    const snap = await db.collection("system_info").doc("deploy_log").get();
    const data = snap.exists ? snap.data() : null;

    res.json({
      version: data?.version || "unknown",
      firestore_data: data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// 🧠 ENDPOINT: VERSION HISTORY
// -------------------------------------------------------
app.get("/version-history", async (req, res) => {
  try {
    const snap = await db.collection("system_info").doc("version_history").get();
    const data = snap.exists ? snap.data() : { history: [] };

    res.json({
      version: data.history?.[0]?.version || "unknown",
      history: data.history || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// 🧱 ENDPOINT: REGISTRO DE DEPLOY (_deploy-log)
// Corrigido para nunca enviar undefined ao Firestore
// -------------------------------------------------------
app.post("/_deploy-log", async (req, res) => {
  try {
    const { version, buildId, deployBy } = req.body;

    // Sanitização: remove undefined
    const payload = {
      lastDeploy: new Date().toISOString(),
      version: version || "unknown",
      buildId: buildId || "none",
      deployBy: deployBy || "unknown",
    };

    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    await db.collection("system_info").doc("deploy_log").set(payload, { merge: true });

    res.json({ ok: true, saved: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// 💰 ENDPOINT: CREDITAR CRÉDITOS
// -------------------------------------------------------
app.post("/buy-credits", async (req, res) => {
  try {
    const { userId, credits, transactionId } = req.body;
    if (!userId || !credits) return res.status(400).json({ error: "userId e credits obrigatórios" });

    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();

    let current = 0;
    if (snap.exists) current = snap.data().credits || 0;

    const newBalance = current + credits;

    await userRef.set(
      {
        credits: newBalance,
        updatedAt: new Date().toISOString(),
      },
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

// -------------------------------------------------------
// 💸 ENDPOINT: CONSUMIR CRÉDITOS
// -------------------------------------------------------
app.post("/consume-credit", async (req, res) => {
  try {
    const { userId, credits, reason } = req.body;
    if (!userId || !credits) return res.status(400).json({ error: "userId e credits obrigatórios" });

    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();

    const current = snap.exists ? snap.data().credits || 0 : 0;
    const newBalance = Math.max(0, current - credits);

    await userRef.set(
      {
        credits: newBalance,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

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

// -------------------------------------------------------
// 📊 ENDPOINT: SALDO DO USUÁRIO
// -------------------------------------------------------
app.get("/credits/:userId", async (req, res) => {
  try {
    const snap = await db.collection("users").doc(req.params.userId).get();
    const data = snap.exists ? snap.data() : { credits: 0 };
    res.json({ userId: req.params.userId, credits: data.credits || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// 📜 ENDPOINT: HISTÓRICO DO USUÁRIO
// -------------------------------------------------------
app.get("/transactions/:userId", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || 20);
    const col = db
      .collection("transactions")
      .where("userId", "==", req.params.userId)
      .orderBy("timestamp", "desc")
      .limit(limit);

    const snap = await col.get();
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// 🌐 ROOT ENDPOINT
// -------------------------------------------------------
app.get("/", (req, res) => {
  res.send("🌍 TravelMundo API v3.9.2 — online");
});

// -------------------------------------------------------
// 🚀 START
// -------------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(chalk.blue(`🚀 Servidor ativo na porta ${PORT}`));
});
