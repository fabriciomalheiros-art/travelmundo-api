import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";
import crypto from "crypto";

dotenv.config();
const app = express();

// ✅ Middlewares — suporta JSON e Form-UrlEncoded (Hotmart usa esse formato)
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 🔥 Inicialização Firebase
const serviceAccountPath = "./serviceAccountKey.json";
if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("🔥 Firebase conectado com sucesso!");
} else {
  console.warn("⚠️ Arquivo serviceAccountKey.json não encontrado — Firebase não inicializado.");
}
const db = admin.apps.length ? admin.firestore() : null;

// ✅ Função auxiliar: verifica expiração de plano
async function checkPlanExpiration(userRef) {
  const userSnap = await userRef.get();
  const data = userSnap.data();
  if (data.planExpiresAt && new Date(data.planExpiresAt) < new Date()) {
    await userRef.update({
      plan: "free",
      planExpiresAt: null
    });
    console.log(`⏳ Plano expirado para ${data.email}, rebaixado para Free`);
    return { ...data, plan: "free", planExpiresAt: null };
  }
  return data;
}

// ✅ Health check
app.get("/ping", (req, res) => {
  res.json({ message: "TravelMundo API online ✅" });
});

// ✅ Status geral
app.get("/status", (req, res) => {
  res.status(200).json({
    status: "ok",
    version: "3.1.0",
    environment: process.env.NODE_ENV || "production",
    message: "🌍 TravelMundo API v3.1 rodando com sucesso! 🚀"
  });
});

// ✅ Testar conexão Firebase
app.get("/test-firebase", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, message: "Firebase não configurado" });

    const testRef = db.collection("test").doc("connection");
    await testRef.set({ timestamp: new Date().toISOString() });

    const doc = await testRef.get();
    res.status(200).json({
      success: true,
      message: "Conexão com Firestore OK",
      data: doc.data()
    });
  } catch (error) {
    console.error("Erro ao testar Firebase:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Registrar novo usuário
app.post("/register", async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) return res.status(400).json({ error: "Email e nome obrigatórios" });
    if (!db) return res.status(500).json({ error: "Firebase não configurado" });

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      return res.status(200).json({
        success: true,
        message: "Usuário já cadastrado",
        user: userSnap.data()
      });
    }

    const userData = {
      name,
      email,
      credits: 10,
      plan: "free",
      createdAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      planExpiresAt: null
    };

    await userRef.set(userData);
    res.status(201).json({ success: true, message: "Usuário cadastrado com sucesso!", user: userData });
  } catch (error) {
    console.error("Erro ao registrar usuário:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Consultar créditos
app.get("/credits", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email obrigatório" });
    if (!db) return res.status(500).json({ error: "Firebase não configurado" });

    const userRef = db.collection("users").doc(email);
    const userData = await checkPlanExpiration(userRef);

    if (!userData) return res.status(404).json({ error: "Usuário não encontrado" });
    res.status(200).json(userData);
  } catch (error) {
    console.error("Erro ao consultar créditos:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Deduzir crédito
app.post("/deduct", async (req, res) => {
  try {
    const { email, module } = req.body;
    if (!email) return res.status(400).json({ error: "Email obrigatório" });
    if (!db) return res.status(500).json({ error: "Firebase não configurado" });

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "Usuário não encontrado" });

    const userData = await checkPlanExpiration(userRef);
    if (userData.credits <= 0) return res.status(400).json({ error: "Créditos insuficientes" });

    await userRef.update({
      credits: userData.credits - 1,
      lastUpdate: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: "1 crédito deduzido com sucesso",
      remainingCredits: userData.credits - 1,
      module
    });
  } catch (error) {
    console.error("Erro ao deduzir crédito:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Webhook Hotmart — compatível com payload form-urlencoded
app.post("/webhook", async (req, res) => {
  try {
    const hottok = req.headers["x-hotmart-hottok"];
    const secret = process.env.HOTMART_SECRET || "default_secret";

    console.log("🔐 Recebido Webhook Hotmart:", {
      headers: req.headers,
      body: req.body
    });

    // 🔒 Verifica token
    if (!hottok || hottok !== secret) {
      console.warn("❌ Token inválido recebido:", hottok);
      return res.status(400).json({ success: false, message: "Token inválido" });
    }

    const event = req.body.event || req.body.evento;
    const email = req.body.data?.buyer?.email || req.body.data?.buyer_email || req.body.email;

    if (!event || !email) {
      console.warn("⚠️ Webhook sem dados obrigatórios:", req.body);
      return res.status(400).json({ success: false, message: "Evento ou e-mail ausente" });
    }

    console.log(`📦 Evento recebido: ${event} para ${email}`);

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      console.warn("⚠️ Usuário não encontrado no Firestore:", email);
      return res.status(404).json({ success: false, message: "Usuário não encontrado" });
    }

    const userData = userSnap.data();

    switch (event) {
      case "PURCHASE_APPROVED":
      case "purchase.approved":
        await userRef.update({
          plan: "pro",
          credits: userData.credits + 50,
          planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          lastUpdate: new Date().toISOString()
        });
        await db.collection("transactions").add({
          email,
          type: "credit",
          amount: 50,
          event,
          timestamp: new Date().toISOString()
        });
        console.log(`💰 Compra aprovada para ${email}`);
        return res.status(200).json({ success: true, message: "Compra aprovada — plano PRO ativado" });

      case "REFUND":
      case "refund":
      case "SUBSCRIPTION_CANCELED":
      case "subscription_canceled":
        await userRef.update({
          plan: "free",
          planExpiresAt: null
        });
        await db.collection("transactions").add({
          email,
          type: "cancel/refund",
          event,
          timestamp: new Date().toISOString()
        });
        console.log(`⚠️ Plano revertido para ${email}`);
        return res.status(200).json({ success: true, message: "Plano revertido para FREE" });

      default:
        console.log("ℹ️ Evento ignorado:", event);
        return res.status(200).json({ success: true, message: `Evento ignorado: ${event}` });
    }
  } catch (error) {
    console.error("🚨 Erro no Webhook Hotmart:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Listar módulos
app.get("/modules", (req, res) => {
  res.json({
    modules: [
      { name: "TravelMundo IA", creditsPerUse: 1 },
      { name: "StyleMundo IA", creditsPerUse: 1 },
      { name: "SportMundo IA", creditsPerUse: 1 },
      { name: "LifeMundo IA", creditsPerUse: 1 }
    ]
  });
});

// ✅ Inicializa servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 TravelMundo API v3.1 rodando na porta ${PORT}`)
);

