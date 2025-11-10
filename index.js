// ============================================================
// 🌍 TravelMundo IA - API v3.3.0
// 🔐 Firebase via Secret Manager (fix AUTHENTICATION)
// ============================================================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ============================================================
// 🔥 Firebase Initialization
// ============================================================
function initFirebase() {
  try {
    let serviceAccount = null;

    // 🔹 Prioridade 1 — Secret Manager inline
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log("🔑 Carregando credenciais do Secret Manager (variável FIREBASE_SERVICE_ACCOUNT)...");
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (e) {
        console.error("❌ Erro ao fazer parse do Secret JSON:", e.message);
      }
    }

    // 🔹 Prioridade 2 — Caminho físico
    if (!serviceAccount && process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      console.log("📂 Lendo credenciais do arquivo:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
      serviceAccount = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
    }

    // 🔹 Prioridade 3 — Local dev fallback
    if (!serviceAccount && fs.existsSync("./serviceAccountKey.json")) {
      console.log("💾 Lendo credenciais locais ./serviceAccountKey.json");
      serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));
    }

    if (!serviceAccount) {
      console.error("❌ Nenhuma credencial Firebase encontrada!");
      return null;
    }

    // 🔧 Força o Project ID do Firestore
    const projectId = "gen-lang-client-0394942372";

    // ⚙️ Inicializa Firebase
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serviceAccount.project_id || projectId,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"), // <— 🔥 Corrige formatação da chave
      }),
      projectId,
    });

    console.log(`🔥 Firebase conectado com sucesso no projeto: ${projectId}`);
    return admin.firestore();
  } catch (err) {
    console.error("❌ Falha ao inicializar Firebase:", err);
    return null;
  }
}

const db = admin.apps.length ? admin.firestore() : initFirebase();

// ============================================================
// ✅ Rotas básicas
// ============================================================
app.get("/", (req, res) => res.status(200).send("✅ TravelMundo IA API ativa e online!"));
app.get("/ping", (req, res) => res.json({ message: "pong", version: "3.3.0" }));

// ============================================================
// 🔎 Diagnóstico de Firebase
// ============================================================
app.get("/test-firebase", async (req, res) => {
  try {
    if (!db) throw new Error("Firebase não configurado");
    await db.collection("__test__").doc("ping").set({
      ok: true,
      source: "Cloud Run",
      time: new Date().toISOString(),
    });
    res.status(200).json({ success: true, message: "Conexão com Firestore estabelecida!" });
  } catch (err) {
    console.error("🔥 Erro de conexão com Firestore:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🚀 Inicialização do servidor
// ============================================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 TravelMundo API v3.3.0 rodando na porta ${PORT}`);
});
