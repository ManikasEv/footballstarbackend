import { Router } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getPlayerByUserId } from "../../services/players.js";

export const meRouter = Router();

meRouter.get("/", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const player = await getPlayerByUserId(user.id);

    res.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
        player,
        hasPlayer: Boolean(player),
      },
    });
  } catch (err) {
    next(err);
  }
});
