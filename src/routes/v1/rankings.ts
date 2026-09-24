import { Router } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getGlobalRankings } from "../../services/rankings.js";

export const rankingsRouter = Router();

rankingsRouter.get("/", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const data = await getGlobalRankings(user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
