// 🌍 TravelMundo API — v3.8.0
// -------------------------------------------------------
// Recursos principais:
// ✅ Inicialização inteligente do Firebase (Base64 ou arquivo físico)
// ✅ Diagnóstico visual com logs coloridos e status
// ✅ Endpoints de negócio (creditar, consumir, consultar)
// ✅ Endpoints administrativos (/debug-env e /_deploy-log)
// ✅ Totalmente compatível com Cloud Run + Hotmart Secret

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
let db = null;

// 🔥 Inicialização do Firebase
try {
  if (process.env.FIREBASE_CREDENTIALS_B64) {
    const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_B64, "base64").toString("utf8");
    const creds = JSON.parse(decoded);
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    console.log(chalk.green("🔥 Firebase inicializado via variável Base64!"));
    firebaseInitialized = true;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    const serviceAccount = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log(chalk.cyan("🔥 Firebase inicializado via arquivo físico!"));
    firebaseInitialized = true;
  } else {
    console.warn(chalk.yellow("⚠️ Nenhum método de inicialização Firebase encontrado."));
  }
} catch (err) {
  console.error(chalk.red("❌ Erro ao inicializar Firebase:"), err.message);
}

if (firebaseInitialized) db = admin.firestore();

// -------------------------------------------------------
// 🧩 ENDPOINTS DE NEGÓCIO — Créditos TravelMundo IA
// -------------------------------------------------------

// 💰 Adicionar créditos
app.post("/buy-credits", async (req, res) => {
  try {
    const { userId, credits, transactionId } = req.body;
    if (!userId || !credits) return res.status(400).json({ error: "Parâmetros inválidos" });
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const prev = userSnap.exists ? userSnap.data().credits || 0 : 0;
    const newBalance = prev + credits;
    await userRef.set({ credits: newBalance, updatedAt: new Date().toISOString() }, { merge: true });
    await db.collection("transactions").add({
      userId,
      credits,
      type: "credit",
      transactionId: transactionId || null,
      timestamp: new Date().toISOString(),
    });
    console.log(chalk.green(`💰 ${credits} créditos adicionados a ${userId}`));
    res.json({ ok: true, newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ⚡ Consumir créditos
app.post("/consume-credit", async (req, res) => {
  try {
    const { userId, credits, reason } = req.body;
    if (!userId || !credits) return res.status(400).json({ error: "Parâmetros inválidos" });
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "Usuário não encontrado" });
    const prev = userSnap.data().credits || 0;
    if (prev < credits) return res.status(400).json({ error: "Créditos insuficientes" });
    const newBalance = prev - credits;
    await userRef.update({ credits: newBalance, updatedAt: new Date().toISOString() });
    await db.collection("transactions").add({
      userId,
      credits,
      type: "debit",
      reason: reason || "Uso de IA",
      timestamp: new Date().toISOString(),
    });
    console.log(chalk.yellow(`⚡ ${credits} créditos consumidos por ${userId}`));
    res.json({ ok: true, newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📊 Consultar saldo
app.get("/credits/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) return res.json({ userId, credits: 0 });
    res.json({ userId, credits: snap.data().credits || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🧾 Histórico de transações
app.get("/transactions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit || "10", 10);
    const snapshot = await db
      .collection("transactions")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();
    const txs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// 🧠 ENDPOINT — Diagnóstico do ambiente (estendido)
// -------------------------------------------------------
app.get("/debug-env", (req, res) => {
  let projectId = null;
  let clientEmail = null;
  let mode = null;
  try {
    if (process.env.FIREBASE_CREDENTIALS_B64) {
      const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_B64, "base64").toString("utf8");
      const creds = JSON.parse(decoded);
      projectId = creds.project_id || null;
      clientEmail = creds.client_email || null;
      mode = "base64";
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      const fileCreds = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
      projectId = fileCreds.project_id || null;
      clientEmail = fileCreds.client_email || null;
      mode = "file";
    } else {
      mode = "none";
    }
  } catch (e) {
    mode = "error";
  }

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
      mode,
      project_id: projectId,
      client_email: clientEmail,
    },
  });
});

// -------------------------------------------------------
// 🔏 ENDPOINT — Registro de Deploy (usa HOTMART_SECRET)
// -------------------------------------------------------
app.post("/_deploy-log", async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.HOTMART_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const payload = {
      at: new Date().toISOString(),
      build_id: process.env.BUILD_ID || null,
      deploy_by: process.env.DEPLOY_BY || null,
      revision: process.env.K_REVISION || null,
      project_id: (() => {
        try {
          const creds = JSON.parse(Buffer.from(process.env.FIREBASE_CREDENTIALS_B64, "base64").toString("utf8"));
          return creds.project_id || null;
        } catch {
          return null;
        }
      })(),
    };

    if (!db) return res.status(500).json({ error: "Firestore não inicializado" });

    await db.collection("system_info").doc("deploy_logs").collection("entries").add(payload);
    console.log(chalk.cyan("🧩 Log de deploy salvo com sucesso!"));
    res.json({ ok: true, saved: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// 🌐 Endpoint padrão (ping simples)
// -------------------------------------------------------
app.get("/", (req, res) => {
  res.send("🌍 TravelMundo API v3.8.0 está rodando com sucesso!");
});

// -------------------------------------------------------
// 🚀 Inicializa servidor local
// -------------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(chalk.blueBright(`🚀 Servidor ativo na porta ${PORT}`));
});
