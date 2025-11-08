import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

// 🔐 Carrega variáveis de ambiente
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔥 Inicialização segura do Firebase
const serviceAccountPath = path.resolve("serviceAccountKey.json");

if (!admin.apps.length && fs.existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("🔥 Firebase conectado com sucesso!");
} else {
  console.warn("⚠️ Arquivo serviceAccountKey.json não encontrado — Firebase não inicializado.");
}

// Instância do Firestore
const db = admin.apps.length ? admin.firestore() : null;

// ✅ Health check
app.get("/ping", (req, res) => {
  res.json({ message: "TravelMundo API online ✅" });
});

// ✅ Status geral
app.get("/status", (req, res) => {
  res.status(200).json({
    status: "ok",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "production",
    message: "🌍 TravelMundo API rodando com sucesso! 🚀🚀🚀🚀"
  });
});

// ✅ Testa a conexão com o Firebase
app.get("/test-firebase", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firebase não está configurado localmente." });

  try {
    // Escreve/atualiza um doc de saúde
    const ref = db.collection("health").doc("check");
    await ref.set(
      { ping: "pong", at: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    // Lê de volta
    const snap = await ref.get();
    return res.status(200).json({ ok: true, data: snap.data() });
  } catch (err) {
    console.error("🔥 Firebase test error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Registro de usuário no Firestore
app.post("/register", async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) return res.status(400).json({ error: "Email e nome são obrigatórios." });
    if (!db) return res.status(500).json({ error: "Firebase não configurado." });

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      return res.status(200).json({
        success: true,
        message: "Usuário já cadastrado.",
        user: userSnap.data()
      });
    }

    // Créditos iniciais padrão
    const userData = {
      name,
      email,
      credits: 10,
      createdAt: new Date().toISOString()
    };

    await userRef.set(userData);

    res.status(201).json({
      success: true,
      message: "Usuário cadastrado com sucesso!",
      user: userData
    });
  } catch (err) {
    console.error("❌ Erro no registro:", err);
    res.status(500).json({ error: "Falha ao registrar usuário.", details: err.message });
  }
});

// ✅ Consulta de créditos do usuário
app.get("/credits", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: "Email obrigatório." });
    if (!db) return res.status(500).json({ error: "Firebase não configurado." });

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const userData = userSnap.data();
    res.json({ email, credits: userData.credits, plan: "default", user: userData });
  } catch (err) {
    console.error("❌ Erro ao buscar créditos:", err);
    res.status(500).json({ error: "Erro ao consultar créditos.", details: err.message });
  }
});

// ✅ Deduz um crédito ao usar a IA
app.post("/deduct", async (req, res) => {
  try {
    const { email, module } = req.body;
    if (!email) return res.status(400).json({ error: "Email obrigatório." });
    if (!db) return res.status(500).json({ error: "Firebase não configurado." });

    const userRef = db.collection("users").doc(email);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const userData = userSnap.data();
    if (userData.credits <= 0) {
      return res.status(403).json({ error: "Créditos insuficientes." });
    }

    // Deduz 1 crédito e registra uso
    await userRef.update({
      credits: userData.credits - 1,
      lastUse: new Date().toISOString(),
      lastModule: module || "unknown"
    });

    res.json({
      success: true,
      message: "1 crédito deduzido com sucesso.",
      remainingCredits: userData.credits - 1
    });
  } catch (err) {
    console.error("❌ Erro ao deduzir crédito:", err);
    res.status(500).json({ error: "Falha ao deduzir crédito.", details: err.message });
  }
});

// ✅ Webhook Hotmart (placeholder)
app.post("/webhook", (req, res) => {
  console.log("🔔 Hotmart webhook recebido:", req.body);
  res.json({ success: true, message: "Webhook processado com sucesso!" });
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error("❌ API Error:", err);
  res.status(500).json({ error: "Internal Server Error", details: err.message });
});

// ✅ Rota raiz
app.get("/", (req, res) => {
  res.send("🚀 Bem-vindo à TravelMundo API — tudo está rodando perfeitamente!");
});

// ✅ Inicializa o servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 TravelMundo API running on port ${PORT}`));
