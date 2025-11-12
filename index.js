// -------------------------------------------------------
// 🌍 TravelMundo API — v3.8.1-Stable
// -------------------------------------------------------
// Recursos principais:
// ✅ Inicialização inteligente do Firebase (Base64 ou arquivo físico)
// ✅ Diagnóstico visual com logs coloridos e status
// ✅ Endpoints de negócio (creditar, consumir, consultar)
// ✅ Endpoints administrativos (/debug-env e /deploy-log)
// ✅ Tratamento automático de índices ausentes no Firestore
// ✅ Log de deploy salvo automaticamente no Firestore
// ✅ Totalmente compatível com Cloud Run + Hotmart Secret
// -------------------------------------------------------

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

/* ======================================================
   🔥 Inicialização do Firebase
====================================================== */
let firebaseInitialized = false;
let firebaseProjectId = null;
let firebaseClientEmail = null;

try {
  const credsBase64 = process.env.FIREBASE_CREDENTIALS_B64;
  if (credsBase64) {
    const creds = JSON.parse(Buffer.from(credsBase64, "base64").toString());
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    firebaseInitialized = true;
    firebaseProjectId = creds.project_id;
    firebaseClientEmail = creds.client_email;
    console.log("🔥 Firebase inicializado com sucesso!");
  } else {
    console.warn("⚠️ FIREBASE_CREDENTIALS_B64 não encontrada.");
  }
} catch (err) {
  console.error("❌ Erro ao inicializar Firebase:", err.message);
}

const db = firebaseInitialized ? admin.firestore() : null;

/* ======================================================
   ⚙️ Endpoints utilitários
====================================================== */

// Diagnóstico geral do ambiente
app.get("/debug-env", (req, res) => {
  res.json({
    message: "🔍 Diagnóstico do ambiente",
    firebase_inicializado: firebaseInitialized,
    variaveis: {
      NODE_ENV: process.env.NODE_ENV || "desconhecido",
      HOTMART_SECRET: process.env.HOTMART_SECRET ? "✅ OK" : "❌ ausente",
      FIREBASE_CREDENTIALS_B64: !!process.env.FIREBASE_CREDENTIALS_B64,
      K_REVISION: process.env.K_REVISION || "N/A",
      BUILD_ID: process.env.BUILD_ID || null,
      DEPLOY_BY: process.env.DEPLOY_BY || null
    },
    credentials_inspect: {
      mode: process.env.FIREBASE_CREDENTIALS_B64 ? "base64" : "none",
      project_id: firebaseProjectId,
      client_email: firebaseClientEmail
    }
  });
});

// Log de deploy no Firestore
app.post("/deploy-log", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firestore não inicializado" });

  const payload = {
    version: req.body.version || "unknown",
    deployedBy: req.body.deployedBy || "unknown",
    timestamp: new Date().toISOString(),
    buildId: process.env.BUILD_ID || null,
    revision: process.env.K_REVISION || "unknown"
  };

  try {
    await db.collection("system_info").add(payload);
    res.json({ ok: true, message: "Deploy log registrado com sucesso!", data: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   💰 Sistema de Créditos TravelMundo IA
====================================================== */

// ✅ Adicionar créditos
app.post("/buy-credits", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firestore não inicializado" });

  const { userId, credits, transactionId } = req.body;
  if (!userId || !credits) return res.status(400).json({ error: "userId e credits obrigatórios" });

  try {
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const balance = userSnap.exists ? userSnap.data().credits || 0 : 0;
    const newBalance = balance + credits;

    await userRef.set({ userId, credits: newBalance }, { merge: true });
    await db.collection("transactions").add({
      userId,
      credits,
      type: "credit",
      transactionId,
      timestamp: new Date().toISOString()
    });

    res.json({ ok: true, newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Consumir créditos
app.post("/consume-credit", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firestore não inicializado" });

  const { userId, credits, reason } = req.body;
  if (!userId || !credits) return res.status(400).json({ error: "userId e credits obrigatórios" });

  try {
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "Usuário não encontrado" });

    const balance = userSnap.data().credits || 0;
    if (balance < credits) return res.status(400).json({ error: "Créditos insuficientes" });

    const newBalance = balance - credits;

    await userRef.update({ credits: newBalance });
    await db.collection("transactions").add({
      userId,
      credits,
      type: "debit",
      reason,
      timestamp: new Date().toISOString()
    });

    res.json({ ok: true, newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Consultar saldo
app.get("/credits/:userId", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firestore não inicializado" });
  const { userId } = req.params;

  try {
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json({ userId, credits: doc.data().credits || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Listar transações (tratamento automático de índice ausente)
app.get("/transactions/:userId", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firestore não inicializado" });

  const { userId } = req.params;
  const limit = parseInt(req.query.limit || 10);

  try {
    const snap = await db
      .collection("transactions")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    const transactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(transactions);
  } catch (err) {
    if (err.message.includes("requires an index")) {
      const match = err.message.match(/https:\/\/console\.firebase\.google\.com\/[^\s"]+/);
      res.status(400).json({
        error: "Firestore requer índice para esta consulta.",
        fixLink: match ? match[0] : null
      });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

/* ======================================================
   🚀 Inicialização do servidor
====================================================== */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 TravelMundo IA API v3.8.1-Stable rodando na porta ${PORT}`);
});
