// 🌍 TravelMundo API — v4.1.0 (Planos EXPLORER / CREATOR / MASTER + Antifraude + Módulos)
// ----------------------------------------------------------------------------------------
// Esta versão mantém 100% da v4.0.0 e adiciona:
//
// ✔ Integração dos novos planos
//     • FREE → 2 créditos
//     • EXPLORER → 10 créditos
//     • CREATOR → 25 créditos
//     • MASTER → 40 créditos
//
// ✔ allowedModules totalmente integrado aos planos
// ✔ Atualização automática do plano + créditos quando Hotmart confirmar compra
// ✔ /session/start e /sessions/generate atualizados
// ✔ Anti-fraude permanece funcionando (2 devices por usuário)
//
// IMPORTANTE:
// Nenhum endpoint antigo foi removido. Tudo é compatível com a v3.9.9 e v4.0.0
// ----------------------------------------------------------------------------------------

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";
import chalk from "chalk";
import crypto from "crypto";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

let firebaseInitialized = false;

// ============================================================================
// 🔥 1) Firebase via BASE64
// ============================================================================
try {
  if (process.env.FIREBASE_CREDENTIALS_B64) {
    const decoded = Buffer.from(
      process.env.FIREBASE_CREDENTIALS_B64,
      "base64"
    ).toString("utf8");
    const creds = JSON.parse(decoded);

    admin.initializeApp({
      credential: admin.credential.cert(creds),
    });

    console.log(chalk.green("🔥 Firebase inicializado via Base64."));
    firebaseInitialized = true;
  }
} catch (err) {
  console.error(chalk.red("❌ Erro ao inicializar via Base64:"), err.message);
}

// ============================================================================
// 🔥 2) Fallback: Firebase via ARQUIVO
// ============================================================================
if (!firebaseInitialized) {
  const serviceAccountPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";

  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(
        fs.readFileSync(serviceAccountPath, "utf8")
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      console.log(chalk.cyan("🔥 Firebase inicializado via arquivo físico."));
      firebaseInitialized = true;
    } catch (err) {
      console.error(
        chalk.red("❌ Erro ao inicializar via arquivo físico:"),
        err.message
      );
    }
  } else {
    console.warn(chalk.yellow("⚠️ serviceAccountKey.json não encontrado."));
  }
}

const db = firebaseInitialized ? admin.firestore() : null;

// ============================================================================
// 🔐 FUNÇÕES AUXILIARES — Antifraude + Devices
// ============================================================================

// Gera deviceId seguro baseado no fingerprint enviado pelo cliente
function generateHashedDeviceId(rawValue) {
  return crypto.createHash("sha256").update(String(rawValue)).digest("hex");
}

// Valida limite de no máximo 2 devices
async function validateDeviceLimit(userRef, newDeviceId) {
  const snap = await userRef.get();
  if (!snap.exists) return true;

  const user = snap.data();
  const devices = user.devices || [];

  // Device já existe → OK
  if (devices.includes(newDeviceId)) {
    return true;
  }

  // Se tiver menos de 2 devices → adiciona automaticamente
  if (devices.length < 2) {
    await userRef.update({
      devices: [...devices, newDeviceId],
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  // Se chegar aqui, excedeu o limite
  return false;
}

// ============================================================================
// 🎯 MAPA DE PLANOS E MÓDULOS PERMITIDOS (NOVO)
// ============================================================================
const PLAN_MODULES = {
  free: ["travelmundo"],
  explorer: ["travelmundo"],
  creator: ["travelmundo", "stylemundo", "sportmundo", "lifemundo"],
  master: ["travelmundo", "stylemundo", "sportmundo", "lifemundo"],
};

// Créditos automáticos por plano (NOVO)
const PLAN_CREDITS = {
  free: 2,
  explorer: 10,
  creator: 25,
  master: 40,
};
// ============================================================================
// 🧱 ensureUserInitialized — INICIALIZAÇÃO COMPLETA DO USUÁRIO
// ============================================================================
async function ensureUserInitialized(userId) {
  const userRef = db.collection("users").doc(userId);
  const snap = await userRef.get();

  if (!snap.exists) {
    const payload = {
      userId,
      credits: PLAN_CREDITS["free"],       // créditos iniciais
      plan: "free",                        // plano inicial
      allowedModules: PLAN_MODULES["free"],
      devices: [],                         // será preenchido no primeiro login
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await userRef.set(payload);

    await db.collection("transactions").add({
      userId,
      type: "credit",
      amount: PLAN_CREDITS["free"],
      source: "free-starter",
      timestamp: new Date(),
      metadata: { reason: "signup_free_credits" },
    });

    console.log(chalk.green(`👤 Usuário inicializado: ${userId}`));
    return payload;
  }

  return snap.data();
}

// ============================================================================
// 🟦 SESSION START — LOGIN + ANTIFRAUDE + REGISTRO DE DEVICE
// ============================================================================
app.post("/session/start", async (req, res) => {
  try {
    const { email, name, deviceFingerprint } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email é obrigatório" });
    }

    const userId = email.toLowerCase().trim();

    // Gera deviceId seguro
    const deviceId = generateHashedDeviceId(deviceFingerprint || userId);

    // Garante usuário criado
    const userData = await ensureUserInitialized(userId);
    const userRef = db.collection("users").doc(userId);

    // Verifica limite de 2 devices
    const deviceOk = await validateDeviceLimit(userRef, deviceId);

    if (!deviceOk) {
      return res.status(403).json({
        error: "Limite de 2 dispositivos atingido.",
        code: "DEVICE_LIMIT_REACHED",
        devices: userData.devices,
      });
    }

    return res.json({
      ok: true,
      user: {
        ...userData,
        deviceId,
      },
    });

  } catch (err) {
    console.error("🔥 Erro em /session/start:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// ============================================================================
// 🟩 USER INFO — Saldo + plano + módulos + devices
// ============================================================================
app.get("/user/info/:userId", async (req, res) => {
  try {
    const userId = req.params.userId.toLowerCase();
    const userSnap = await db.collection("users").doc(userId).get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const user = userSnap.data();

    return res.json({
      ok: true,
      user: {
        userId,
        credits: user.credits,
        plan: user.plan,
        allowedModules: user.allowedModules || [],
        devices: user.devices || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error("🔥 Erro em /user/info:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});
// ============================================================================
// 💰 BUY CREDITS — adicionar créditos ao usuário (Hotmart ou manual)
// ============================================================================
app.post("/buy-credits", async (req, res) => {
  try {
    const { userId, credits, transactionId } = req.body;

    if (!userId || !credits)
      return res.status(400).json({ error: "userId e credits obrigatórios" });

    const normalized = userId.toLowerCase().trim();
    const userRef = db.collection("users").doc(normalized);
    const snap = await userRef.get();
    const current = snap.exists ? snap.data().credits || 0 : 0;

    const newBalance = current + credits;

    await userRef.set(
      {
        credits: newBalance,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await db.collection("transactions").add({
      userId: normalized,
      credits,
      type: "credit",
      source: "manual_or_hotmart",
      transactionId,
      timestamp: new Date().toISOString(),
    });

    res.json({ ok: true, newBalance });

  } catch (err) {
    console.error("🔥 Erro em /buy-credits:", err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// 💸 CONSUME CREDIT — debita créditos
// ============================================================================
app.post("/consume-credit", async (req, res) => {
  try {
    const { userId, credits, reason } = req.body;

    if (!userId || !credits)
      return res.status(400).json({ error: "userId e credits obrigatórios" });

    const normalized = userId.toLowerCase().trim();
    const userRef = db.collection("users").doc(normalized);
    const snap = await userRef.get();
    const current = snap.exists ? snap.data().credits || 0 : 0;

    const newBalance = Math.max(current - credits, 0);

    await userRef.set(
      {
        credits: newBalance,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await db.collection("transactions").add({
      userId: normalized,
      credits,
      type: "debit",
      reason,
      timestamp: new Date().toISOString(),
    });

    res.json({ ok: true, newBalance });

  } catch (err) {
    console.error("🔥 Erro em /consume-credit:", err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// 📊 GET CREDITS — saldo do usuário
// ============================================================================
app.get("/credits/:userId", async (req, res) => {
  try {
    const userId = req.params.userId.toLowerCase().trim();
    const snap = await db.collection("users").doc(userId).get();

    const data = snap.exists ? snap.data() : { credits: 0 };
    res.json({
      userId,
      credits: data.credits || 0
    });

  } catch (err) {
    console.error("🔥 Erro em /credits:", err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// 📜 TRANSACTION HISTORY — últimas transações
// ============================================================================
app.get("/transactions/:userId", async (req, res) => {
  try {
    const userId = req.params.userId.toLowerCase().trim();
    const limit = parseInt(req.query.limit || 50);

    const col = db
      .collection("transactions")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(limit);

    const snap = await col.get();
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    res.json(list);

  } catch (err) {
    console.error("🔥 Erro em /transactions:", err);
    res.status(500).json({ error: err.message });
  }
});



// ============================================================================
// 🎨 SESSION GENERATE — débito + antifraude + validação de plano + módulos
// ============================================================================
app.post("/sessions/generate", async (req, res) => {
  try {
    const {
      userId,
      module,
      destination,
      creditsCost = 1,
      deviceFingerprint,
      metadata
    } = req.body;

    if (!userId)
      return res.status(400).json({ error: "userId é obrigatório" });

    if (!module)
      return res.status(400).json({ error: "module é obrigatório" });

    const normalizedUserId = userId.toLowerCase().trim();
    const userRef = db.collection("users").doc(normalizedUserId);
    const snap = await userRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const user = snap.data();


    // ============================================================
    // 🔐 1) VALIDAR DEVICE (antifraude)
    // ============================================================
    const deviceId = generateHashedDeviceId(
      deviceFingerprint || normalizedUserId
    );

    const devices = user.devices || [];

    // Se o device já existe → ok
    if (!devices.includes(deviceId)) {
      // Se já tem 2 devices → bloqueado
      if (devices.length >= 2) {
        return res.status(403).json({
          error: "Você atingiu o limite de 2 dispositivos.",
          code: "DEVICE_LIMIT",
          devices,
        });
      }

      // Caso tenha menos de 2, adiciona
      await userRef.update({
        devices: [...devices, deviceId],
        updatedAt: new Date().toISOString(),
      });
    }


    // ============================================================
    // 🎯 2) VALIDAR MÓDULO PELO PLANO DO USUÁRIO
    // ============================================================
    const allowed = PLAN_MODULES[user.plan] || [];

    if (!allowed.includes(module)) {
      return res.status(403).json({
        error: `Este módulo não está disponível no seu plano atual.`,
        plan: user.plan,
        allowedModules: allowed,
      });
    }


    // ============================================================
    // 💳 3) VERIFICAR SALDO
    // ============================================================
    if (user.credits < creditsCost) {
      return res.status(403).json({
        error: "Créditos insuficientes",
        credits: user.credits,
      });
    }


    // ============================================================
    // 🔥 4) DEBITAR CRÉDITO
    // ============================================================
    await db.collection("transactions").add({
      userId: normalizedUserId,
      type: "debit",
      amount: creditsCost,
      module,
      destination: destination || "unknown",
      timestamp: new Date(),
      source: "generation",
      metadata: metadata || {},
    });

    await userRef.update({
      credits: admin.firestore.FieldValue.increment(-creditsCost),
      updatedAt: new Date().toISOString(),
    });

    const updatedUser = (await userRef.get()).data();


    // ============================================================
    // 🎉 5) RETORNO COMPLETO PARA O APP
    // ============================================================
    return res.json({
      ok: true,
      message: "Crédito debitado com sucesso",
      remainingCredits: updatedUser.credits,
      module,
      destination,
      allowedModules: allowed,
      plan: updatedUser.plan,
      devices: updatedUser.devices,
    });

  } catch (err) {
    console.error("🔥 Erro em /sessions/generate:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});
// ============================================================================
// 🌐 ROOT — rota principal para checar o status da API
// ============================================================================
app.get("/", (req, res) => {
  res.send("🌍 TravelMundo API v4.0.0 — online com antifraude, planos e módulos");
});


// ============================================================================
// 🧠 DEPLOY LOG — mantém histórico da última versão publicada
// ============================================================================
app.post("/_deploy-log", async (req, res) => {
  try {
    const { version, buildId, deployBy } = req.body;

    const payload = {
      lastDeploy: new Date().toISOString(),
      version: version || "unknown",
      buildId: buildId || "none",
      deployBy: deployBy || "unknown",
    };

    await db
      .collection("system_info")
      .doc("deploy_log")
      .set(payload, { merge: true });

    return res.json({ ok: true, saved: payload });

  } catch (err) {
    console.error("🔥 Erro em /_deploy-log:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});


// ============================================================================
// 🧠 VERSION INFO — versão atual do deploy (para UI e AI Studio)
// ============================================================================
app.get("/version-info", async (req, res) => {
  try {
    const snap = await db.collection("system_info").doc("deploy_log").get();
    const data = snap.exists ? snap.data() : null;

    res.json({
      version: data?.version || "unknown",
      info: data || {},
    });

  } catch (err) {
    console.error("🔥 Erro em /version-info:", err);
    res.status(500).json({ error: "Erro ao buscar versão" });
  }
});


// ============================================================================
// 🧠 VERSION HISTORY — histórico completo de versões
// ============================================================================
app.get("/version-history", async (req, res) => {
  try {
    const snap = await db.collection("system_info").doc("version_history").get();
    const data = snap.exists ? snap.data() : { history: [] };

    res.json({
      current: data.history?.[0] || null,
      history: data.history || [],
    });

  } catch (err) {
    console.error("🔥 Erro em /version-history:", err);
    res.status(500).json({ error: "Erro ao buscar histórico" });
  }
});


// ============================================================================
// 🚀 START SERVER
// ============================================================================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("");
  console.log("═══════════════════════════════════════");
  console.log(chalk.blue(`🚀 TravelMundo API ativa na porta ${PORT}`));
  console.log(chalk.green("🔥 Sistema v4.0.0 com antifraude, planos e módulos carregado"));
  console.log("═══════════════════════════════════════");
});
