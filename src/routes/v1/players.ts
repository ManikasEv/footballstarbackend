import { Router } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/error.js";
import {
  changePlayerPosition,
  createPlayerForUser,
  getPlayerByUserId,
} from "../../services/players.js";
import {
  changePositionSchema,
  createPlayerSchema,
} from "../../validators/player.js";

export const playersRouter = Router();

playersRouter.get("/me", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const player = await getPlayerByUserId(user.id);

    if (!player) {
      throw new AppError(404, "No player found for this account", "NO_PLAYER");
    }

    res.json({ data: player });
  } catch (err) {
    next(err);
  }
});

playersRouter.post("/", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const input = createPlayerSchema.parse(req.body);
    const player = await createPlayerForUser(user.id, input);

    res.status(201).json({ data: player });
  } catch (err) {
    next(err);
  }
});

/** Position can be changed whenever the player wants (Feature Bible). */
playersRouter.patch("/me/position", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { position } = changePositionSchema.parse(req.body);
    const player = await changePlayerPosition(user.id, position);

    res.json({ data: player });
  } catch (err) {
    next(err);
  }
});
