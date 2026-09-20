import { POSITION_SKILLS } from "./constants.js";
import type { PlayerPosition, SkillCode } from "../db/schema.js";

export type TrainingOfferKind =
  | "drill"
  | "session"
  | "intensive"
  | "all_round";

export type GeneratedOffer = {
  kind: TrainingOfferKind;
  skillCode: SkillCode | null;
  durationSeconds: number;
  enduranceCost: number;
  coinReward: number;
  skillGain: number;
  sortOrder: number;
};

/** Base templates at fame 0 — times in seconds, gains before fame scale. */
const KIND_BASE: Record<
  TrainingOfferKind,
  {
    durationSeconds: number;
    enduranceCost: number;
    skillGain: number;
    coinMin: number;
    coinMax: number;
  }
> = {
  /** Short focus on one skill. */
  drill: {
    durationSeconds: 120,
    enduranceCost: 6,
    skillGain: 3,
    coinMin: 5,
    coinMax: 9,
  },
  /** Standard pitch session (~3 min). */
  session: {
    durationSeconds: 180,
    enduranceCost: 10,
    skillGain: 5,
    coinMin: 8,
    coinMax: 13,
  },
  /** Long grind, big single-skill payoff. */
  intensive: {
    durationSeconds: 360,
    enduranceCost: 18,
    skillGain: 9,
    coinMin: 14,
    coinMax: 22,
  },
  /** Conditioning — +N to every skill. */
  all_round: {
    durationSeconds: 240,
    enduranceCost: 14,
    skillGain: 1,
    coinMin: 10,
    coinMax: 16,
  },
};

/**
 * Fame scales quality and time: better gains, longer sessions.
 * Soft caps so early game stays snappy.
 */
export function fameTrainingScale(fame: number) {
  const safe = Math.max(0, fame);
  const steps = Math.floor(safe / 50);
  const gainMult = 1 + Math.min(2, steps * 0.08); // ≤3× at ~1250 fame
  const timeMult = 1 + Math.min(1.5, steps * 0.05); // ≤2.5×
  return { gainMult, timeMult, steps };
}

/**
 * Local/dev: TRAINING_TIME_SCALE=0.5 halves all times.
 * Legacy TRAINING_DURATION_SECONDS=60 → scale vs 180s base session.
 */
export function trainingTimeScale() {
  if (process.env.TRAINING_TIME_SCALE) {
    const n = Number(process.env.TRAINING_TIME_SCALE);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  if (process.env.TRAINING_DURATION_SECONDS) {
    const n = Number(process.env.TRAINING_DURATION_SECONDS);
    if (Number.isFinite(n) && n > 0) {
      return Math.max(0.1, n / 180);
    }
  }
  return 1;
}

function randomInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Three varied kinds — always mixed focus, sometimes an all-rounder. */
function pickKindTrio(): TrainingOfferKind[] {
  const packs: TrainingOfferKind[][] = [
    ["drill", "session", "intensive"],
    ["drill", "session", "all_round"],
    ["session", "intensive", "all_round"],
    ["drill", "intensive", "all_round"],
    ["drill", "session", "session"],
    ["session", "session", "intensive"],
  ];
  return packs[Math.floor(Math.random() * packs.length)];
}

function buildOffer(
  kind: TrainingOfferKind,
  skillCode: SkillCode | null,
  fame: number,
  sortOrder: number,
): GeneratedOffer {
  const base = KIND_BASE[kind];
  const { gainMult, timeMult } = fameTrainingScale(fame);
  const envScale = trainingTimeScale();

  const durationSeconds = Math.max(
    30,
    Math.round(base.durationSeconds * timeMult * envScale),
  );
  const skillGain = Math.max(1, Math.round(base.skillGain * gainMult));
  const enduranceCost = base.enduranceCost;
  const coinReward = randomInt(
    Math.round(base.coinMin * (1 + (gainMult - 1) * 0.5)),
    Math.round(base.coinMax * (1 + (gainMult - 1) * 0.5)),
  );

  return {
    kind,
    skillCode: kind === "all_round" ? null : skillCode,
    durationSeconds,
    enduranceCost,
    coinReward,
    skillGain,
    sortOrder,
  };
}

/**
 * Three offers for this player: mixed kinds, fame-scaled time & gains.
 * Focus offers use the position’s 10 skills; all_round hits those 10.
 */
export function generateTrainingOffers(
  position: PlayerPosition,
  fame: number,
): GeneratedOffer[] {
  const kinds = pickKindTrio();
  const skillPool = shuffle(POSITION_SKILLS[position]);
  let skillIdx = 0;

  return kinds.map((kind, sortOrder) => {
    if (kind === "all_round") {
      return buildOffer(kind, null, fame, sortOrder);
    }
    const skillCode = skillPool[skillIdx % skillPool.length];
    skillIdx += 1;
    return buildOffer(kind, skillCode, fame, sortOrder);
  });
}

export const OFFER_KIND_LABELS: Record<TrainingOfferKind, string> = {
  drill: "Quick drill",
  session: "Training session",
  intensive: "Intensive",
  all_round: "All-round conditioning",
};
