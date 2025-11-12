// 🌍 TravelMundo API — v3.6.1 (Firebase + Hotmart + Histórico de Versões)
// -------------------------------------------------------------------------
// ✅ Firebase Base64 + Fallback de arquivo físico
// ✅ Registro automático da versão atual no Firestore
// ✅ Histórico de versões (mantém as 5 últimas)
// ✅ Endpoints: /debug-env, /test-firebase, /version-info, /version-history

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

const API_VERSION = "3.6.1";
let firebaseInitialized = false;
let db = null;

// 🔥 1️⃣ Inicializa o Firebase via Base64
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

// 🔥 2️⃣ Se não der via Base64, tenta o arquivo físico
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

// 🧠 3️⃣ Registro e histórico automático de versões
async function registrarVersao() {
  if (!db) return;

  const versionData = {
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    status: "success",
    firebase_mode: process.env.FIREBASE_CREDENTIALS_B64 ? "base64" : "file",
    node_env: process.env.NODE_ENV || "unknown",
  };

  try {
    const infoRef = db.collection("system_info").doc("version_info");
    await infoRef.set(versionData);
    console.log(chalk.magentaBright(`🧩 Versão registrada no Firestore: v${API_VERSION}`));

    // Adiciona ao histórico
    const historyRef = db.collection("system_info").doc("version_history");
    const snap = await historyRef.get();
    const history = snap.exists ? snap.data().history || [] : [];

    // Adiciona a nova versão no topo
    history.unshift(versionData);

    // Mantém apenas as 5 últimas
    const trimmed = history.slice(0, 5);

    await historyRef.set({ history: trimmed });
    console.log(chalk.yellowBright("📜 Histórico de versões atualizado (últimas 5)."));
  } catch (err) {
    console.error(chalk.red("❌ Falha ao registrar versão/histórico no Firestore:"), err.message);
  }
}

// Chama o registro ao inicializar
if (firebaseInitialized) registrarVersao();

// 🧭 ENDPOINT — Diagnóstico do ambiente
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

// 🧪 ENDPOINT — Teste de Firestore
app.get("/test-firebase", async (req, res) => {
  if (!firebaseInitialized || !db) {
    return res.status(500).json({ error: "Firebase não configurado" });
  }
  try {
    const testRef = db.collection("test_connection").doc("ping");
    await testRef.set({ ok: true, ts: new Date().toISOString() });
    const snap = await testRef.get();
    res.json({ status: "ok", firestore_data: snap.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🧾 ENDPOINT — Versão atual
app.get("/version-info", async (req, res) => {
  try {
    const doc = await db.collection("system_info").doc("version_info").get();
    if (!doc.exists) return res.status(404).json({ error: "Nenhuma versão registrada" });
    res.json({ version: API_VERSION, firestore_data: doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🧱 ENDPOINT — Histórico de versões
app.get("/version-history", async (req, res) => {
  try {
    const doc = await db.collection("system_info").doc("version_history").get();
    if (!doc.exists) return res.status(404).json({ error: "Nenhum histórico disponível" });
    res.json({ version: API_VERSION, history: doc.data().history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🌐 ENDPOINT — Página inicial
app.get("/", (req, res) => {
  res.send(`🌍 TravelMundo API v${API_VERSION} está rodando com sucesso!`);
});

// 🚀 Inicializa servidor local
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(chalk.blueBright(`🚀 Servidor ativo na porta ${PORT} — v${API_VERSION}`));
});
