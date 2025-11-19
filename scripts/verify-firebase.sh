#!/bin/bash
echo "🔍 Verificando integração do Firebase com o projeto ativo..."
echo "──────────────────────────────────────────────"

PROJECT_ID="gen-lang-client-0394942372"

# 1️⃣ Testa se os serviços Firebase estão habilitados
echo "🧩 Serviços Firebase habilitados:"
gcloud services list --enabled --project=$PROJECT_ID | grep firebase || echo "❌ Nenhum serviço Firebase habilitado!"

# 2️⃣ Testa acesso ao Firestore via Admin SDK
echo "──────────────────────────────────────────────"
echo "🧪 Testando Firestore..."

node - <<'EOF'
import admin from "firebase-admin";

try {
  const creds = JSON.parse(Buffer.from(process.env.FIREBASE_CREDENTIALS_B64, "base64").toString());
  admin.initializeApp({ credential: admin.credential.cert(creds) });
  const db = admin.firestore();

  const docRef = db.collection("test_connection").doc("verify_script");
  await docRef.set({ ok: true, at: new Date().toISOString(), from: "verify-firebase.sh" });
  const doc = await docRef.get();

  if (doc.exists) {
    console.log("✅ Firestore ativo e gravação confirmada.");
  } else {
    console.log("❌ Firestore sem permissão de gravação.");
  }
} catch (err) {
  console.error("🔥 Erro ao conectar ao Firestore:", err.message);
}
EOF

# 3️⃣ Testa se o Auth está habilitado
echo "──────────────────────────────────────────────"
echo "👤 Testando Firebase Auth..."

gcloud services list --enabled --project=$PROJECT_ID | grep identitytoolkit.googleapis.com >/dev/null
if [ $? -eq 0 ]; then
  echo "✅ Firebase Auth ativo."
else
  echo "⚠️ Auth ainda não habilitado. Rode:"
  echo "   gcloud services enable identitytoolkit.googleapis.com --project=$PROJECT_ID"
fi

# 4️⃣ Testa o Storage
echo "──────────────────────────────────────────────"
echo "🗂️ Testando Firebase Storage..."

gcloud services list --enabled --project=$PROJECT_ID | grep firebasestorage.googleapis.com >/dev/null
if [ $? -eq 0 ]; then
  echo "✅ Firebase Storage ativo."
else
  echo "⚠️ Storage ainda não habilitado. Rode:"
  echo "   gcloud services enable firebasestorage.googleapis.com --project=$PROJECT_ID"
fi

echo "──────────────────────────────────────────────"
echo "🏁 Verificação concluída."
