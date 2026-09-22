import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auditLogs,
  botPlayers,
  clubMemberships,
  clubs,
  players,
  type Club,
  type ClubKit,
  type LeagueTier,
  type PlayerAppearance,
  DEFAULT_CLUB_KIT,
} from "../db/schema.js";
import { getOpenWorldOrThrow } from "../game/bootstrap.js";
import {
  LEAGUE_TIERS,
  MAX_SQUAD_SIZE,
  applyKitToAppearance,
} from "../game/clubCatalog.js";
import { AppError } from "../middleware/error.js";
import { getPlayerByUserId, type PlayerPublic } from "./players.js";
import {
  claimBronzeClubSlot,
  ensureActiveSeason,
  ensureClubBots,
} from "./seasons.js";

function normalizeClubKit(kit: ClubKit | null | undefined): ClubKit {
  const base = { ...DEFAULT_CLUB_KIT, ...(kit ?? {}) };
  return {
    ...base,
    shirtPrimary:
      base.shirtPrimary || base.badgePrimary || DEFAULT_CLUB_KIT.shirtPrimary,
    shirtSecondary:
      base.shirtSecondary ||
      base.badgeSecondary ||
      DEFAULT_CLUB_KIT.shirtSecondary,
  };
}

function appearanceWithClub(
  appearance: PlayerAppearance,
  clubName: string | null,
  clubRole: "owner" | "member" | null,
  kit?: ClubKit | null,
): PlayerAppearance {
  const withClub = {
    ...appearance,
    clubName,
    clubRole,
  };
  if (!kit) return withClub;
  return applyKitToAppearance(withClub, kit, clubName ?? undefined);
}

export async function ensureSystemLeagues(worldId: string) {
  await ensureActiveSeason(worldId);
}

export { ensureClubBots };

export type ClubPublic = {
  id: string;
  name: string;
  tier: LeagueTier;
  isSystem: boolean;
  role: "owner" | "member";
  botCount: number;
  humanCount: number;
  squadCap: number;
  kit: ClubKit;
};

async function clubPublicFrom(
  club: Club,
  role: "owner" | "member",
): Promise<ClubPublic> {
  const botCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(botPlayers)
    .where(eq(botPlayers.clubId, club.id));
  const humanCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clubMemberships)
    .where(eq(clubMemberships.clubId, club.id));
  return {
    id: club.id,
    name: club.name,
    tier: club.tier,
    isSystem: club.isSystem === 1,
    role,
    botCount: botCount[0]?.n ?? 0,
    humanCount: humanCount[0]?.n ?? 0,
    squadCap: MAX_SQUAD_SIZE,
    kit: normalizeClubKit(club.kit),
  };
}

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
  return clubPublicFrom(membership.club, membership.role);
}

export type SquadMemberPublic = {
  id: string;
  name: string;
  kind: "bot" | "human";
  position: string;
  slot: string;
  number: number;
  isStarter: boolean;
  playingStrength: number;
  appearance: Record<string, unknown>;
};

/** Full club roster for OG-style club preview sidebar. */
export async function getMySquad(userId: string): Promise<{
  club: ClubPublic;
  squad: SquadMemberPublic[];
}> {
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
  if (!membership?.club) {
    throw new AppError(400, "Not in a club", "NOT_IN_CLUB");
  }
  const club = membership.club;
  const kit = normalizeClubKit(club.kit);
  await ensureClubBots(club.id, club.name, club.tier, kit);

  const bots = await db.query.botPlayers.findMany({
    where: eq(botPlayers.clubId, club.id),
  });
  const humans = await db.query.clubMemberships.findMany({
    where: eq(clubMemberships.clubId, club.id),
  });

  const squad: SquadMemberPublic[] = [];
  let num = 1;

  for (const m of humans) {
    const p = await db.query.players.findFirst({
      where: eq(players.id, m.playerId),
    });
    if (!p) continue;
    const slotPrefer =
      p.position === "goalkeeper"
        ? "gk"
        : p.position === "defender"
          ? "cb"
          : p.position === "midfielder"
            ? "cm"
            : "st";
    squad.push({
      id: p.id,
      name: p.displayName,
      kind: "human",
      position: p.position,
      slot: slotPrefer,
      number: num++,
      isStarter: true,
      playingStrength: p.playingStrength,
      appearance: applyKitToAppearance(
        p.appearance,
        kit,
        club.name,
      ) as unknown as Record<string, unknown>,
    });
  }

  for (const b of bots) {
    squad.push({
      id: b.id,
      name: b.displayName,
      kind: "bot",
      position: b.position,
      slot: b.slot,
      number: num++,
      isStarter: b.isStarter === 1,
      playingStrength: b.playingStrength,
      appearance: applyKitToAppearance(
        b.appearance as PlayerAppearance,
        kit,
        club.name,
      ) as unknown as Record<string, unknown>,
    });
  }

  squad.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "human" ? -1 : 1;
    if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
    return a.number - b.number;
  });
  // Re-number after sort for display
  squad.forEach((s, i) => {
    s.number = i + 1;
  });

  return {
    club: await clubPublicFrom(club, membership.role),
    squad,
  };
}

export async function listLeagueClubs(tier: LeagueTier) {
  const world = await getOpenWorldOrThrow();
  await ensureActiveSeason(world.id);

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
  kitInput?: Partial<ClubKit>,
): Promise<{ player: PlayerPublic; club: ClubPublic }> {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 40) {
    throw new AppError(400, "Club name must be 3–40 characters", "INVALID_NAME");
  }

  const world = await getOpenWorldOrThrow();
  await ensureActiveSeason(world.id);

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

  const { club } = await claimBronzeClubSlot(world.id, trimmed, kitInput);

  await db.insert(clubMemberships).values({
    clubId: club.id,
    playerId: player.id,
    role: "owner",
  });

  const now = new Date();
  await db
    .update(players)
    .set({
      appearance: appearanceWithClub(
        player.appearance,
        trimmed,
        "owner",
        club.kit,
      ),
      updatedAt: now,
    })
    .where(eq(players.id, player.id));

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "club.create",
    entityType: "club",
    entityId: club.id,
    metadata: { name: trimmed, tier: "bronze", claimedNpc: true, kit: club.kit },
  });

  const pub = await getPlayerByUserId(userId);
  if (!pub) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");

  return {
    player: pub,
    club: await clubPublicFrom(club, "owner"),
  };
}

export async function joinPlayerClub(
  userId: string,
  clubId: string,
): Promise<{ player: PlayerPublic; club: ClubPublic }> {
  const world = await getOpenWorldOrThrow();
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

  const club = await db.query.clubs.findFirst({
    where: and(eq(clubs.id, clubId), eq(clubs.worldId, world.id)),
  });
  if (!club || club.isSystem === 1) {
    throw new AppError(404, "Club not joinable", "CLUB_NOT_FOUND");
  }

  const humans = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clubMemberships)
    .where(eq(clubMemberships.clubId, club.id));
  if ((humans[0]?.n ?? 0) >= MAX_SQUAD_SIZE) {
    throw new AppError(400, "Squad is full (22)", "SQUAD_FULL");
  }
  const bots = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(botPlayers)
    .where(eq(botPlayers.clubId, club.id));
  const total = (humans[0]?.n ?? 0) + (bots[0]?.n ?? 0);
  if (total >= MAX_SQUAD_SIZE && (bots[0]?.n ?? 0) > 0) {
    const bot = await db.query.botPlayers.findFirst({
      where: and(eq(botPlayers.clubId, club.id), eq(botPlayers.isStarter, 0)),
    });
    if (bot) {
      await db.delete(botPlayers).where(eq(botPlayers.id, bot.id));
    }
  }

  await db.insert(clubMemberships).values({
    clubId: club.id,
    playerId: player.id,
    role: "member",
  });

  await db
    .update(players)
    .set({
      appearance: appearanceWithClub(
        player.appearance,
        club.name,
        "member",
        club.kit,
      ),
      updatedAt: new Date(),
    })
    .where(eq(players.id, player.id));

  const pub = await getPlayerByUserId(userId);
  if (!pub) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  return { player: pub, club: await clubPublicFrom(club, "member") };
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

  await db
    .delete(clubMemberships)
    .where(eq(clubMemberships.id, membership.id));

  if (membership.role === "owner" && membership.club) {
    const remaining = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(clubMemberships)
      .where(eq(clubMemberships.clubId, membership.clubId));
    if ((remaining[0]?.n ?? 0) === 0) {
      const npcName = `${membership.club.name} Youth`;
      await db
        .update(clubs)
        .set({ isSystem: 1, name: npcName })
        .where(eq(clubs.id, membership.clubId));
      await ensureClubBots(membership.clubId, npcName, membership.club.tier);
    } else {
      const next = await db.query.clubMemberships.findFirst({
        where: eq(clubMemberships.clubId, membership.clubId),
      });
      if (next) {
        await db
          .update(clubMemberships)
          .set({ role: "owner" })
          .where(eq(clubMemberships.id, next.id));
      }
    }
  }

  await db
    .update(players)
    .set({
      appearance: appearanceWithClub(player.appearance, null, null),
      updatedAt: new Date(),
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
export { LEAGUE_TIERS };
