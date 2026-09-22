import { Router } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import {
  createPlayerClub,
  getMyClub,
  getMySquad,
  joinPlayerClub,
  leavePlayerClub,
  listLeagueClubs,
} from "../../services/clubs.js";
import { LEAGUE_TIERS } from "../../game/clubCatalog.js";
import {
  computeGroupStandings,
  ensureActiveSeason,
  getClubSchedule,
  getGlobalStandings,
  getMyLeagueGroupId,
} from "../../services/seasons.js";
import { AppError } from "../../middleware/error.js";
import { getOpenWorldOrThrow } from "../../game/bootstrap.js";

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

clubsRouter.get("/me/squad", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const data = await getMySquad(user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

clubsRouter.get("/me/schedule", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const club = await getMyClub(user.id);
    if (!club) throw new AppError(400, "Not in a club", "NOT_IN_CLUB");
    const data = await getClubSchedule(club.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

clubsRouter.get("/me/standings", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const club = await getMyClub(user.id);
    if (!club) throw new AppError(400, "Not in a club", "NOT_IN_CLUB");
    const world = await getOpenWorldOrThrow();
    const season = await ensureActiveSeason(world.id);
    const groupId = await getMyLeagueGroupId(club.id, season.id);
    if (!groupId) {
      res.json({
        data: {
          season: { id: season.id, number: season.number },
          standings: [],
        },
      });
      return;
    }
    const standings = await computeGroupStandings(groupId);
    res.json({
      data: {
        season: { id: season.id, number: season.number },
        leagueGroupId: groupId,
        standings,
      },
    });
  } catch (err) {
    next(err);
  }
});

clubsRouter.get("/standings/global", async (req, res, next) => {
  try {
    const tier = (req.query.tier as string) || "bronze";
    if (!(LEAGUE_TIERS as string[]).includes(tier)) {
      res.status(400).json({ error: { message: "Unknown league tier" } });
      return;
    }
    const data = await getGlobalStandings(
      tier as (typeof LEAGUE_TIERS)[number],
    );
    res.json({ data });
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
  kit: z
    .object({
      shirtPatternId: z.enum([
        "home",
        "solid",
        "vertical",
        "hoops",
        "diagonal",
        "halves",
      ]),
      shortsColourId: z.string().regex(/^colour-[1-5]$/),
      socksColourId: z.string().regex(/^colour-[1-5]$/),
      badgeStyle: z.enum(["shield", "circle", "diamond"]),
      badgePrimary: z.string().min(4).max(20),
      badgeSecondary: z.string().min(4).max(20),
      badgeInitials: z.string().trim().min(1).max(3),
    })
    .optional(),
});

clubsRouter.post("/", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { name, kit } = createBody.parse(req.body);
    const result = await createPlayerClub(user.id, name, kit);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

const joinBody = z.object({
  clubId: z.string().uuid(),
});

clubsRouter.post("/join", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { clubId } = joinBody.parse(req.body);
    const result = await joinPlayerClub(user.id, clubId);
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
