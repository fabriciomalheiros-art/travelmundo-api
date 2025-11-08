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
    version: "2.1.0",
    environment: process.env.NODE_ENV || "production",
    message: "🌍 TravelMundo API v2.1 rodando com sucesso! 🚀"
  });
});

// ✅ Testar conexão com Firebase Firestore
app.get("/test-firebase", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, message: "Firebase não configurado" });
    }

    const testRef = db.collection("test").doc("connection");
    await testRef.set({ timestamp: new Date().toISOString() });

    const doc = await testRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Documento não encontrado" });
    }

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
    res.status(201).json({
      success: true,
      message: "Usuário cadastrado com sucesso!",
      user: userData
    });
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

// ✅ Webhook Hotmart (simulado)
app.post("/webhook", async (req, res) => {
  try {
    const { event, email, amount } = req.body;
    if (!event || !email) return res.status(400).json({ error: "Evento e email obrigatórios" });

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "Usuário não encontrado" });

    switch (event) {
      case "PURCHASE_APPROVED":
        await userRef.update({
          plan: "pro",
          credits: admin.firestore.FieldValue.increment(amount || 50),
          planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });
        return res.json({ success: true, message: "Compra processada. Plano PRO ativado." });
      case "REFUND":
      case "SUBSCRIPTION_CANCELED":
        await userRef.update({ plan: "free", planExpiresAt: null });
        return res.json({ success: true, message: "Plano cancelado, revertido para Free." });
      default:
        return res.json({ success: false, message: `Evento ignorado: ${event}` });
    }
  } catch (error) {
    console.error("Erro no webhook:", error);
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
  console.log(`🚀 TravelMundo API v2.1 running on port ${PORT}`)
);
