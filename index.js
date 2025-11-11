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

// ============================================================
// 🔥 INICIALIZAÇÃO SEGURA DO FIREBASE (compatível com Cloud Run)
// ============================================================
let db = null;
try {
  const secretEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialsPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    "/secrets/firebase-service-account/service-account.json";

  if (secretEnv) {
    console.log("📦 Detectado FIREBASE_SERVICE_ACCOUNT_JSON vindo do Secret Manager.");

    const serviceAccount = JSON.parse(secretEnv);

    // Garante que o diretório /secrets existe
    const dir = credentialsPath.substring(0, credentialsPath.lastIndexOf("/"));
    fs.mkdirSync(dir, { recursive: true });

    // Grava o JSON físico (necessário para admin.credential.cert)
    fs.writeFileSync(credentialsPath, JSON.stringify(serviceAccount, null, 2));
    console.log(`📝 Credenciais gravadas em ${credentialsPath}`);
  }

  if (fs.existsSync(credentialsPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("🔥 Firebase inicializado com sucesso!");
  } else {
    console.warn("⚠️ Arquivo de credenciais Firebase não encontrado — inicialização ignorada.");
  }
} catch (error) {
  console.error("❌ Erro ao inicializar Firebase:", error);
}

// ============================================================
// 🧩 FUNÇÃO AUXILIAR: CHECAR EXPIRAÇÃO DE PLANO
// ============================================================
async function checkPlanExpiration(userRef) {
  const userSnap = await userRef.get();
  const data = userSnap.data();
  if (data.planExpiresAt && new Date(data.planExpiresAt) < new Date()) {
    await userRef.update({
      plan: "free",
      credits: 0
    });
  }
}

// ============================================================
// 🔍 ENDPOINTS DE DEBUG / TESTE
// ============================================================

// Diagnóstico geral do ambiente
app.get("/debug-env", (req, res) => {
  const hasSecret = !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "(não definido)";
  const firebaseOk = !!admin.apps.length;

  res.json({
    message: "🔍 Diagnóstico do ambiente",
    has_FIREBASE_SERVICE_ACCOUNT_JSON: hasSecret,
    GOOGLE_APPLICATION_CREDENTIALS: credsPath,
    firebase_inicializado: firebaseOk,
    variaveis: {
      NODE_ENV: process.env.NODE_ENV || "(não definido)",
      HOTMART_SECRET: process.env.HOTMART_SECRET ? "✅ OK" : "❌ Ausente"
    }
  });
});

// Teste básico de inicialização Firebase
app.get("/test-firebase", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Firebase não configurado" });
    await db.collection("test").doc("ping").set({ ok: true, ts: new Date() });
    res.json({ success: true, message: "🔥 Firebase operacional" });
  } catch (err) {
    console.error("Erro no test-firebase:", err);
    res.status(500).json({ error: err.message });
  }
});

// Teste completo de Firestore (gravação e leitura)
app.get("/test-firestore", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Firestore não inicializado" });

    const ref = db.collection("debug").doc("check");
    await ref.set({ status: "ok", updatedAt: new Date() });
    const snap = await ref.get();

    res.json({ firestore: snap.data() });
  } catch (err) {
    console.error("Erro no test-firestore:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🌐 ENDPOINT PRINCIPAL / STATUS
// ============================================================
app.get("/", (req, res) => {
  res.json({
    message: "🚀 TravelMundo API rodando com sucesso!",
    firebaseConectado: !!db,
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// 🚀 INICIALIZA SERVIDOR EXPRESS
// ============================================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Servidor online na porta ${PORT}`);
});
