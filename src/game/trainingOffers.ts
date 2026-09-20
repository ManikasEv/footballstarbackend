import { POSITION_SKILLS } from "./constants.js";
import type { PlayerPosition, SkillCode } from "../db/schema.js";

/** Placeholder balance — tune later via config, not client. */
export function getTrainingDefaults() {
  return {
    /** Mature game ~10 minutes; override with TRAINING_DURATION_SECONDS */
    durationSeconds: Number(process.env.TRAINING_DURATION_SECONDS) || 600,
    enduranceCost: 10,
    baseSkillGain: 4,
    coinRewardMin: 8,
    coinRewardMax: 14,
  };
}

export type GeneratedOffer = {
  skillCode: SkillCode;
  durationSeconds: number;
  enduranceCost: number;
  coinReward: number;
  skillGain: number;
  sortOrder: number;
};

function randomInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Three offers drawn from the player's position-relevant skills. */
export function generateTrainingOffers(
  position: PlayerPosition,
): GeneratedOffer[] {
  const defaults = getTrainingDefaults();
  const pool = [...POSITION_SKILLS[position]];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const picked = pool.slice(0, 3);
  while (picked.length < 3) {
    picked.push(pool[picked.length % pool.length]);
  }

  return picked.map((skillCode, sortOrder) => ({
    skillCode,
    durationSeconds: defaults.durationSeconds,
    enduranceCost: defaults.enduranceCost,
    coinReward: randomInt(defaults.coinRewardMin, defaults.coinRewardMax),
    skillGain: defaults.baseSkillGain,
    sortOrder,
  }));
}
