import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { adminRouter } from "./admin.js";
import { meRouter } from "./me.js";
import { playersRouter } from "./players.js";
import { trainingRouter } from "./training.js";

export const v1Router = Router();

v1Router.get("/health", (_req, res) => {
  res.json({
    data: {
      status: "ok",
      service: "football-star-api",
      version: "v1",
    },
  });
});

v1Router.use("/me", requireAuth, meRouter);
v1Router.use("/players", requireAuth, playersRouter);
v1Router.use("/training", requireAuth, trainingRouter);
v1Router.use("/admin", adminRouter);
