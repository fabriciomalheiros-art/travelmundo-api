// ============================================================
// 🌍 TravelMundo IA - API v3.2.1
// 🔐 Firebase via Secret (env JSON) + Webhook Hotmart + Diagnósticos
// ============================================================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();
const app = express();

// ✅ Parsing
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ============================================================
// 🔥 Inicialização Firebase (preferindo Secret em env)
// ============================================================
function initFirebase() {
  try {
    // 1) Tenta via variável de ambiente com JSON (Secret Manager)
    const jsonFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (jsonFromEnv && !admin.apps.length) {
      let creds = jsonFromEnv;
      // Pode vir com quebras escapadas; normaliza
      try {
        creds = JSON.parse(jsonFromEnv);
      } catch {
        // se já veio como objeto serializado, tenta normalizar
        creds = JSON.parse(JSON.stringify(jsonFromEnv));
      }

      // Garante que a chave privada tenha quebras de linha corretas
      if (creds.private_key && typeof creds.private_key === "string") {
        creds.private_key = creds.private_key.replace(/\\n/g, "\n");
      }

      admin.initializeApp({
        credential: admin.credential.cert(creds),
      });

      console.log("🔥 Firebase inicializado via FIREBASE_SERVICE_ACCOUNT_JSON (Secret).");
      return admin.firestore();
    }

    // 2) Fallback: arquivo local (dev)
    const localPath = "./serviceAccountKey.json";
    if (fs.existsSync(localPath) && !admin.apps.length) {
      const serviceAccount = JSON.parse(fs.readFileSync(localPath, "utf8"));
      if (serviceAccount.private_key && typeof serviceAccount.private_key === "string") {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("🔥 Firebase inicializado via arquivo local serviceAccountKey.json.");
      return admin.firestore();
    }

    console.warn("⚠️ Nenhuma credencial Firebase encontrada. Defina FIREBASE_SERVICE_ACCOUNT_JSON ou disponibilize serviceAccountKey.json");
    return null;
  } catch (e) {
    console.error("❌ Falha ao inicializar Firebase:", e);
    return null;
  }
}

const db = admin.apps.length ? admin.firestore() : initFirebase();

// ============================================================
// ✅ Health & Diagnóstico
// ============================================================
app.get("/", (_req, res) => res.status(200).send("✅ TravelMundo IA API ativa e online!"));

app.get("/ping", (_req, res) => {
  res.json({ message: "pong", version: "3.2.1" });
});

// Diagnóstico de ambiente (sem expor segredos!)
app.get("/debug-env", (_req, res) => {
  const dbg = {
    message: "🔍 Diagnóstico do ambiente",
    has_FIREBASE_SERVICE_ACCOUNT_JSON: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "(não definido)",
    firebase_inicializado: !!db,
    variaveis: {
      NODE_ENV: process.env.NODE_ENV || "(vazio)",
      HOTMART_SECRET: process.env.HOTMART_SECRET ? "✅ OK" : "❌ ausente",
    },
  };
  res.json(dbg);
});

// Teste Firestore
app.get("/test-firebase", async (_req, res) => {
  try {
    if (!db) throw new Error("Firebase não configurado");
    await db.collection("__test__").doc("ping").set({ ok: true, time: new Date().toISOString() });
    res.status(200).json({ success: true, message: "Conexão com Firestore estabelecida!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔔 Webhook Hotmart
// ============================================================
app.post("/webhook", async (req, res) => {
  const requestId = Math.random().toString(36).substring(2, 10);
  console.log(`\n🛰️ [${requestId}] Recebido webhook Hotmart`);

  try {
    const tokenRecebido = req.headers["x-hotmart-hottok"];
    const tokenEsperado = (process.env.HOTMART_SECRET || "").trim();

    if (!tokenEsperado) {
      console.error(`❌ [${requestId}] HOTMART_SECRET ausente nas variáveis`);
      return res.status(500).json({ error: "Configuração ausente no servidor" });
    }
    if (tokenRecebido !== tokenEsperado) {
      console.warn(`🚫 [${requestId}] Token inválido`);
      return res.status(401).json({ error: "Assinatura inválida" });
    }

    // Logs seguros do payload
    console.log(`📦 [${requestId}] Content-Type: ${req.headers["content-type"]}`);
    console.log(`🧠 [${requestId}] Keys no body:`, Object.keys(req.body || {}));

    const event =
      req.body.event || req.body.event_name || req.body.status || "unknown";
    const email =
      req.body.email ||
      req.body.buyer_email ||
      req.body?.buyer?.email ||
      req.body?.data?.buyer?.email ||
      req.body?.data?.buyer_email;

    if (!email) {
      console.error(`⚠️ [${requestId}] Email ausente no payload`);
      return res.status(400).json({ error: "Email ausente no payload" });
    }
    if (!db) {
      console.error(`❌ [${requestId}] Firebase não inicializado`);
      return res.status(500).json({ error: "Firebase não configurado" });
    }

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      console.log(`👤 [${requestId}] Criando novo usuário ${email}`);
      await userRef.set({
        email,
        plan: "free",
        credits: 0,
        createdAt: new Date().toISOString(),
      });
    }

    switch ((event || "").toLowerCase()) {
      case "purchase.approved":
      case "approved":
      case "purchase_approved":
        await userRef.update({
          plan: "pro",
          credits: admin.firestore.FieldValue.increment(50),
          planExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
          lastUpdate: new Date().toISOString(),
        });
        await db.collection("transactions").add({
          email,
          event,
          type: "credit",
          origin: "hotmart",
          createdAt: new Date().toISOString(),
        });
        console.log(`✅ [${requestId}] Compra aprovada → Créditos adicionados a ${email}`);
        break;

      case "subscription_canceled":
      case "canceled":
        await userRef.update({
          plan: "free",
          planExpiresAt: null,
          lastUpdate: new Date().toISOString(),
        });
        await db.collection("transactions").add({
          email,
          event,
          type: "canceled",
          origin: "hotmart",
          createdAt: new Date().toISOString(),
        });
        console.log(`🔻 [${requestId}] Assinatura cancelada para ${email}`);
        break;

      default:
        console.log(`ℹ️ [${requestId}] Evento não tratado: ${event}`);
        break;
    }

    res.status(200).json({ success: true, event });
  } catch (error) {
    console.error(`🔥 [${requestId}] Erro no webhook:`, error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// 🚀 Inicialização do servidor
// ============================================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 TravelMundo API v3.2.1 rodando na porta ${PORT}`);
});
