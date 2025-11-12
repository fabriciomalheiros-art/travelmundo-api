// 🌍 TravelMundo API — v3.6.2 (Firebase + Hotmart + Histórico robusto)
// ---------------------------------------------------------------------
// ✅ Firebase Base64 + fallback arquivo
// ✅ Registro de versão por revisão (de-duplicado via K_REVISION)
// ✅ Histórico com transação (mantém 5 mais recentes, sem duplicar)
// ✅ Metadados de deploy (build_id, deploy_by, revision)
// ✅ Endpoints: /debug-env, /test-firebase, /version-info, /version-history, /admin/rebuild-version-history

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

const API_VERSION = "3.6.2";
let firebaseInitialized = false;
let db = null;

// 🔥 1) Inicializa Firebase via Base64
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

// 🔥 2) Fallback: arquivo físico
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

// 🧠 Registro robusto de versão (uma por revisão)
async function registrarVersao() {
  if (!db) return;

  const nowIso = new Date().toISOString();
  const revision = process.env.K_REVISION || "unknown";
  const build_id = process.env.BUILD_ID || null;
  const deploy_by = process.env.DEPLOY_BY || "Fabricio Menezes"; // ajuste se quiser
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

  // Evita duplicar por revisão: gravamos também em system_info/versions/<revision>
  const idxDocRef = db.collection("system_info").doc("version_info");
  const historyDocRef = db.collection("system_info").doc("version_history");
  const perRevisionRef = db.collection("system_info").doc(`version_rev_${revision}`);

  try {
    await db.runTransaction(async (tx) => {
      // Se esta revisão já foi registrada, não duplica
      const revSnap = await tx.get(perRevisionRef);
      if (!revSnap.exists) {
        tx.set(perRevisionRef, versionData);
      }

      // Atualiza o "version_info" com a versão atual (sempre)
      tx.set(idxDocRef, versionData);

      // Atualiza histórico com deduplicação
      const histSnap = await tx.get(historyDocRef);
      const old = histSnap.exists ? (histSnap.data().history || []) : [];

      // De-duplica por (revision) ou por (version + timestamp)
      const merged = [versionData, ...old].filter((item, i, arr) => {
        const firstIdx = arr.findIndex(
          (x) =>
            (x.revision && item.revision && x.revision === item.revision) ||
            (x.version === item.version && x.timestamp === item.timestamp)
        );
        return firstIdx === i; // mantém apenas a primeira ocorrência
      });

      // Ordena desc por timestamp e limita a 5
      merged.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
      const trimmed = merged.slice(0, 5);

      tx.set(historyDocRef, { history: trimmed });
    });

    console.log(chalk.magentaBright(`🧩 Versão registrada: v${API_VERSION} — rev=${revision}`));
    console.log(chalk.yellowBright("📜 Histórico atualizado (máx 5, sem duplicatas)."));
  } catch (err) {
    console.error(chalk.red("❌ Falha ao registrar versão/histórico:"), err.message);
  }
}

if (firebaseInitialized) registrarVersao();

// 🧭 Diagnóstico
app.get("/debug-env", (_req, res) => {
  res.json({
    message: "🔍 Diagnóstico do ambiente",
    has_FIREBASE_SERVICE_ACCOUNT_JSON: fs.existsSync("./serviceAccountKey.json"),
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "(não definido)",
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

// 🧪 Teste de Firestore
app.get("/test-firebase", async (_req, res) => {
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

// 🧱 Histórico (5 últimas)
app.get("/version-history", async (_req, res) => {
  try {
    const doc = await db.collection("system_info").doc("version_history").get();
    if (!doc.exists) return res.status(404).json({ error: "Nenhum histórico disponível" });
    const hist = (doc.data().history || []).slice(0, 5);
    res.json({ version: API_VERSION, history: hist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🛠️ Admin: rebuild do histórico (protegido por HOTMART_SECRET)
app.post("/admin/rebuild-version-history", async (req, res) => {
  try {
    const token = req.headers["x-admin-token"];
    if (!process.env.HOTMART_SECRET || token !== process.env.HOTMART_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const historyRef = db.collection("system_info").doc("version_history");
    await historyRef.set({ history: [] });
    await registrarVersao(); // reinsere a versão atual como base
    const snap = await historyRef.get();
    res.json({ ok: true, new_history: snap.data() || {} });
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
