import { Router } from "express";
import { count, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { adminUsers, players, users } from "../../db/schema.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { listPlayersForAdmin } from "../../services/players.js";

export const adminRouter = Router();

adminRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.userId, user.id),
    });

    res.json({
      data: {
        isAdmin: Boolean(admin),
        role: admin?.role ?? null,
        user: {
          id: user.id,
          email: user.email,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

const protectedAdmin = Router();
protectedAdmin.use(requireAuth, requireAdmin);

protectedAdmin.get("/dashboard", async (_req, res, next) => {
  try {
    const [userCount] = await db.select({ value: count() }).from(users);
    const [playerCount] = await db.select({ value: count() }).from(players);
    const [adminCount] = await db.select({ value: count() }).from(adminUsers);

    res.json({
      data: {
        users: userCount.value,
        players: playerCount.value,
        admins: adminCount.value,
      },
    });
  } catch (err) {
    next(err);
  }
});

protectedAdmin.get("/players", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await listPlayersForAdmin(limit, offset);

    res.json({
      data: rows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        position: row.position,
        fame: row.fame,
        playingStrength: row.playingStrength,
        coins: row.coins,
        stars: row.stars,
        enduranceCurrent: row.enduranceCurrent,
        appearance: row.appearance,
        skills: row.skills,
        relevantSkills: row.relevantSkills,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        worldId: row.worldId,
        user: row.user,
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.use(protectedAdmin);
