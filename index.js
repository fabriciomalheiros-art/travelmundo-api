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

// ✅ Testa a conexão com o Firebase (rota única, sem duplicação)
app.get("/test-firebase", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Firebase não está configurado localmente." });

  try {
    // escreve/atualiza um doc de saúde
    const ref = db.collection("health").doc("check");
    await ref.set(
      { ping: "pong", at: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    // lê de volta
    const snap = await ref.get();
    return res.status(200).json({ ok: true, data: snap.data() });
  } catch (err) {
    console.error("🔥 Firebase test error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Endpoints atuais
app.get("/credits", (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: "Email required" });
  res.json({ email, credits: 3, plan: "free" });
});

app.post("/register", (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.status(400).json({ error: "Email and name required" });
  res.json({ success: true, message: "User registered", credits: 3 });
});

app.post("/deduct", (req, res) => {
  const { email, module } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  res.json({ success: true, message: "1 credit deducted", module });
});

app.post("/webhook", (req, res) => {
  console.log("🔔 Hotmart webhook received:", req.body);
  res.json({ success: true, message: "Webhook processed" });
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
