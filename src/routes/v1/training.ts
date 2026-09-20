import { Router } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import {
  claimTraining,
  finishTrainingNow,
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

/** Skip the timer — costs stars (premium), full rewards. */
trainingRouter.post("/finish-now", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const data = await finishTrainingNow(user.id);
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
