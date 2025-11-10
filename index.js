// ============================================
// 🌍 TravelMundo IA - API v3.1.3
// Atualizado para Webhook Hotmart compatível
// ============================================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";
import crypto from "crypto";

dotenv.config();
const app = express();

// ✅ Configurações globais de parsing
app.use(cors());
app.use(express.urlencoded({ extended: true })); // 🔥 Aceita x-www-form-urlencoded
app.use(express.json());
app.use(bodyParser.json());

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
    version: "3.1.3",
    environment: process.env.NODE_ENV || "production",
    message: "🌍 TravelMundo API v3.1.3 rodando com sucesso! 🚀"
  });
});

// ✅ Testar conexão com Firebase Firestore
app.get("/test-firebase", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, message: "Firebase não configurado" });
    const testRef = db.collection("test").doc("connection");
    await testRef.set({ timestamp: new Date().toISOString() });
    const doc = await testRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Documento não encontrado" });

    res.status(200).json({
      success: true,
      message: "Conexão com Firestore estabelecida com sucesso!",
      data: doc.data()
    });
  } catch (error) {
    console.error("Erro ao testar conexão com Firebase:", error);
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
      return res.status(200).json({ success: true, message: "Usuário já cadastrado", user: userSnap.data() });
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

// ✅ Deduzir 1 crédito
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

// ✅ Adicionar créditos manualmente
app.post("/add-credits", async (req, res) => {
  try {
    const { email, amount } = req.body;
    if (!email || !amount) return res.status(400).json({ error: "Email e quantidade obrigatórios" });

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "Usuário não encontrado" });

    const userData = userSnap.data();
    const newCredits = userData.credits + Number(amount);

    await userRef.update({
      credits: newCredits,
      lastUpdate: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: `${amount} créditos adicionados`,
      totalCredits: newCredits
    });
  } catch (error) {
    console.error("Erro ao adicionar créditos:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Atualizar plano
app.post("/upgrade-plan", async (req, res) => {
  try {
    const { email, plan } = req.body;
    if (!email || !plan) return res.status(400).json({ error: "Email e plano obrigatórios" });

    const plans = {
      free: { credits: 10, duration: 0 },
      pro: { credits: 50, duration: 30 },
      premium: { credits: 200, duration: 30 }
    };
    if (!plans[plan]) return res.status(400).json({ error: "Plano inválido" });

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "Usuário não encontrado" });

    const expiresAt = plans[plan].duration
      ? new Date(Date.now() + plans[plan].duration * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await userRef.update({
      plan,
      credits: plans[plan].credits,
      planExpiresAt: expiresAt,
      lastUpdate: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: `Plano atualizado para ${plan.toUpperCase()}`,
      plan,
      expiresAt
    });
  } catch (error) {
    console.error("Erro ao atualizar plano:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Webhook Hotmart — compatível com x-www-form-urlencoded e JSON
app.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-hotmart-hottok"];
    const secret = process.env.HOTMART_SECRET || "default_secret";

    console.log("🔔 Recebido webhook Hotmart");
    console.log("📦 Body recebido:", req.body);
    console.log("🔑 Token recebido:", signature);
    console.log("🔒 Token esperado:", secret);

    if (signature !== secret) {
      console.error("❌ Token inválido");
      return res.status(401).json({ error: "Assinatura inválida" });
    }

    const event =
      req.body.event || req.body.event_name || req.body.status || "unknown";
    const email =
      req.body.email ||
      req.body.buyer_email ||
      req.body?.data?.buyer?.email ||
      req.body?.data?.buyer_email;

    if (!email) {
      console.error("❌ Email ausente no payload:", req.body);
      return res.status(400).json({ error: "Email ausente no payload" });
    }

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      console.warn(`⚠️ Usuário ${email} não encontrado, criando novo...`);
      await userRef.set({
        email,
        plan: "free",
        credits: 0,
        createdAt: new Date().toISOString(),
      });
    }

    switch (event.toLowerCase()) {
      case "purchase.approved":
        await userRef.update({
          plan: "pro",
          credits: admin.firestore.FieldValue.increment(50),
          planExpiresAt: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
          lastUpdate: new Date().toISOString(),
        });
        await db.collection("transactions").add({
          email,
          type: "credit",
          event,
          timestamp: new Date().toISOString(),
        });
        console.log(`✅ Compra aprovada para ${email}`);
        return res.json({ success: true });

      case "subscription_canceled":
        await userRef.update({
          plan: "free",
          planExpiresAt: null,
          lastUpdate: new Date().toISOString(),
        });
        await db.collection("transactions").add({
          email,
          type: "canceled",
          event,
          timestamp: new Date().toISOString(),
        });
        console.log(`🔻 Assinatura cancelada para ${email}`);
        return res.json({ success: true });

      default:
        console.log(`ℹ️ Evento não tratado: ${event}`);
        return res.json({ success: true, ignored: event });
    }
  } catch (error) {
    console.error("🔥 Erro no Webhook Hotmart:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Listar módulos ativos
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
  console.log(`🚀 TravelMundo API v3.1.3 rodando na porta ${PORT}`)
);
