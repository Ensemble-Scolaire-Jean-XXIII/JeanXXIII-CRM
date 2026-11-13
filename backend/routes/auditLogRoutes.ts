import { Router } from "express";
import * as auditLogService from "../services/auditLogService";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get("/", authenticate, async (req: any, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const logs = await auditLogService.getLogs(page, limit);
    res.json(logs);
  } catch (error) {
    console.error("Erreur GET logs:", error);
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

export default router;
