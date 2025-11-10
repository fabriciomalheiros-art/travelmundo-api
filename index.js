// ============================================================
// 🌍 TravelMundo IA - API v3.1.8
// 🔐 Webhook Hotmart + Firebase (compatível com Secret Manager)
// ============================================================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();
const app = express();

// ============================================================
// ⚙️ Configuração básica do servidor
// ============================================================
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ============================================================
// 🔥 Inicialização inteligente do Firebase (modo híbrido)
// ============================================================
function initFirebase() {
  try {
    // 1️⃣ Tentativa: credencial injetada como variável JSON (Secret Manager)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log("🔍 Detectado secret inline via variável FIREBASE_SERVICE_ACCOUNT");
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("🔥 Firebase inicializado via Secret Manager (variável JSON)");
      return admin.firestore();
    }

    // 2️⃣ Tentativa: arquivo referenciado pelo GOOGLE_APPLICATION_CREDENTIALS
    const credPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      "/etc/secrets/firebase-service-account" ||
      "./serviceAccountKey.json";

    if (fs.existsSync(credPath)) {
      console.log(`🔍 Detectado arquivo de credencial em: ${credPath}`);
      const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("🔥 Firebase inicializado via arquivo de credenciais");
      return admin.firestore();
    }

    // 3️⃣ Falha total
    console.warn("⚠️ Nenhum método de autenticação Firebase encontrado!");
    return null;
  } catch (err) {
    console.error("❌ Erro ao inicializar Firebase:", err);
    return null;
  }
}

// Inicializa Firebase se ainda não houver app
const db = admin.apps.length ? admin.firestore() : initFirebase();

// ============================================================
// ✅ Rotas de status e diagnóstico
// ============================================================
app.get("/", (req, res) => {
  res.status(200).send("✅ TravelMundo IA API ativa e online!");
});

app.get("/ping", (req, res) => res.json({ message: "pong", version: "3.1.8" }));

app.get("/status", (req, res) => {
  res.json({
    service: "TravelMundo IA",
    version: "3.1.8",
    firebase: !!db,
    env: process.env.NODE_ENV || "production",
    secretDetected: !!process.env.FIREBASE_SERVICE_ACCOUNT,
  });
});

app.get("/test-firebase", async (req, res) => {
  try {
    if (!db) throw new Error("Firebase não configurado");
    await db.collection("__test__").doc("ping").set({
      ok: true,
      time: new Date().toISOString(),
    });
    res.status(200).json({ success: true, message: "Conexão com Firestore estabelecida!" });
  } catch (err) {
    console.error("❌ Erro de conexão com Firestore:", err);
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
    const receivedToken = req.headers["x-hotmart-hottok"];
    const expectedToken = process.env.HOTMART_SECRET?.trim();

    console.log(`🔑 [${requestId}] Token recebido: ${receivedToken || "(vazio)"}`);
    console.log(`🔍 [${requestId}] Validando token...`);

    if (!expectedToken) {
      console.error(`❌ [${requestId}] HOTMART_SECRET ausente`);
      return res.status(500).json({ error: "Configuração ausente no servidor" });
    }

    if (receivedToken !== expectedToken) {
      console.warn(`🚫 [${requestId}] Token inválido`);
      return res.status(401).json({ error: "Assinatura inválida" });
    }

    const event = req.body.event || req.body.event_name || req.body.status || "unknown";
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

    switch (event.toLowerCase()) {
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
  console.log(`🚀 TravelMundo API v3.1.8 rodando na porta ${PORT}`);
});

