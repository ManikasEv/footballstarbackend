import type { CupCode, LeagueTier } from "../db/schema.js";

/** Minimum league appearances to receive end-of-season place fame. */
export const LEAGUE_FAME_MIN_APPS = 8;

/** Minimum cup appearances to receive cup placement fame. */
export const CUP_FAME_MIN_APPS = 2;

/** Per-match fame from performance (humans who played, including subs). */
export function matchFameFromStats(input: {
  rating: number;
  goals: number;
  assists: number;
  teamResult: "win" | "draw" | "loss";
  wasSub: boolean;
  minutes: number;
}): number {
  if (input.minutes <= 0) return 0;
  let fame = 3 + Math.max(1, Math.min(10, input.rating));
  fame += input.goals * 5;
  fame += input.assists * 3;
  if (input.teamResult === "win") fame += 1;
  if (input.wasSub && input.minutes >= 1) fame += 2;
  return fame;
}

/** Place 1..8 fame at bronze; scaled by tier. */
export const LEAGUE_PLACE_FAME: number[] = [
  80, 60, 45, 35, 28, 22, 18, 15,
];

export const TIER_FAME_MULT: Record<LeagueTier, number> = {
  bronze: 1,
  silver: 1.25,
  gold: 1.5,
  platinum: 1.75,
  diamond: 2,
  champion: 2.5,
};

export function leaguePlaceFame(tier: LeagueTier, place1Based: number): number {
  const base = LEAGUE_PLACE_FAME[place1Based - 1] ?? 15;
  return Math.round(base * TIER_FAME_MULT[tier]);
}

/** Cup exit fame by furthest round reached (round size when eliminated / won). */
export const CUP_ROUND_FAME: Record<number, number> = {
  16: 10,
  8: 20,
  4: 35,
  2: 50, // runner-up (lost final)
  1: 80, // winner
};

export const CUP_FAME_MULT: Record<CupCode, number> = {
  bronze_silver: 1,
  gold_platinum: 1.4,
  diamond_champion: 1.8,
};

export function cupExitFame(code: CupCode, furthestRound: number): number {
  const base = CUP_ROUND_FAME[furthestRound] ?? 10;
  return Math.round(base * CUP_FAME_MULT[code]);
}

export const CUP_PAIRINGS: Array<{
  code: CupCode;
  low: LeagueTier;
  high: LeagueTier;
}> = [
  { code: "bronze_silver", low: "bronze", high: "silver" },
  { code: "gold_platinum", low: "gold", high: "platinum" },
  { code: "diamond_champion", low: "diamond", high: "champion" },
];
