import type { PlayerPosition, SkillCode } from "../db/schema.js";

/** All skill codes stored per player (position skills drive Playing Strength). */
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

/** Skills that survive a position change (general athleticism). */
export const GENERAL_SKILLS: SkillCode[] = ["FITNESS", "RUNNING"];

/**
 * Values after switching position:
 * - general skills keep trained values
 * - new role’s relevant skills start fresh (base + bonus)
 * - everything else resets to base
 */
export function skillsAfterPositionChange(
  newPosition: PlayerPosition,
  current: Partial<Record<SkillCode, number>>,
): Record<SkillCode, number> {
  const general = new Set(GENERAL_SKILLS);
  const relevant = new Set(POSITION_SKILLS[newPosition]);
  const next = {} as Record<SkillCode, number>;

  for (const code of ALL_SKILL_CODES) {
    if (general.has(code)) {
      next[code] = current[code] ?? BASE_SKILL_VALUE;
    } else if (relevant.has(code)) {
      next[code] = BASE_SKILL_VALUE + STARTING_POSITION_SKILL_BONUS;
    } else {
      next[code] = BASE_SKILL_VALUE;
    }
  }

  return next;
}

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
