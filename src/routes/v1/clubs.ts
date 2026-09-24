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
  setClubLineup,
  swapSquadMembers,
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
    res.json({ data: { ...data, formation: "4-4-2" } });
  } catch (err) {
    next(err);
  }
});

const lineupBody = z.object({
  starterIds: z.array(z.string().uuid()).min(1).max(11),
});

clubsRouter.post("/me/lineup", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { starterIds } = lineupBody.parse(req.body);
    const data = await setClubLineup(user.id, starterIds);
    res.json({ data: { ...data, formation: "4-4-2" } });
  } catch (err) {
    next(err);
  }
});

const swapBody = z.object({
  aId: z.string().uuid(),
  bId: z.string().uuid(),
});

clubsRouter.post("/me/squad/swap", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const { aId, bId } = swapBody.parse(req.body);
    const data = await swapSquadMembers(user.id, aId, bId);
    res.json({ data: { ...data, formation: "4-4-2" } });
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

const dataUrl = z
  .string()
  .max(180_000)
  .refine(
    (v) =>
      v === "" ||
      /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
    "Invalid image",
  )
  .optional()
  .nullable();

const createBody = z.object({
  name: z.string().trim().min(3).max(40),
  kit: z
    .object({
      shirtPatternId: z
        .enum(["home", "solid", "vertical", "hoops", "diagonal", "halves"])
        .optional(),
      shirtPrimary: z.string().optional(),
      shirtSecondary: z.string().optional(),
      shortsColourId: z.string().optional(),
      socksColourId: z.string().optional(),
      shortsColour: z.string().optional(),
      socksColour: z.string().optional(),
      badgeStyle: z.enum(["shield", "circle", "diamond"]).optional(),
      badgePrimary: z.string().optional(),
      badgeSecondary: z.string().optional(),
      badgeInitials: z.string().optional(),
      shirtDesign: dataUrl,
      badgeDesign: dataUrl,
    })
    .optional(),
});

clubsRouter.post("/", async (req, res, next) => {
  try {
    const { user } = (req as AuthenticatedRequest).auth;
    const body = createBody.parse(req.body);
    const hex = (v: string | undefined, fallback: string) =>
      v && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback;
    const colour = (v: string | undefined, fallback: string) =>
      v && /^colour-[1-5]$/.test(v) ? v : fallback;
    const design = (v: string | null | undefined) =>
      v && v.startsWith("data:image/") ? v : null;
    const kit = body.kit
      ? {
          shirtPatternId: body.kit.shirtPatternId ?? "vertical",
          shirtPrimary: hex(body.kit.shirtPrimary, "#1e4a8c"),
          shirtSecondary: hex(body.kit.shirtSecondary, "#f0b429"),
          shortsColourId: colour(body.kit.shortsColourId, "colour-1"),
          socksColourId: colour(body.kit.socksColourId, "colour-1"),
          shortsColour: hex(body.kit.shortsColour, "#ffffff"),
          socksColour: hex(body.kit.socksColour, "#ffffff"),
          badgeStyle: body.kit.badgeStyle ?? "shield",
          badgePrimary: hex(body.kit.badgePrimary, "#1e4a8c"),
          badgeSecondary: hex(body.kit.badgeSecondary, "#f0b429"),
          badgeInitials: (body.kit.badgeInitials ?? "FC")
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 3)
            .toUpperCase() || "FC",
          shirtDesign: design(body.kit.shirtDesign),
          badgeDesign: design(body.kit.badgeDesign),
        }
      : undefined;
    const result = await createPlayerClub(user.id, body.name, kit);
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
