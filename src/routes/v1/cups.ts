import { Router } from "express";
import { CUP_PAIRINGS } from "../../game/fameCatalog.js";
import { getCupByCode, listCups } from "../../services/seasons.js";
import type { CupCode } from "../../db/schema.js";

export const cupsRouter = Router();

const CUP_CODES = CUP_PAIRINGS.map((p) => p.code);

cupsRouter.get("/", async (_req, res, next) => {
  try {
    const data = await listCups();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

cupsRouter.get("/:code", async (req, res, next) => {
  try {
    const code = req.params.code as CupCode;
    if (!(CUP_CODES as string[]).includes(code)) {
      res.status(400).json({ error: { message: "Unknown cup code" } });
      return;
    }
    const data = await getCupByCode(code);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
