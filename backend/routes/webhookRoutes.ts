import { Router } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import * as prospectService from "../services/prospectService";
import { getOrCreateFormationByName } from "../services/formationService";
import { getCountryIdByName } from "../services/countryService";

const router = Router();

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.ip || "anonymous",
  message: { error: "Trop de requêtes. Réessayez plus tard." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/wordpress", webhookLimiter, async (req, res) => {
  const webhookSecret = req.headers["x-webhook-secret"];
  const expected = crypto
    .createHash("sha256")
    .update(String(process.env.WEBHOOK_SECRET || ""))
    .digest();
  const provided = crypto
    .createHash("sha256")
    .update(String(webhookSecret || ""))
    .digest();
  if (
    !webhookSecret ||
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const {
      "first-name": firstName,
      "last-name": lastName,
      email,
      phone,
      formation,
      gender,
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email requis" });
    }

    let formationId = null;
    if (formation) {
      formationId = await getOrCreateFormationByName(formation);
    }

    const defaultCountryId = await getCountryIdByName("France");

    const mappedGender = gender || "Non précisé";

    try {
      await prospectService.createProspect({
        first_name: firstName || "",
        last_name: lastName || "",
        email,
        phone: phone || "",
        gender: mappedGender,
        country_id: defaultCountryId || 1,
        status_id: 1,
        formation_id: formationId,
        last_action_date: new Date(),
      });
    } catch (err) {
      if (err instanceof Error && err.message === "EMAIL_EXISTS") {
        const existing = await prospectService.getProspectByEmail(email);
        if (existing) {
          await prospectService.updateProspect(existing.id, {
            first_name: firstName || existing.first_name,
            last_name: lastName || existing.last_name,
            phone: phone || existing.phone,
            formation_id: formationId || existing.formation_id,
            gender: mappedGender,
          });
        }
      } else {
        throw err;
      }
    }

    res
      .status(200)
      .json({ success: true, message: "Prospect traité avec succès" });
  } catch (error) {
    console.error("Erreur Webhook WP:", error);
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

export default router;
