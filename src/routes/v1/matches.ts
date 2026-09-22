import { Router } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import {
  getMatch,
  getNextFixture,
  playFixture,
  startTestMatch,
} from "../../services/matches.js";

export const matchesRouter = Router();

matchesRouter.post("/test", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const data = await startTestMatch(user.id);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

matchesRouter.get("/next", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const data = await getNextFixture(user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

matchesRouter.post("/fixtures/:id/play", async (req, res, next) => {
  try {
    const { user } = (req as unknown as AuthenticatedRequest).auth;
    const data = await playFixture(user.id, req.params.id!);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

matchesRouter.get("/:id", async (req, res, next) => {
  try {
    const data = await getMatch(req.params.id!);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
