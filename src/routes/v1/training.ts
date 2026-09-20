import { Router } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import {
  cancelTraining,
  claimTraining,
  getTrainingState,
  refreshTrainingOffers,
  startTraining,
} from "../../services/training.js";
import { startTrainingSchema } from "../../validators/training.js";

export const trainingRouter = Router();

trainingRouter.get("/", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const data = await getTrainingState(user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

trainingRouter.post("/refresh", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const data = await refreshTrainingOffers(user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

trainingRouter.post("/start", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { offerId } = startTrainingSchema.parse(req.body);
    const data = await startTraining(user.id, offerId);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

trainingRouter.post("/cancel", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const data = await cancelTraining(user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

trainingRouter.post("/claim", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const data = await claimTraining(user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
