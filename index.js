// ============================================================
// 🌍 TravelMundo IA - API v3.2.1 (Diagnóstico de Firebase)
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
function initFirebase() {
  try {
    const credPaths = [
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
      "/etc/secrets/firebase-service-account",
      "./serviceAccountKey.json",
    ].filter(Boolean);

    let pathToUse = null;
    for (const path of credPaths) {
      if (fs.existsSync(path)) {
        pathToUse = path;
        break;
      }
    }

    if (!pathToUse) {
      console.warn("⚠️ Nenhum arquivo de credencial encontrado. Firebase não inicializado.");
      return null;
    }

    console.log(`🔑 Usando credencial Firebase em: ${pathToUse}`);
    const serviceAccount = JSON.parse(fs.readFileSync(pathToUse, "utf8"));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("🔥 Firebase conectado com sucesso!");
    return admin.firestore();
  } catch (err) {
    console.error("❌ Erro ao inicializar Firebase:", err);
    return null;
  }
}

const db = admin.apps.length ? admin.firestore() : initFirebase();

// ============================================================
// ✅ Health check
// ============================================================
app.get("/", (req, res) => res.send("✅ TravelMundo IA API ativa e online!"));
app.get("/ping", (req, res) => res.json({ message: "pong", version: "3.2.1" }));

// ============================================================
// 🧪 Diagnóstico de ambiente e Secret
// ============================================================
app.get("/debug-env", (req, res) => {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS || "N/A";
  const exists = fs.existsSync(path);
  const secretsFolderExists = fs.existsSync("/etc/secrets");
  const secretsFiles = secretsFolderExists ? fs.readdirSync("/etc/secrets") : [];

  res.json({
    message: "🔍 Diagnóstico do ambiente",
    GOOGLE_APPLICATION_CREDENTIALS: path,
    arquivoExiste: exists,
    pastaSecretsExiste: secretsFolderExists,
    conteudoPastaSecrets: secretsFiles,
    variaveis: {
      NODE_ENV: process.env.NODE_ENV || null,
      HOTMART_SECRET: process.env.HOTMART_SECRET ? "✅ OK" : "❌ AUSENTE",
    },
  });
});

// ============================================================
// 🔔 Webhook Hotmart (mantido igual)
// ============================================================
app.post("/webhook", async (req, res) => {
  const requestId = Math.random().toString(36).substring(2, 10);
  console.log(`\n🛰️ [${requestId}] Recebido webhook Hotmart`);

  try {
    const receivedToken = req.headers["x-hotmart-hottok"];
    const expectedToken = process.env.HOTMART_SECRET?.trim();

    if (!expectedToken) return res.status(500).json({ error: "HOTMART_SECRET ausente" });
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
      await userRef.set({ email, plan: "free", credits: 0, createdAt: new Date().toISOString() });
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
        console.log(`✅ Compra aprovada → Créditos adicionados a ${email}`);
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
  } catch (err) {
    console.error(`🔥 [${requestId}] Erro no webhook:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🚀 Inicialização
// ============================================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 TravelMundo IA v3.2.1 rodando na porta ${PORT}`));
