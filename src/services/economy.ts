import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auditLogs,
  playerSkillValues,
  players,
  type Player,
  type SkillCode,
} from "../db/schema.js";
import {
  ENDURANCE_MAX,
  applyEnduranceRegen,
  applyTirednessRegen,
  computePlayingStrength,
} from "../game/constants.js";
import {
  FITNESS_ITEMS,
  SHOP_ITEMS,
  SPA_ITEMS,
  STAR_PACKS,
  WORK_JOBS,
} from "../game/economyCatalog.js";
import { applyGearBonusesToSkills } from "../game/gearCatalog.js";
import { AppError } from "../middleware/error.js";
import { getPlayerByUserId, type PlayerPublic } from "./players.js";

async function loadPlayer(userId: string): Promise<Player> {
  const row = await db.query.players.findFirst({
    where: eq(players.userId, userId),
  });
  if (!row) {
    throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  }
  const now = new Date();
  const endurance = applyEnduranceRegen(
    row.enduranceCurrent,
    row.enduranceResetAt,
    now,
  );
  const tiredness = applyTirednessRegen(
    row.tirednessCurrent ?? 0,
    row.tirednessResetAt ?? now,
    now,
  );
  if (!endurance.changed && !tiredness.changed) return row;
  const [updated] = await db
    .update(players)
    .set({
      enduranceCurrent: endurance.enduranceCurrent,
      enduranceResetAt: endurance.lastTickAt,
      tirednessCurrent: tiredness.tirednessCurrent,
      tirednessResetAt: tiredness.lastTickAt,
      updatedAt: now,
    })
    .where(eq(players.id, row.id))
    .returning();
  return updated ?? row;
}

function appearanceRecord(player: Player): Record<string, unknown> {
  const a = player.appearance;
  return a && typeof a === "object" ? { ...(a as Record<string, unknown>) } : {};
}

export function getEconomyCatalog() {
  return {
    work: WORK_JOBS,
    shop: SHOP_ITEMS,
    fitness: FITNESS_ITEMS,
    spa: SPA_ITEMS,
    stars: STAR_PACKS,
  };
}

export async function completeWorkJob(
  userId: string,
  jobId: string,
): Promise<PlayerPublic> {
  const job = WORK_JOBS.find((j) => j.id === jobId);
  if (!job) {
    throw new AppError(404, "Job not found", "JOB_NOT_FOUND");
  }

  const player = await loadPlayer(userId);
  if (player.enduranceCurrent < job.enduranceCost) {
    throw new AppError(
      400,
      "Not enough endurance",
      "INSUFFICIENT_ENDURANCE",
    );
  }

  const now = new Date();
  await db
    .update(players)
    .set({
      enduranceCurrent: player.enduranceCurrent - job.enduranceCost,
      coins: player.coins + job.coinReward,
      enduranceResetAt: now,
      updatedAt: now,
    })
    .where(eq(players.id, player.id));

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "economy.work",
    entityType: "player",
    entityId: player.id,
    metadata: {
      jobId: job.id,
      enduranceCost: job.enduranceCost,
      coinReward: job.coinReward,
    },
  });

  const pub = await getPlayerByUserId(userId);
  if (!pub) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  return pub;
}

export async function buyShopItem(
  userId: string,
  itemId: string,
): Promise<PlayerPublic> {
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) {
    throw new AppError(404, "Item not found", "ITEM_NOT_FOUND");
  }

  const player = await loadPlayer(userId);
  if (player.coins < item.coinCost || player.stars < item.starCost) {
    throw new AppError(400, "Not enough currency", "INSUFFICIENT_FUNDS");
  }

  const appearance = appearanceRecord(player);
  const ownedRaw = appearance.ownedGear;
  const ownedGear = Array.isArray(ownedRaw) ? ownedRaw.map(String) : [];
  if (ownedGear.includes(item.id)) {
    throw new AppError(400, "Already owned", "ALREADY_OWNED");
  }

  const now = new Date();
  const coins = player.coins - item.coinCost;
  const stars = player.stars - item.starCost;
  ownedGear.push(item.id);
  appearance.ownedGear = ownedGear;

  const equippedRaw =
    appearance.equipped && typeof appearance.equipped === "object"
      ? (appearance.equipped as Record<string, unknown>)
      : {};
  if (!equippedRaw[item.slot]) {
    equippedRaw[item.slot] = item.id;
  }
  appearance.equipped = equippedRaw;

  // Kit boosts apply while equipped — do not permanently bake into skill rows.
  const all = await db.query.playerSkillValues.findMany({
    where: eq(playerSkillValues.playerId, player.id),
  });
  const map = {} as Record<SkillCode, number>;
  for (const r of all) map[r.skillCode] = r.value;
  const withGear = applyGearBonusesToSkills(map, appearance.equipped);
  const playingStrength = computePlayingStrength(player.position, withGear);

  await db
    .update(players)
    .set({
      coins,
      stars,
      playingStrength,
      appearance: appearance as Player["appearance"],
      updatedAt: now,
    })
    .where(eq(players.id, player.id));

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "economy.shop",
    entityType: "player",
    entityId: player.id,
    metadata: {
      itemId: item.id,
      slot: item.slot,
      skillGain: item.skillGain,
      skillCode: item.skillCode,
    },
  });

  const pub = await getPlayerByUserId(userId);
  if (!pub) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  return pub;
}

export async function buyFitnessItem(
  userId: string,
  itemId: string,
): Promise<PlayerPublic> {
  const item = FITNESS_ITEMS.find((i) => i.id === itemId);
  if (!item) {
    throw new AppError(404, "Item not found", "ITEM_NOT_FOUND");
  }

  const player = await loadPlayer(userId);
  if (player.coins < item.coinCost || player.stars < item.starCost) {
    throw new AppError(400, "Not enough currency", "INSUFFICIENT_FUNDS");
  }
  if (player.enduranceCurrent >= ENDURANCE_MAX) {
    throw new AppError(400, "Endurance is already full", "ENDURANCE_FULL");
  }

  const now = new Date();
  const enduranceCurrent = Math.min(
    ENDURANCE_MAX,
    player.enduranceCurrent + item.enduranceRestore,
  );

  await db
    .update(players)
    .set({
      coins: player.coins - item.coinCost,
      stars: player.stars - item.starCost,
      enduranceCurrent,
      enduranceResetAt: now,
      updatedAt: now,
    })
    .where(eq(players.id, player.id));

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "economy.fitness",
    entityType: "player",
    entityId: player.id,
    metadata: {
      itemId: item.id,
      restored: item.enduranceRestore,
      enduranceCurrent,
    },
  });

  const pub = await getPlayerByUserId(userId);
  if (!pub) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  return pub;
}

export async function buySpaItem(
  userId: string,
  itemId: string,
): Promise<PlayerPublic> {
  const item = SPA_ITEMS.find((i) => i.id === itemId);
  if (!item) {
    throw new AppError(404, "Program not found", "ITEM_NOT_FOUND");
  }

  const player = await loadPlayer(userId);
  if (player.coins < item.coinCost || player.stars < item.starCost) {
    throw new AppError(400, "Not enough currency", "INSUFFICIENT_FUNDS");
  }
  if ((player.tirednessCurrent ?? 0) <= 0) {
    throw new AppError(400, "Already fully recovered", "TIREDNESS_EMPTY");
  }

  const now = new Date();
  const tirednessCurrent = Math.max(
    0,
    (player.tirednessCurrent ?? 0) - item.tirednessRestore,
  );

  await db
    .update(players)
    .set({
      coins: player.coins - item.coinCost,
      stars: player.stars - item.starCost,
      tirednessCurrent,
      tirednessResetAt: now,
      updatedAt: now,
    })
    .where(eq(players.id, player.id));

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "economy.spa",
    entityType: "player",
    entityId: player.id,
    metadata: {
      itemId: item.id,
      restored: item.tirednessRestore,
      tirednessCurrent,
    },
  });

  const pub = await getPlayerByUserId(userId);
  if (!pub) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  return pub;
}

export async function buyStarPack(
  userId: string,
  packId: string,
): Promise<PlayerPublic> {
  const pack = STAR_PACKS.find((p) => p.id === packId);
  if (!pack) {
    throw new AppError(404, "Pack not found", "PACK_NOT_FOUND");
  }

  const player = await loadPlayer(userId);
  if (player.coins < pack.coinCost) {
    throw new AppError(400, "Not enough coins", "INSUFFICIENT_FUNDS");
  }

  const now = new Date();
  await db
    .update(players)
    .set({
      coins: player.coins - pack.coinCost,
      stars: player.stars + pack.starsGranted,
      updatedAt: now,
    })
    .where(eq(players.id, player.id));

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "economy.stars",
    entityType: "player",
    entityId: player.id,
    metadata: {
      packId: pack.id,
      coinCost: pack.coinCost,
      starsGranted: pack.starsGranted,
    },
  });

  const pub = await getPlayerByUserId(userId);
  if (!pub) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  return pub;
}
