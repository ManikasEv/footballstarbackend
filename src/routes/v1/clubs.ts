import { Router } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import {
  createPlayerClub,
  getMyClub,
  leavePlayerClub,
  listLeagueClubs,
} from "../../services/clubs.js";
import { LEAGUE_TIERS } from "../../game/clubCatalog.js";

export const clubsRouter = Router();

clubsRouter.get("/me", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const club = await getMyClub(user.id);
    res.json({ data: { club } });
  } catch (err) {
    next(err);
  }
});

clubsRouter.get("/leagues/:tier", async (req, res, next) => {
  try {
    const tier = req.params.tier;
    if (!(LEAGUE_TIERS as string[]).includes(tier)) {
      res.status(400).json({ error: { message: "Unknown league tier" } });
      return;
    }
    const clubs = await listLeagueClubs(
      tier as (typeof LEAGUE_TIERS)[number],
    );
    res.json({ data: { tier, clubs } });
  } catch (err) {
    next(err);
  }
});

const createBody = z.object({
  name: z.string().trim().min(3).max(40),
});

clubsRouter.post("/", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { name } = createBody.parse(req.body);
    const result = await createPlayerClub(user.id, name);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

clubsRouter.post("/leave", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const player = await leavePlayerClub(user.id);
    res.json({ data: { player } });
  } catch (err) {
    next(err);
  }
});
