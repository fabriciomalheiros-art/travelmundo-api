// 🌍 TravelMundo API — v3.6.3 (Firebase + Hotmart + Logs Estruturados + Healthz)
// -----------------------------------------------------------------------------
// ✅ Firebase Base64 + Fallback de arquivo físico
// ✅ Registro robusto de versões (com deduplicação e histórico)
// ✅ X-Request-Id em cada resposta
// ✅ Health check endpoint (/healthz)
// ✅ Logs JSON estruturados (para Cloud Logging)
// ✅ Metadados: build_id, revision, deploy_by

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";
import chalk from "chalk";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const API_VERSION = "3.6.3";
let firebaseInitialized = false;
let db = null;

// 🧩 Middleware: adiciona X-Request-Id e log estruturado
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", requestId);

  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        version: API_VERSION,
        request_id: requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
      })
    );
  });
  next();
});

// 🔥 1️⃣ Inicializa Firebase via Base64
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

// 🔥 2️⃣ Fallback: arquivo físico
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

// ⚙️ Firestore
if (firebaseInitialized) db = admin.firestore();

// 🧠 Registro de versão com deduplicação e histórico
async function registrarVersao() {
  if (!db) return;

  const nowIso = new Date().toISOString();
  const revision = process.env.K_REVISION || "unknown";
  const build_id = process.env.BUILD_ID || null;
  const deploy_by = process.env.DEPLOY_BY || "Fabricio Menezes";
  const firebase_mode = process.env.FIREBASE_CREDENTIALS_B64 ? "base64" : "file";

  const versionData = {
    version: API_VERSION,
    timestamp: nowIso,
    status: "success",
    firebase_mode,
    node_env: process.env.NODE_ENV || "unknown",
    revision,
    build_id,
    deploy_by,
  };

  const idxDocRef = db.collection("system_info").doc("version_info");
  const historyDocRef = db.collection("system_info").doc("version_history");
  const perRevisionRef = db.collection("system_info").doc(`version_rev_${revision}`);

  try {
    await db.runTransaction(async (tx) => {
      const revSnap = await tx.get(perRevisionRef);
      if (!revSnap.exists) tx.set(perRevisionRef, versionData);

      tx.set(idxDocRef, versionData);

      const histSnap = await tx.get(historyDocRef);
      const old = histSnap.exists ? (histSnap.data().history || []) : [];

      const merged = [versionData, ...old].filter((item, i, arr) => {
        const firstIdx = arr.findIndex(
          (x) => (x.revision && item.revision && x.revision === item.revision)
        );
        return firstIdx === i;
      });

      merged.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
      const trimmed = merged.slice(0, 5);

      tx.set(historyDocRef, { history: trimmed });
    });

    console.log(chalk.magentaBright(`🧩 Versão registrada: v${API_VERSION} — rev=${revision}`));
  } catch (err) {
    console.error(chalk.red("❌ Falha ao registrar versão/histórico:"), err.message);
  }
}

if (firebaseInitialized) registrarVersao();

// 🩺 Health Check
app.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok",
    version: API_VERSION,
    revision: process.env.K_REVISION || "unknown",
    uptime_seconds: process.uptime(),
  });
});

// 🧭 Diagnóstico
app.get("/debug-env", (_req, res) => {
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
  });
});

// 🧪 Teste Firebase
app.get("/test-firebase", async (_req, res) => {
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

// 🧾 Versão atual
app.get("/version-info", async (_req, res) => {
  try {
    const doc = await db.collection("system_info").doc("version_info").get();
    if (!doc.exists) return res.status(404).json({ error: "Nenhuma versão registrada" });
    res.json({ version: API_VERSION, firestore_data: doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🧱 Histórico
app.get("/version-history", async (_req, res) => {
  try {
    const doc = await db.collection("system_info").doc("version_history").get();
    if (!doc.exists) return res.status(404).json({ error: "Nenhum histórico disponível" });
    res.json({ version: API_VERSION, history: doc.data().history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🌐 Raiz
app.get("/", (_req, res) => {
  res.send(`🌍 TravelMundo API v${API_VERSION} está rodando com sucesso!`);
});

// 🚀 Server local
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(chalk.blueBright(`🚀 Servidor ativo na porta ${PORT} — v${API_VERSION}`));
});
