import { Router } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import {
  buyFitnessItem,
  buyShopItem,
  buySpaItem,
  buyStarPack,
  completeWorkJob,
  getEconomyCatalog,
} from "../../services/economy.js";

export const economyRouter = Router();

economyRouter.get("/catalog", (_req, res) => {
  res.json({ data: getEconomyCatalog() });
});

const idBody = z.object({ id: z.string().min(1).max(64) });

economyRouter.post("/work", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { id } = idBody.parse(req.body);
    const player = await completeWorkJob(user.id, id);
    res.json({ data: { player } });
  } catch (err) {
    next(err);
  }
});

economyRouter.post("/shop", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { id } = idBody.parse(req.body);
    const player = await buyShopItem(user.id, id);
    res.json({ data: { player } });
  } catch (err) {
    next(err);
  }
});

economyRouter.post("/fitness", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { id } = idBody.parse(req.body);
    const player = await buyFitnessItem(user.id, id);
    res.json({ data: { player } });
  } catch (err) {
    next(err);
  }
});

economyRouter.post("/spa", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { id } = idBody.parse(req.body);
    const player = await buySpaItem(user.id, id);
    res.json({ data: { player } });
  } catch (err) {
    next(err);
  }
});

economyRouter.post("/stars", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { id } = idBody.parse(req.body);
    const player = await buyStarPack(user.id, id);
    res.json({ data: { player } });
  } catch (err) {
    next(err);
  }
});
