import { Router } from "express";
import * as prospectService from "../services/prospectService";
import { emailRegex } from "../utils/validators";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const prospects = await prospectService.getAllProspects();
    res.json(prospects);
  } catch (error) {
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const prospect = await prospectService.getProspectById(
      req.params.id as string,
    );
    if (!prospect) return res.status(404).json({ error: "Not found" });
    res.json(prospect);
  } catch (error) {
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.post("/", authenticate, async (req: any, res) => {
  try {
    if (!emailRegex.test(req.body.email)) {
      return res.status(400).json({ error: "Format d'email invalide" });
    }
    const id = await prospectService.createProspect(req.body, req.user.id);
    res.status(201).json({ id });
  } catch (error: any) {
    if (error.message === "EMAIL_EXISTS") {
      return res.status(409).json({ error: "Cet email est déjà utilisé" });
    }
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.post("/:id/send-email", authenticate, async (req, res) => {
  try {
    const { template_id } = req.body;
    if (!template_id) {
      return res.status(400).json({ error: "template_id est requis" });
    }

    await prospectService.sendEmailToProspect(
      req.params.id as string,
      template_id,
    );
    res.status(200).json({ message: "Email envoyé avec succès" });
  } catch (error: any) {
    console.error("Erreur d'envoi de mail:", error);
    res
      .status(500)
      .json({ error: error.message || "Erreur lors de l'envoi de l'email" });
  }
});

router.put("/:id", authenticate, async (req: any, res) => {
  try {
    if (req.body.email && !emailRegex.test(req.body.email)) {
      return res.status(400).json({ error: "Format d'email invalide" });
    }
    await prospectService.updateProspect(
      req.params.id as string,
      req.body,
      req.user.id,
    );
    res.status(204).send();
  } catch (error: any) {
    if (error.message === "EMAIL_EXISTS") {
      return res.status(409).json({ error: "Cet email est déjà utilisé" });
    }
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.delete("/:id", authenticate, async (req: any, res) => {
  try {
    await prospectService.deleteProspect(req.params.id as string, req.user.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

export default router;
