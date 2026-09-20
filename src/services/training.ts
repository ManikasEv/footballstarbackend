import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auditLogs,
  playerSkillValues,
  playerTrainingChain,
  players,
  trainingOffers,
  trainingSessions,
  type Player,
  type SkillCode,
  type TrainingOffer,
  type TrainingOfferKind,
  type TrainingSession,
} from "../db/schema.js";
import {
  ALL_SKILL_CODES,
  POSITION_SKILLS,
  computePlayingStrength,
  nextUtcMidnight,
} from "../game/constants.js";
import {
  advanceTrainingChain,
  TRAINING_CHAINS,
  type ChainColor,
} from "../game/trainingChains.js";
import { generateTrainingOffers } from "../game/trainingOffers.js";
import { AppError } from "../middleware/error.js";
import { getPlayerByUserId } from "./players.js";

async function applyEnduranceReset(player: Player): Promise<Player> {
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

async function getPlayerRow(userId: string): Promise<Player> {
  const row = await db.query.players.findFirst({
    where: eq(players.userId, userId),
  });
  if (!row) {
    throw new AppError(404, "No player found for this account", "NO_PLAYER");
  }
  return applyEnduranceReset(row);
}

async function ensureChainRow(playerId: string) {
  const existing = await db.query.playerTrainingChain.findFirst({
    where: eq(playerTrainingChain.playerId, playerId),
  });
  if (existing) {
    return existing;
  }
  const [created] = await db
    .insert(playerTrainingChain)
    .values({ playerId })
    .returning();
  return created;
}

async function clearOffers(playerId: string) {
  await db.delete(trainingOffers).where(eq(trainingOffers.playerId, playerId));
}

/** Old packs were flat 600s / identical durations — drop them. */
function offersLookLegacy(offers: TrainingOffer[]) {
  if (offers.length < 3) return true;
  const kindsMissing = offers.some((o) => o.kind == null);
  if (kindsMissing) return true;
  const allSameDuration = offers.every(
    (o) => o.durationSeconds === offers[0].durationSeconds,
  );
  return allSameDuration && offers[0].durationSeconds >= 500;
}

async function ensureOffers(player: Player): Promise<TrainingOffer[]> {
  const existing = await db.query.trainingOffers.findMany({
    where: eq(trainingOffers.playerId, player.id),
    orderBy: [asc(trainingOffers.sortOrder)],
  });

  if (existing.length >= 3 && !offersLookLegacy(existing)) {
    return existing.slice(0, 3);
  }

  await clearOffers(player.id);
  const generated = generateTrainingOffers(player.position, player.fame);
  const inserted = await db
    .insert(trainingOffers)
    .values(
      generated.map((o) => ({
        playerId: player.id,
        kind: o.kind,
        skillCode: o.skillCode,
        durationSeconds: o.durationSeconds,
        enduranceCost: o.enduranceCost,
        coinReward: o.coinReward,
        skillGain: o.skillGain,
        sortOrder: o.sortOrder,
      })),
    )
    .returning();

  return inserted.sort((a, b) => a.sortOrder - b.sortOrder);
}

async function findActiveSession(playerId: string) {
  return db.query.trainingSessions.findFirst({
    where: and(
      eq(trainingSessions.playerId, playerId),
      eq(trainingSessions.status, "active"),
    ),
    orderBy: [desc(trainingSessions.startedAt)],
  });
}

async function recomputePlayingStrength(
  playerId: string,
  position: Player["position"],
) {
  const skillRows = await db.query.playerSkillValues.findMany({
    where: eq(playerSkillValues.playerId, playerId),
  });
  const map = {} as Record<SkillCode, number>;
  for (const code of ALL_SKILL_CODES) {
    map[code] = 10;
  }
  for (const row of skillRows) {
    map[row.skillCode] = row.value;
  }
  const playingStrength = computePlayingStrength(position, map);
  await db
    .update(players)
    .set({ playingStrength, updatedAt: new Date() })
    .where(eq(players.id, playerId));
  return playingStrength;
}

type CompletionResult = {
  session: TrainingSession;
  kind: TrainingOfferKind;
  skillCode: SkillCode | null;
  skillGain: number;
  chainBonus: number;
  coinReward: number;
  newSkillValue: number | null;
  appliedToAll: boolean;
};

async function bumpSkill(
  playerId: string,
  skillCode: SkillCode,
  amount: number,
): Promise<number> {
  const skillRow = await db.query.playerSkillValues.findFirst({
    where: and(
      eq(playerSkillValues.playerId, playerId),
      eq(playerSkillValues.skillCode, skillCode),
    ),
  });

  const newValue = (skillRow?.value ?? 10) + amount;

  if (skillRow) {
    await db
      .update(playerSkillValues)
      .set({ value: newValue, updatedAt: new Date() })
      .where(eq(playerSkillValues.id, skillRow.id));
  } else {
    await db.insert(playerSkillValues).values({
      playerId,
      skillCode,
      value: newValue,
    });
  }

  return newValue;
}

async function completeSession(
  session: TrainingSession,
  player: Player,
): Promise<CompletionResult> {
  // Idempotent — claim + GET auto-complete can race
  if (session.status === "completed") {
    return {
      session,
      kind: (session.kind ?? "session") as TrainingOfferKind,
      skillCode: session.skillCode,
      skillGain: session.skillGain,
      chainBonus: session.chainBonus,
      coinReward: session.coinReward,
      newSkillValue: null,
      appliedToAll:
        (session.kind ?? "session") === "all_round" || session.skillCode == null,
    };
  }

  if (session.status !== "active") {
    throw new AppError(400, "Training session is not active", "NOT_ACTIVE");
  }

  const kind = (session.kind ?? "session") as TrainingOfferKind;
  const appliedToAll = kind === "all_round" || session.skillCode == null;
  let newSkillValue: number | null = null;

  if (appliedToAll) {
    for (const code of POSITION_SKILLS[player.position]) {
      await bumpSkill(player.id, code, session.skillGain);
    }
  } else {
    const totalGain = session.skillGain + session.chainBonus;
    newSkillValue = await bumpSkill(
      player.id,
      session.skillCode as SkillCode,
      totalGain,
    );
  }

  await db
    .update(players)
    .set({
      coins: player.coins + session.coinReward,
      updatedAt: new Date(),
    })
    .where(eq(players.id, player.id));

  await recomputePlayingStrength(player.id, player.position);

  const [updatedSession] = await db
    .update(trainingSessions)
    .set({
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(trainingSessions.id, session.id))
    .returning();

  await db.insert(auditLogs).values({
    actorUserId: player.userId,
    action: "training.completed",
    entityType: "training_session",
    entityId: session.id,
    metadata: {
      kind,
      skillCode: session.skillCode,
      skillGain: session.skillGain,
      chainBonus: session.chainBonus,
      coinReward: session.coinReward,
      appliedToAll,
      newSkillValue,
    },
  });

  await clearOffers(player.id);

  return {
    session: updatedSession,
    kind,
    skillCode: session.skillCode,
    skillGain: session.skillGain,
    chainBonus: session.chainBonus,
    coinReward: session.coinReward,
    newSkillValue,
    appliedToAll,
  };
}

function serializeOffer(o: TrainingOffer) {
  return {
    id: o.id,
    kind: o.kind,
    skillCode: o.skillCode,
    durationSeconds: o.durationSeconds,
    enduranceCost: o.enduranceCost,
    coinReward: o.coinReward,
    skillGain: o.skillGain,
    sortOrder: o.sortOrder,
  };
}

function serializeSession(s: TrainingSession) {
  const now = Date.now();
  const endsAtMs = s.endsAt.getTime();
  const remainingSeconds = Math.max(0, Math.ceil((endsAtMs - now) / 1000));
  return {
    id: s.id,
    kind: s.kind,
    skillCode: s.skillCode,
    durationSeconds: s.durationSeconds,
    enduranceCost: s.enduranceCost,
    coinReward: s.coinReward,
    skillGain: s.skillGain,
    chainBonus: s.chainBonus,
    status: s.status,
    chainColor: s.chainColor,
    startedAt: s.startedAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
    remainingSeconds,
    finishNowStarCost: finishNowStarCost(remainingSeconds),
  };
}

/** Stars to skip the wait — scales with time left (not coins). */
export function finishNowStarCost(remainingSeconds: number) {
  if (remainingSeconds <= 0) return 0;
  return Math.max(1, Math.ceil(remainingSeconds / 90));
}

export async function getTrainingState(userId: string) {
  const player = await getPlayerRow(userId);
  const chain = await ensureChainRow(player.id);

  let active: TrainingSession | null =
    (await findActiveSession(player.id)) ?? null;
  let lastCompletion: CompletionResult | null = null;

  if (active && active.endsAt.getTime() <= Date.now()) {
    lastCompletion = await completeSession(active, player);
    active = null;
  }

  const offers =
    active == null ? await ensureOffers(player) : ([] as TrainingOffer[]);

  const refreshedPlayer = await getPlayerByUserId(userId);

  return {
    player: refreshedPlayer,
    offers: offers.map(serializeOffer),
    activeSession: active ? serializeSession(active) : null,
    chain: {
      color: chain.color,
      nextIndex: chain.nextIndex,
      consecutive: chain.consecutive,
      nextSkillCode:
        chain.color != null
          ? TRAINING_CHAINS[player.position][chain.color as ChainColor][
              chain.nextIndex
            ] ?? null
          : null,
    },
    lastCompletion: lastCompletion
      ? {
          kind: lastCompletion.kind,
          skillCode: lastCompletion.skillCode,
          skillGain: lastCompletion.skillGain,
          chainBonus: lastCompletion.chainBonus,
          coinReward: lastCompletion.coinReward,
          newSkillValue: lastCompletion.newSkillValue,
          appliedToAll: lastCompletion.appliedToAll,
        }
      : null,
  };
}

export async function refreshTrainingOffers(userId: string) {
  const player = await getPlayerRow(userId);
  const active = await findActiveSession(player.id);
  if (active) {
    if (active.endsAt.getTime() <= Date.now()) {
      await completeSession(active, player);
    } else {
      throw new AppError(
        409,
        "Cannot refresh offers while training",
        "TRAINING_ACTIVE",
      );
    }
  }

  await clearOffers(player.id);
  return getTrainingState(userId);
}

export async function startTraining(userId: string, offerId: string) {
  const player = await getPlayerRow(userId);

  let active: TrainingSession | null =
    (await findActiveSession(player.id)) ?? null;
  if (active) {
    if (active.endsAt.getTime() <= Date.now()) {
      await completeSession(active, player);
      active = null;
    } else {
      throw new AppError(
        409,
        "You are already training",
        "TRAINING_ACTIVE",
      );
    }
  }

  const offer = await db.query.trainingOffers.findFirst({
    where: and(
      eq(trainingOffers.id, offerId),
      eq(trainingOffers.playerId, player.id),
    ),
  });

  if (!offer) {
    throw new AppError(404, "Training offer not found", "OFFER_NOT_FOUND");
  }

  if (player.enduranceCurrent < offer.enduranceCost) {
    throw new AppError(
      400,
      "Not enough endurance",
      "INSUFFICIENT_ENDURANCE",
    );
  }

  const kind = (offer.kind ?? "session") as TrainingOfferKind;
  const chain = await ensureChainRow(player.id);

  // All-round does not feed colour chains
  const advance =
    kind === "all_round" || offer.skillCode == null
      ? {
          color: null as ChainColor | null,
          nextIndex: 0,
          consecutive: 0,
          chainBonus: 0,
          matched: false,
        }
      : advanceTrainingChain(
          player.position,
          {
            color: (chain.color as ChainColor | null) ?? null,
            nextIndex: chain.nextIndex,
            consecutive: chain.consecutive,
          },
          offer.skillCode,
        );

  const now = new Date();
  const endsAt = new Date(now.getTime() + offer.durationSeconds * 1000);

  const [updatedPlayer] = await db
    .update(players)
    .set({
      enduranceCurrent: player.enduranceCurrent - offer.enduranceCost,
      updatedAt: now,
    })
    .where(eq(players.id, player.id))
    .returning();

  if (kind !== "all_round" && offer.skillCode != null) {
    await db
      .update(playerTrainingChain)
      .set({
        color: advance.color,
        nextIndex: advance.nextIndex,
        consecutive: advance.consecutive,
        updatedAt: now,
      })
      .where(eq(playerTrainingChain.playerId, player.id));
  }

  const [session] = await db
    .insert(trainingSessions)
    .values({
      playerId: player.id,
      kind,
      skillCode: offer.skillCode,
      durationSeconds: offer.durationSeconds,
      enduranceCost: offer.enduranceCost,
      coinReward: offer.coinReward,
      skillGain: offer.skillGain,
      chainBonus: advance.chainBonus,
      status: "active",
      chainColor: advance.color,
      startedAt: now,
      endsAt,
    })
    .returning();

  await clearOffers(player.id);

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "training.started",
    entityType: "training_session",
    entityId: session.id,
    metadata: {
      kind,
      skillCode: offer.skillCode,
      enduranceCost: offer.enduranceCost,
      durationSeconds: offer.durationSeconds,
      skillGain: offer.skillGain,
      chainBonus: advance.chainBonus,
      chainColor: advance.color,
      consecutive: advance.consecutive,
      fame: player.fame,
    },
  });

  return {
    session: serializeSession(session),
    player: {
      enduranceCurrent: updatedPlayer.enduranceCurrent,
      coins: updatedPlayer.coins,
      stars: updatedPlayer.stars,
    },
    chain: {
      color: advance.color,
      nextIndex: advance.nextIndex,
      consecutive: advance.consecutive,
      matched: advance.matched,
      chainBonus: advance.chainBonus,
    },
  };
}

export async function finishTrainingNow(userId: string) {
  const player = await getPlayerRow(userId);
  const active = await findActiveSession(player.id);

  if (!active) {
    throw new AppError(404, "No active training", "NO_ACTIVE_TRAINING");
  }

  const remainingSeconds = Math.max(
    0,
    Math.ceil((active.endsAt.getTime() - Date.now()) / 1000),
  );

  if (remainingSeconds <= 0) {
    await completeSession(active, player);
    return getTrainingState(userId);
  }

  const starCost = finishNowStarCost(remainingSeconds);
  if (player.stars < starCost) {
    throw new AppError(
      400,
      `Need ${starCost} stars to finish now`,
      "INSUFFICIENT_STARS",
    );
  }

  const [updatedPlayer] = await db
    .update(players)
    .set({
      stars: player.stars - starCost,
      updatedAt: new Date(),
    })
    .where(eq(players.id, player.id))
    .returning();

  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "training.finish_now",
    entityType: "training_session",
    entityId: active.id,
    metadata: {
      starCost,
      remainingSeconds,
      starsBefore: player.stars,
      starsAfter: updatedPlayer.stars,
    },
  });

  await completeSession(active, updatedPlayer);
  return getTrainingState(userId);
}

export async function claimTraining(userId: string) {
  const player = await getPlayerRow(userId);
  const active = await findActiveSession(player.id);

  if (!active) {
    // Already claimed / auto-completed — still return fresh skills
    return getTrainingState(userId);
  }

  if (active.endsAt.getTime() > Date.now()) {
    throw new AppError(
      400,
      "Training is not finished yet",
      "TRAINING_IN_PROGRESS",
    );
  }

  try {
    await completeSession(active, player);
  } catch (err) {
    // Parallel GET may have completed it first
    if (
      !(err instanceof AppError) ||
      err.code !== "NOT_ACTIVE"
    ) {
      throw err;
    }
  }
  return getTrainingState(userId);
}
