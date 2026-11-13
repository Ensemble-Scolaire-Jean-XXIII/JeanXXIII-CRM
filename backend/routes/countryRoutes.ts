import { Router } from "express";
import * as countryService from "../services/countryService";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const countries = await countryService.getAllCountries();
    res.json(countries);
  } catch (error) {
    res.status(500).json({ error: "Erreur interne au serveur" });
  }
});

export default router;
