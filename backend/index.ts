import express from "express";
import { Request, Response, NextFunction } from "express";
import cors from "cors";
import cron from "node-cron";
import prospectRoutes from "./routes/prospectRoutes";
import userRoutes from "./routes/userRoutes";
import statusRoutes from "./routes/statusRoutes";
import emailTemplateRoutes from "./routes/emailTemplateRoutes";
import countryRoutes from "./routes/countryRoutes";
import automationRoutes from "./routes/automationRoutes";
import lexpressRoutes from "./routes/lexpressRoutes";
import formationRoutes from "./routes/formationRoutes";
import auditLogRoutes from "./routes/auditLogRoutes";
import webhookRoutes from "./routes/webhookRoutes";
import settingRoutes from "./routes/settingRoutes";

import { authenticate } from "./middleware/auth";
import { processAutomations } from "./services/automationService";
import { syncLatestLexpressSubmissionsToDb } from "./services/lexpressService";
import { FRONTEND_URL } from "./config/appConfig";
import { pool } from "./config/db";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET manquant ou trop court (32 caractères minimum) — générer : openssl rand -hex 32",
  );
}

const app = express();
const PORT = process.env.PORT || 5000;

app.disable("x-powered-by");

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-webhook-secret"],
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Healthcheck DB en échec :", error);
    res.status(503).json({ status: "error" });
  }
});

app.use("/api/settings", settingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/prospects", authenticate, prospectRoutes);
app.use("/api/statuses", authenticate, statusRoutes);
app.use("/api/email-templates", authenticate, emailTemplateRoutes);
app.use("/api/countries", authenticate, countryRoutes);
app.use("/api/automations", authenticate, automationRoutes);
app.use("/api/lexpress", authenticate, lexpressRoutes);
app.use("/api/formations", authenticate, formationRoutes);
app.use("/api/audit-logs", authenticate, auditLogRoutes);
app.use("/api/webhooks", webhookRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Erreur non gérée :", err);
  res.status(500).json({ error: "Erreur interne au serveur" });
});

cron.schedule("*/2 * * * *", async () => {
  console.log("CRON : Lancement du traitement des automatisations...");
  try {
    await processAutomations();
    console.log("CRON : Traitement réussie.");
  } catch (error) {
    console.error("CRON : Échec du traitement", error);
  }
});

cron.schedule("*/15 * * * *", async () => {
  console.log(
    "CRON : Lancement de la synchronisation incrémentale L'Express...",
  );
  try {
    await syncLatestLexpressSubmissionsToDb();
    console.log("CRON : Synchronisation réussie.");
  } catch (error) {
    console.error("CRON : Échec de la synchronisation", error);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
