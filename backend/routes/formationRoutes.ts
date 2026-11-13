import { Router } from "express";
import * as formationService from "../services/formationService";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const formations = await formationService.getAllFormations();
    res.json(formations);
  } catch (error) {
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.post("/", authenticate, async (req: any, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Le nom est requis" });
    const id = await formationService.createFormation(name, req.user.id);
    res.status(201).json({ id });
  } catch (error: any) {
    if (error.message === "DUPLICATE_NAME" || error.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ error: "Une formation avec ce nom existe déjà." });
    }
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.put("/:id", authenticate, async (req: any, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Le nom est requis" });
    await formationService.updateFormation(
      Number(req.params.id),
      name,
      req.user.id,
    );
    res.status(204).send();
  } catch (error: any) {
    if (error.message === "DUPLICATE_NAME" || error.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ error: "Une formation avec ce nom existe déjà." });
    }
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

router.delete("/:id", authenticate, async (req: any, res) => {
  try {
    await formationService.deleteFormation(Number(req.params.id), req.user.id);
    res.status(204).send();
  } catch (error: any) {
    if (error.message && error.message.includes("Impossible de supprimer")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

export default router;
