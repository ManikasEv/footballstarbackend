import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auditLogs,
  playerSkillValues,
  playerTactics,
  players,
  type Player,
  type PlayerPosition,
  type PlayerSkillValue,
  type PlayerTactics,
  type SkillCode,
} from "../db/schema.js";
import { getOpenWorldOrThrow } from "../game/bootstrap.js";
import {
  ALL_SKILL_CODES,
  BASE_SKILL_VALUE,
  POSITION_SKILLS,
  STARTING_POSITION_SKILL_BONUS,
  computePlayingStrength,
  nextUtcMidnight,
} from "../game/constants.js";
import { AppError } from "../middleware/error.js";
import type { CreatePlayerInput } from "../validators/player.js";

export type PlayerPublic = Omit<Player, never> & {
  skills: Record<SkillCode, number>;
  relevantSkills: SkillCode[];
  tactics: Pick<PlayerTactics, "passingStyle" | "foulIntensity">;
};

function skillsToMap(rows: PlayerSkillValue[]): Record<SkillCode, number> {
  const map = {} as Record<SkillCode, number>;
  for (const code of ALL_SKILL_CODES) {
    map[code] = BASE_SKILL_VALUE;
  }
  for (const row of rows) {
    map[row.skillCode] = row.value;
  }
  return map;
}

function toPublic(
  player: Player,
  skillRows: PlayerSkillValue[],
  tactics: PlayerTactics | null | undefined,
): PlayerPublic {
  return {
    ...player,
    skills: skillsToMap(skillRows),
    relevantSkills: POSITION_SKILLS[player.position],
    tactics: {
      passingStyle: tactics?.passingStyle ?? "balanced",
      foulIntensity: tactics?.foulIntensity ?? "normal",
    },
  };
}

/** Mature rule: at UTC midnight, endurance resets to 100. No passive regen. */
async function applyEnduranceResetIfDue(player: Player): Promise<Player> {
  const now = new Date();
  if (now < player.enduranceResetAt) {
    return player;
  }

  const [updated] = await db
    .update(players)
    .set({
      enduranceCurrent: 100,
      enduranceResetAt: nextUtcMidnight(now),
      updatedAt: now,
    })
    .where(eq(players.id, player.id))
    .returning();

  return updated ?? player;
}

export async function getPlayerByUserId(
  userId: string,
): Promise<PlayerPublic | null> {
  const player = await db.query.players.findFirst({
    where: eq(players.userId, userId),
    with: {
      skills: true,
      tactics: true,
    },
  });

  if (!player) {
    return null;
  }

  const refreshed = await applyEnduranceResetIfDue(player);
  return toPublic(refreshed, player.skills, player.tactics);
}

function buildInitialSkillRows(playerId: string, position: PlayerPosition) {
  const relevant = new Set(POSITION_SKILLS[position]);
  return ALL_SKILL_CODES.map((skillCode) => ({
    playerId,
    skillCode,
    value: relevant.has(skillCode)
      ? BASE_SKILL_VALUE + STARTING_POSITION_SKILL_BONUS
      : BASE_SKILL_VALUE,
  }));
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const e = err as { code?: string; message?: string; cause?: { code?: string } };
  return (
    e.code === "23505" ||
    e.cause?.code === "23505" ||
    (typeof e.message === "string" &&
      (e.message.includes("players_user_id_uidx") ||
        e.message.toLowerCase().includes("duplicate key")))
  );
}

export async function createPlayerForUser(
  userId: string,
  input: CreatePlayerInput,
): Promise<PlayerPublic> {
  const existing = await db.query.players.findFirst({
    where: eq(players.userId, userId),
  });

  if (existing) {
    throw new AppError(
      409,
      "This account already has a football player",
      "PLAYER_EXISTS",
    );
  }

  const world = await getOpenWorldOrThrow();

  const initialSkills = {} as Record<SkillCode, number>;
  for (const code of ALL_SKILL_CODES) {
    initialSkills[code] = POSITION_SKILLS[input.position].includes(code)
      ? BASE_SKILL_VALUE + STARTING_POSITION_SKILL_BONUS
      : BASE_SKILL_VALUE;
  }
  const playingStrength = computePlayingStrength(
    input.position,
    initialSkills,
  );

  let playerId: string | null = null;

  try {
    const [player] = await db
      .insert(players)
      .values({
        userId,
        worldId: world.id,
        displayName: input.displayName,
        position: input.position,
        fame: 0,
        playingStrength,
        coins: 0,
        stars: 0,
        enduranceCurrent: 100,
        enduranceResetAt: nextUtcMidnight(),
        appearance: input.appearance,
      })
      .returning();

    playerId = player.id;

    await db
      .insert(playerSkillValues)
      .values(buildInitialSkillRows(player.id, input.position));

    const [tactics] = await db
      .insert(playerTactics)
      .values({ playerId: player.id })
      .returning();

    await db.insert(auditLogs).values({
      actorUserId: userId,
      action: "player.created",
      entityType: "player",
      entityId: player.id,
      metadata: {
        displayName: player.displayName,
        position: player.position,
        gender: input.appearance.gender,
        worldId: world.id,
      },
    });

    const skillRows = await db.query.playerSkillValues.findMany({
      where: eq(playerSkillValues.playerId, player.id),
    });

    return toPublic(player, skillRows, tactics);
  } catch (err) {
    // Compensating cleanup — neon-http has no multi-statement transactions
    if (playerId) {
      try {
        await db.delete(players).where(eq(players.id, playerId));
      } catch {
        // best-effort
      }
    }

    if (isUniqueViolation(err)) {
      throw new AppError(
        409,
        "This account already has a football player",
        "PLAYER_EXISTS",
      );
    }
    throw err;
  }
}

/** Position is changeable; skills persist across switches. */
export async function changePlayerPosition(
  userId: string,
  position: PlayerPosition,
): Promise<PlayerPublic> {
  const player = await db.query.players.findFirst({
    where: eq(players.userId, userId),
    with: { skills: true, tactics: true },
  });

  if (!player) {
    throw new AppError(404, "No player found for this account", "NO_PLAYER");
  }

  if (player.position === position) {
    const refreshed = await applyEnduranceResetIfDue(player);
    return toPublic(refreshed, player.skills, player.tactics);
  }

  const skills = skillsToMap(player.skills);
  const playingStrength = computePlayingStrength(position, skills);

  const [updated] = await db
    .update(players)
    .set({
      position,
      playingStrength,
      updatedAt: new Date(),
    })
    .where(eq(players.id, player.id))
    .returning();

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "player.position_changed",
    entityType: "player",
    entityId: player.id,
    metadata: {
      from: player.position,
      to: position,
      playingStrength,
    },
  });

  return toPublic(updated, player.skills, player.tactics);
}

export async function listPlayersForAdmin(limit = 100, offset = 0) {
  const rows = await db.query.players.findMany({
    with: {
      skills: true,
      tactics: true,
      user: true,
    },
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    limit,
    offset,
  });

  return rows.map((row) => ({
    ...toPublic(row, row.skills, row.tactics),
    user: row.user
      ? {
          id: row.user.id,
          email: row.user.email,
          clerkUserId: row.user.clerkUserId,
          createdAt: row.user.createdAt,
        }
      : null,
  }));
}
