// ============================================================
// 🌍 TravelMundo IA - API v3.2.1
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
const credPath = "/etc/secrets/firebase-service-account.json";
let db = null;

try {
  if (fs.existsSync(credPath)) {
    console.log(`🔑 Usando credencial Firebase em: ${credPath}`);
    const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    db = admin.firestore();
    console.log("🔥 Firebase inicializado com sucesso!");
  } else {
    console.warn("⚠️ Arquivo de credencial não encontrado no caminho esperado.");
  }
} catch (error) {
  console.error("❌ Falha ao inicializar Firebase:", error);
}

// ============================================================
// ✅ Health Check
// ============================================================
app.get("/", (req, res) => {
  res.status(200).send("✅ TravelMundo IA API ativa e online!");
});

app.get("/ping", (req, res) => res.json({ message: "pong", version: "3.2.1" }));

// ============================================================
// 🧪 Teste de Conexão Firebase (corrigido)
// ============================================================
app.get("/test-firebase", async (req, res) => {
  try {
    if (!db) throw new Error("Firebase não configurado");
    const testRef = db.collection("test_connection").doc("ping");
    await testRef.set({ ok: true, time: new Date().toISOString() });
    res.status(200).json({ success: true, message: "Conexão com Firestore estabelecida!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔍 Diagnóstico do ambiente
// ============================================================
app.get("/debug-env", (req, res) => {
  const hasJson = fs.existsSync(credPath);
  const vars = {
    NODE_ENV: process.env.NODE_ENV || "(vazio)",
    HOTMART_SECRET: process.env.HOTMART_SECRET ? "✅ OK" : "❌ ausente",
  };
  res.json({
    message: "🔍 Diagnóstico do ambiente",
    has_FIREBASE_SERVICE_ACCOUNT_JSON: hasJson,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "(não definido)",
    firebase_inicializado: !!db,
    variaveis: vars,
  });
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

    if (!expectedToken) return res.status(500).json({ error: "Configuração ausente no servidor" });
    if (receivedToken !== expectedToken) return res.status(401).json({ error: "Assinatura inválida" });

    const event = req.body.event || req.body.event_name || req.body.status || "unknown";
    const email =
      req.body.email ||
      req.body.buyer_email ||
      req.body?.buyer?.email ||
      req.body?.data?.buyer?.email ||
      req.body?.data?.buyer_email;

    if (!email) return res.status(400).json({ error: "Email ausente no payload" });
    if (!db) return res.status(500).json({ error: "Firebase não configurado" });

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
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
        console.log(`✅ Créditos adicionados para ${email}`);
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
        console.log(`🔻 Assinatura cancelada para ${email}`);
        break;

      default:
        console.log(`ℹ️ Evento não tratado: ${event}`);
        break;
    }

    res.status(200).json({ success: true, event });
  } catch (error) {
    console.error(`🔥 Erro no webhook:`, error);
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
