import { Router } from "express";
import * as settingService from "../services/settingService";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get("/:key", async (req, res) => {
  try {
    const value = await settingService.getSetting(req.params.key);
    res.json({ enabled: value === "true" });
  } catch (error) {
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.put("/:key", authenticate, async (req: any, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { enabled } = req.body;
    await settingService.updateSetting(
      req.params.key,
      enabled ? "true" : "false",
      req.user.id,
    );
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

export default router;
