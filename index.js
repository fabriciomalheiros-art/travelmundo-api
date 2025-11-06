import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Health check endpoint
app.get("/ping", (req, res) => {
  res.json({ message: "TravelMundo API online ✅" });
});

// Mock endpoints (example structure)
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

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ API Error:", err);
  res.status(500).json({ error: "Internal Server Error", details: err.message });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 TravelMundo API running on port ${PORT}`));
