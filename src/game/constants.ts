import type { PlayerPosition, SkillCode } from "../db/schema.js";

/** All skill codes stored per player so position switches keep trained values. */
export const ALL_SKILL_CODES: SkillCode[] = [
  "PASSING",
  "FITNESS",
  "DRIBBLING",
  "TACKLING",
  "INTERCEPTION",
  "FINISHING",
  "RUNNING",
  "GK_SHORT_SAVE",
  "GK_HEADER_SAVE",
  "GK_LONG_SAVE",
];

export const SKILL_LABELS: Record<SkillCode, string> = {
  PASSING: "Passing",
  FITNESS: "Fitness",
  DRIBBLING: "Dribbling",
  TACKLING: "Tackling",
  INTERCEPTION: "Pass interception",
  FINISHING: "Finishing",
  RUNNING: "Running",
  GK_SHORT_SAVE: "Short-range saves",
  GK_HEADER_SAVE: "Header saves",
  GK_LONG_SAVE: "Long-range saves",
};

/** Five relevant abilities per position (Feature Bible §5). */
export const POSITION_SKILLS: Record<PlayerPosition, SkillCode[]> = {
  goalkeeper: [
    "PASSING",
    "GK_SHORT_SAVE",
    "GK_HEADER_SAVE",
    "GK_LONG_SAVE",
    "FITNESS",
  ],
  defender: [
    "DRIBBLING",
    "TACKLING",
    "PASSING",
    "INTERCEPTION",
    "FITNESS",
  ],
  midfielder: [
    "DRIBBLING",
    "INTERCEPTION",
    "PASSING",
    "FINISHING",
    "FITNESS",
  ],
  striker: ["DRIBBLING", "FINISHING", "PASSING", "RUNNING", "FITNESS"],
};

/**
 * Placeholder Playing Strength until equipment/nutrition/club bonuses exist.
 * Sum of the five position-relevant skills. Server-only — never trust client.
 */
export function computePlayingStrength(
  position: PlayerPosition,
  skills: Partial<Record<SkillCode, number>>,
): number {
  return POSITION_SKILLS[position].reduce(
    (sum, code) => sum + (skills[code] ?? 0),
    0,
  );
}

/** Next UTC midnight for mature endurance reset (no passive regen). */
export function nextUtcMidnight(from = new Date()): Date {
  const next = new Date(from);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

export const DEFAULT_WORLD_NAME = "World 1";
export const BASE_SKILL_VALUE = 10;
export const STARTING_POSITION_SKILL_BONUS = 4;
