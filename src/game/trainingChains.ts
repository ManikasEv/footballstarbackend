import type { PlayerPosition, SkillCode } from "../db/schema.js";

export type ChainColor = "red" | "yellow" | "blue" | "green";

export const CHAIN_COLORS: ChainColor[] = ["red", "yellow", "blue", "green"];

/**
 * Position training sequences (Feature Bible §10).
 * Following consecutive correct steps awards chain bonuses.
 */
export const TRAINING_CHAINS: Record<
  PlayerPosition,
  Record<ChainColor, SkillCode[]>
> = {
  goalkeeper: {
    red: ["PASSING", "GK_SHORT_SAVE", "GK_LONG_SAVE", "GK_HEADER_SAVE", "FITNESS"],
    yellow: ["GK_HEADER_SAVE", "PASSING", "GK_LONG_SAVE", "FITNESS", "GK_SHORT_SAVE"],
    blue: ["GK_LONG_SAVE", "PASSING", "GK_HEADER_SAVE", "GK_SHORT_SAVE", "FITNESS"],
    green: ["GK_SHORT_SAVE", "PASSING", "FITNESS", "GK_HEADER_SAVE", "GK_LONG_SAVE"],
  },
  defender: {
    red: ["DRIBBLING", "INTERCEPTION", "PASSING", "TACKLING", "FITNESS"],
    yellow: ["TACKLING", "DRIBBLING", "PASSING", "FITNESS", "INTERCEPTION"],
    blue: ["PASSING", "DRIBBLING", "TACKLING", "INTERCEPTION", "FITNESS"],
    green: ["INTERCEPTION", "DRIBBLING", "FITNESS", "TACKLING", "PASSING"],
  },
  midfielder: {
    red: ["FINISHING", "PASSING", "INTERCEPTION", "FITNESS", "DRIBBLING"],
    yellow: ["DRIBBLING", "PASSING", "FITNESS", "FINISHING", "INTERCEPTION"],
    blue: ["FITNESS", "PASSING", "DRIBBLING", "INTERCEPTION", "FINISHING"],
    green: ["INTERCEPTION", "PASSING", "FINISHING", "DRIBBLING", "FITNESS"],
  },
  striker: {
    red: ["DRIBBLING", "FINISHING", "PASSING", "RUNNING", "FITNESS"],
    yellow: ["RUNNING", "DRIBBLING", "PASSING", "FITNESS", "FINISHING"],
    blue: ["PASSING", "DRIBBLING", "RUNNING", "FINISHING", "FITNESS"],
    green: ["FINISHING", "DRIBBLING", "FITNESS", "RUNNING", "PASSING"],
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
