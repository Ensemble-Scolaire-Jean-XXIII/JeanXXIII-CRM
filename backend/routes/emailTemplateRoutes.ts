import { Router } from "express";
import * as emailTemplateService from "../services/emailTemplateService";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const templates = await emailTemplateService.getAllEmailTemplates();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const template = await emailTemplateService.getEmailTemplateById(
      req.params.id as string,
    );
    if (!template) return res.status(404).json({ error: "Not found" });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.post("/", authenticate, async (req: any, res) => {
  try {
    const id = await emailTemplateService.createEmailTemplate(
      req.body,
      req.user.id,
    );
    res.status(201).json({ id });
  } catch (error: any) {
    if (error.message === "DUPLICATE_NAME" || error.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ error: "Un template avec ce nom existe déjà." });
    }
    if (error.message === "NAME_TOO_LONG") {
      return res
        .status(400)
        .json({ error: "Le nom ne doit pas dépasser 100 caractères." });
    }
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.put("/:id", authenticate, async (req: any, res) => {
  try {
    await emailTemplateService.updateEmailTemplate(
      req.params.id as string,
      req.body,
      req.user.id,
    );
    res.status(204).send();
  } catch (error: any) {
    if (error.message === "DUPLICATE_NAME" || error.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ error: "Un template avec ce nom existe déjà." });
    }
    if (error.message === "NAME_TOO_LONG") {
      return res
        .status(400)
        .json({ error: "Le nom ne doit pas dépasser 100 caractères." });
    }
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.delete("/:id", authenticate, async (req: any, res) => {
  try {
    await emailTemplateService.deleteEmailTemplate(
      req.params.id as string,
      req.user.id,
    );
    res.status(204).send();
  } catch (error: any) {
    if (error.message && error.message.includes("Impossible de supprimer")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

export default router;
