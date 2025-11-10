// ============================================================
// 🌍 TravelMundo IA - API v3.1.7
// 🔐 Webhook Hotmart + Firebase via Secret Manager (Cloud Run Ready)
// ============================================================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();
const app = express();

// ✅ Middleware de parsing
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ============================================================
// 🔥 Inicialização Firebase (Cloud Run + Secret Manager)
// ============================================================
const credFromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS; // ex.: /etc/secrets/firebase-service-account
const credDefaultPath = "/etc/secrets/firebase-service-account"; // caminho do Secret montado
const localFallback = "./serviceAccountKey.json"; // fallback p/ ambiente local

function initFirebase() {
  try {
    let pathToCred =
      credFromEnv && fs.existsSync(credFromEnv)
        ? credFromEnv
        : fs.existsSync(credDefaultPath)
        ? credDefaultPath
        : fs.existsSync(localFallback)
        ? localFallback
        : null;

    if (!pathToCred) {
      console.warn("⚠️ Nenhum arquivo de credencial encontrado. Firebase não inicializado.");
      return null;
    }

    console.log(`🔑 Usando credencial Firebase em: ${pathToCred}`);
    const serviceAccount = JSON.parse(fs.readFileSync(pathToCred, "utf8"));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("🔥 Firebase conectado com sucesso!");
    return admin.firestore();
  } catch (e) {
    console.error("❌ Falha ao inicializar Firebase:", e);
    return null;
  }
}

const db = admin.apps.length ? admin.firestore() : initFirebase();

// ============================================================
// ✅ Health Check
// ============================================================
app.get("/", (req, res) => {
  res.status(200).send("✅ TravelMundo IA API ativa e online!");
});

app.get("/ping", (req, res) => res.json({ message: "pong", version: "3.1.7" }));

app.get("/test-firebase", async (req, res) => {
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
    const receivedToken = req.headers["x-hotmart-hottok"];
    const expectedToken = process.env.HOTMART_SECRET?.trim();

    console.log(`🔑 [${requestId}] Token recebido: ${receivedToken || "(vazio)"}`);
    console.log(`🔍 [${requestId}] Comparando com variável HOTMART_SECRET`);

    if (!expectedToken) {
      console.error(`❌ [${requestId}] HOTMART_SECRET ausente nas variáveis de ambiente`);
      return res.status(500).json({ error: "Configuração ausente no servidor" });
    }

    if (receivedToken !== expectedToken) {
      console.warn(`🚫 [${requestId}] Token inválido`);
      return res.status(401).json({ error: "Assinatura inválida" });
    }

    // 🧩 Log básico do payload
    console.log(`📦 [${requestId}] Tipo de conteúdo: ${req.headers["content-type"]}`);
    console.log(`🧠 [${requestId}] Body recebido:`, req.body);

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
  console.log(`🚀 TravelMundo API v3.1.7 rodando na porta ${PORT}`);
});
