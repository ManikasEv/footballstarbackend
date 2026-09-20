import type { PlayerPosition, SkillCode } from "../db/schema.js";

export type ChainColor = "red" | "yellow" | "blue" | "green";

export const CHAIN_COLORS: ChainColor[] = ["red", "yellow", "blue", "green"];

/**
 * Position training sequences — steps drawn from that class’s 10 skills.
 * Following consecutive correct steps awards chain bonuses.
 */
export const TRAINING_CHAINS: Record<
  PlayerPosition,
  Record<ChainColor, SkillCode[]>
> = {
  goalkeeper: {
    red: [
      "GK_SHORT_SAVE",
      "PASSING",
      "GK_REFLEXES",
      "FITNESS",
      "GK_ONE_ON_ONE",
    ],
    yellow: [
      "GK_LONG_SAVE",
      "STRENGTH",
      "GK_HEADER_SAVE",
      "RUNNING",
      "GK_COMMAND",
    ],
    blue: [
      "GK_REFLEXES",
      "GK_SHORT_SAVE",
      "PASSING",
      "GK_LONG_SAVE",
      "FITNESS",
    ],
    green: [
      "GK_ONE_ON_ONE",
      "GK_COMMAND",
      "RUNNING",
      "GK_HEADER_SAVE",
      "STRENGTH",
    ],
  },
  defender: {
    red: ["TACKLING", "PASSING", "MARKING", "FITNESS", "INTERCEPTION"],
    yellow: ["HEADING", "STRENGTH", "CLEARANCE", "RUNNING", "SLIDING"],
    blue: ["MARKING", "TACKLING", "PASSING", "HEADING", "FITNESS"],
    green: ["INTERCEPTION", "SLIDING", "CLEARANCE", "STRENGTH", "RUNNING"],
  },
  midfielder: {
    red: ["DRIBBLING", "PASSING", "VISION", "FITNESS", "CROSSING"],
    yellow: ["FINISHING", "LONG_SHOTS", "INTERCEPTION", "RUNNING", "STRENGTH"],
    blue: ["VISION", "DRIBBLING", "PASSING", "FINISHING", "FITNESS"],
    green: ["CROSSING", "INTERCEPTION", "LONG_SHOTS", "STRENGTH", "RUNNING"],
  },
  striker: {
    red: ["FINISHING", "DRIBBLING", "SHOT_POWER", "FITNESS", "OFF_BALL"],
    yellow: ["FIRST_TOUCH", "HEADING", "PASSING", "RUNNING", "STRENGTH"],
    blue: ["DRIBBLING", "FINISHING", "OFF_BALL", "SHOT_POWER", "FITNESS"],
    green: ["SHOT_POWER", "FIRST_TOUCH", "HEADING", "RUNNING", "PASSING"],
  },
};

/** 2 correct consecutive → +3 skill points */
export const CHAIN_BONUS_AT_2 = 3;
/** 3 correct consecutive → +10 skill points, then chain resets */
export const CHAIN_BONUS_AT_3 = 10;

export type ChainAdvanceResult = {
  color: ChainColor | null;
  nextIndex: number;
  consecutive: number;
  chainBonus: number;
  matched: boolean;
};

/**
 * Advance or reset chain based on the skill chosen for training.
 * Bonuses apply to the trained skill gain (server-side only).
 */
export function advanceTrainingChain(
  position: PlayerPosition,
  current: {
    color: ChainColor | null;
    nextIndex: number;
    consecutive: number;
  },
  skillCode: SkillCode,
): ChainAdvanceResult {
  const chains = TRAINING_CHAINS[position];

  // Continue active chain
  if (current.color) {
    const seq = chains[current.color];
    const expected = seq[current.nextIndex];
    if (expected === skillCode) {
      const consecutive = current.consecutive + 1;
      let chainBonus = 0;
      if (consecutive === 2) chainBonus = CHAIN_BONUS_AT_2;
      if (consecutive === 3) chainBonus = CHAIN_BONUS_AT_3;

      // After 3-in-a-row, chain must begin again
      if (consecutive >= 3) {
        return {
          color: null,
          nextIndex: 0,
          consecutive: 0,
          chainBonus,
          matched: true,
        };
      }

      const nextIndex = current.nextIndex + 1;
      if (nextIndex >= seq.length) {
        return {
          color: null,
          nextIndex: 0,
          consecutive: 0,
          chainBonus,
          matched: true,
        };
      }

      return {
        color: current.color,
        nextIndex,
        consecutive,
        chainBonus,
        matched: true,
      };
    }
  }

  // Start a new chain if this skill is the first step of any color
  for (const color of CHAIN_COLORS) {
    if (chains[color][0] === skillCode) {
      return {
        color,
        nextIndex: 1,
        consecutive: 1,
        chainBonus: 0,
        matched: true,
      };
    }
  }

  // Broke the chain / no match
  return {
    color: null,
    nextIndex: 0,
    consecutive: 0,
    chainBonus: 0,
    matched: false,
  };
}
