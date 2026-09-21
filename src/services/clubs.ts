import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auditLogs,
  botPlayers,
  clubMemberships,
  clubs,
  players,
  type Club,
  type LeagueTier,
  type PlayerAppearance,
} from "../db/schema.js";
import { getOpenWorldOrThrow } from "../game/bootstrap.js";
import {
  LEAGUE_TIERS,
  SQUAD_442,
  SYSTEM_CLUB_NAMES,
  botNameFor,
  botStrengthFor,
} from "../game/clubCatalog.js";
import { AppError } from "../middleware/error.js";
import { getPlayerByUserId, type PlayerPublic } from "./players.js";

function appearanceWithClub(
  appearance: PlayerAppearance,
  clubName: string | null,
  clubRole: "owner" | "member" | null,
): PlayerAppearance {
  return {
    ...appearance,
    clubName,
    clubRole,
  };
}

async function insertBotSquad(clubId: string, clubName: string, tier: LeagueTier) {
  await db.insert(botPlayers).values(
    SQUAD_442.map((slot, index) => ({
      clubId,
      displayName: botNameFor(clubName, index),
      position: slot.position,
      slot: slot.slot,
      isStarter: slot.starter ? 1 : 0,
      playingStrength: botStrengthFor(tier, clubName, index),
      tirednessCurrent: 0,
    })),
  );
}

/** Seed 6×8 NPC clubs with 15 bots each (idempotent). */
export async function ensureSystemLeagues(worldId: string) {
  for (const tier of LEAGUE_TIERS) {
    for (const name of SYSTEM_CLUB_NAMES[tier]) {
      const existing = await db.query.clubs.findFirst({
        where: and(
          eq(clubs.worldId, worldId),
          eq(clubs.name, name),
          eq(clubs.isSystem, 1),
        ),
      });
      if (existing) {
        const botCount = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(botPlayers)
          .where(eq(botPlayers.clubId, existing.id));
        if ((botCount[0]?.n ?? 0) < 15) {
          await db.delete(botPlayers).where(eq(botPlayers.clubId, existing.id));
          await insertBotSquad(existing.id, name, tier);
        }
        continue;
      }

      const [club] = await db
        .insert(clubs)
        .values({
          worldId,
          name,
          tier,
          isSystem: 1,
        })
        .returning();
      if (club) {
        await insertBotSquad(club.id, name, tier);
      }
    }
  }
}

export type ClubPublic = {
  id: string;
  name: string;
  tier: LeagueTier;
  isSystem: boolean;
  role: "owner" | "member";
  botCount: number;
};

export async function getMyClub(userId: string): Promise<ClubPublic | null> {
  const player = await db.query.players.findFirst({
    where: eq(players.userId, userId),
  });
  if (!player) return null;

  const membership = await db.query.clubMemberships.findFirst({
    where: eq(clubMemberships.playerId, player.id),
    with: { club: true },
  });
  if (!membership?.club) return null;

  const botCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(botPlayers)
    .where(eq(botPlayers.clubId, membership.clubId));

  return {
    id: membership.club.id,
    name: membership.club.name,
    tier: membership.club.tier,
    isSystem: membership.club.isSystem === 1,
    role: membership.role,
    botCount: botCount[0]?.n ?? 0,
  };
}

export async function listLeagueClubs(tier: LeagueTier) {
  const world = await getOpenWorldOrThrow();
  await ensureSystemLeagues(world.id);

  const rows = await db.query.clubs.findMany({
    where: and(eq(clubs.worldId, world.id), eq(clubs.tier, tier)),
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    tier: c.tier,
    isSystem: c.isSystem === 1,
  }));
}

export async function createPlayerClub(
  userId: string,
  name: string,
): Promise<{ player: PlayerPublic; club: ClubPublic }> {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 40) {
    throw new AppError(400, "Club name must be 3–40 characters", "INVALID_NAME");
  }

  const world = await getOpenWorldOrThrow();
  await ensureSystemLeagues(world.id);

  const player = await db.query.players.findFirst({
    where: eq(players.userId, userId),
  });
  if (!player) {
    throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  }

  const existing = await db.query.clubMemberships.findFirst({
    where: eq(clubMemberships.playerId, player.id),
  });
  if (existing) {
    throw new AppError(409, "Already in a club", "ALREADY_IN_CLUB");
  }

  const nameTaken = await db.query.clubs.findFirst({
    where: and(eq(clubs.worldId, world.id), eq(clubs.name, trimmed)),
  });
  if (nameTaken) {
    throw new AppError(409, "Club name already taken", "NAME_TAKEN");
  }

  const tier: LeagueTier = "bronze";
  const [club] = await db
    .insert(clubs)
    .values({
      worldId: world.id,
      name: trimmed,
      tier,
      isSystem: 0,
    })
    .returning();

  if (!club) {
    throw new AppError(500, "Could not create club", "CLUB_CREATE_FAILED");
  }

  await insertBotSquad(club.id, trimmed, tier);

  await db.insert(clubMemberships).values({
    clubId: club.id,
    playerId: player.id,
    role: "owner",
  });

  const now = new Date();
  await db
    .update(players)
    .set({
      appearance: appearanceWithClub(player.appearance, trimmed, "owner"),
      updatedAt: now,
    })
    .where(eq(players.id, player.id));

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "club.create",
    entityType: "club",
    entityId: club.id,
    metadata: { name: trimmed, tier, bots: 15 },
  });

  const pub = await getPlayerByUserId(userId);
  if (!pub) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");

  return {
    player: pub,
    club: {
      id: club.id,
      name: club.name,
      tier: club.tier,
      isSystem: false,
      role: "owner",
      botCount: 15,
    },
  };
}

export async function leavePlayerClub(userId: string): Promise<PlayerPublic> {
  const player = await db.query.players.findFirst({
    where: eq(players.userId, userId),
  });
  if (!player) {
    throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  }

  const membership = await db.query.clubMemberships.findFirst({
    where: eq(clubMemberships.playerId, player.id),
    with: { club: true },
  });
  if (!membership) {
    throw new AppError(400, "Not in a club", "NOT_IN_CLUB");
  }

  if (membership.club?.isSystem === 1) {
    throw new AppError(400, "Cannot leave a system club this way", "SYSTEM_CLUB");
  }

  await db
    .delete(clubMemberships)
    .where(eq(clubMemberships.id, membership.id));

  // Owner leaving a player-made club: dissolve bots + club
  if (membership.role === "owner" && membership.club) {
    await db.delete(botPlayers).where(eq(botPlayers.clubId, membership.clubId));
    await db.delete(clubs).where(eq(clubs.id, membership.clubId));
  }

  const now = new Date();
  await db
    .update(players)
    .set({
      appearance: appearanceWithClub(player.appearance, null, null),
      updatedAt: now,
    })
    .where(eq(players.id, player.id));

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "club.leave",
    entityType: "club",
    entityId: membership.clubId,
    metadata: { role: membership.role },
  });

  const pub = await getPlayerByUserId(userId);
  if (!pub) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  return pub;
}

export type { Club };
