import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";
import chalk from "chalk"; // ← biblioteca para logs coloridos (já vem no Node >=18)

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

console.log(chalk.cyanBright("🌍 Iniciando TravelMundo API..."));

// ======================================================
// 🔥 Função de inicialização Firebase com fallback total
// ======================================================
function initializeFirebase() {
  const jsonPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "/secrets/serviceAccountKey.json";
  let initialized = false;

  try {
    // 1️⃣ Fallback absoluto: variável base64
    if (process.env.FIREBASE_CREDENTIALS_B64) {
      console.log(chalk.yellow("🧩 Detectada variável FIREBASE_CREDENTIALS_B64 — decodificando..."));
      const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_B64, "base64").toString("utf8");
      const creds = JSON.parse(decoded);
      admin.initializeApp({ credential: admin.credential.cert(creds) });
      console.log(chalk.greenBright("🔥 Firebase inicializado via variável base64!"));
      initialized = true;
    }

    // 2️⃣ Caminho padrão (arquivo físico)
    else if (fs.existsSync(jsonPath)) {
      console.log(chalk.blueBright(`📂 Detectado arquivo Firebase em: ${jsonPath}`));
      const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log(chalk.greenBright("🔥 Firebase inicializado via arquivo local!"));
      initialized = true;
    } else {
      console.warn(chalk.red("⚠️ Nenhum método de autenticação Firebase encontrado."));
    }
  } catch (error) {
    console.error(chalk.bgRed.white("❌ Erro ao inicializar o Firebase:"), error.message);
  }

  return initialized;
}

const firebaseReady = initializeFirebase();
const db = admin.apps.length ? admin.firestore() : null;

// ======================================================
// 🧠 Diagnóstico de ambiente
// ======================================================
app.get("/debug-env", (req, res) => {
  const jsonPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "/secrets/serviceAccountKey.json";
  const hasFile = fs.existsSync(jsonPath);
  res.json({
    message: "🔍 Diagnóstico do ambiente",
    has_FIREBASE_SERVICE_ACCOUNT_JSON: hasFile,
    GOOGLE_APPLICATION_CREDENTIALS: jsonPath,
    firebase_inicializado: firebaseReady,
    variaveis: {
      NODE_ENV: process.env.NODE_ENV || "❌ ausente",
      HOTMART_SECRET: process.env.HOTMART_SECRET ? "✅ OK" : "❌ ausente",
      FIREBASE_CREDENTIALS_B64: !!process.env.FIREBASE_CREDENTIALS_B64,
    },
  });
});

// ======================================================
// 🧩 Diagnóstico direto do Secret (verifica conteúdo)
// ======================================================
app.get("/debug-secret", (req, res) => {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS || "/secrets/serviceAccountKey.json";
  const exists = fs.existsSync(path);
  let details = null;

  if (exists) {
    try {
      const content = fs.readFileSync(path, "utf8");
      const parsed = JSON.parse(content);
      details = {
        project_id: parsed.project_id,
        client_email: parsed.client_email,
      };
    } catch (e) {
      details = { error: e.message };
    }
  }

  res.json({ path, exists, details });
});

// ======================================================
// 🔥 Testa conexão Firebase
// ======================================================
app.get("/test-firebase", async (req, res) => {
  try {
    if (!db) throw new Error("Firebase não configurado");
    const testDoc = db.collection("test_connection").doc("status");
    await testDoc.set({ ok: true, timestamp: new Date().toISOString() });
    const snap = await testDoc.get();
    res.json({ success: true, data: snap.data() });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ======================================================
// 🌐 Inicia servidor
// ======================================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(chalk.magentaBright(`✅ Servidor rodando na porta ${PORT}`));
});
