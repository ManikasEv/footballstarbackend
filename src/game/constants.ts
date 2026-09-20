import type { PlayerPosition, SkillCode } from "../db/schema.js";

/**
 * Skill model (mature SoccerStar-style):
 * - 4 general skills — same for every class, kept on position change
 * - 6 class skills — unique set per position, rebuild on position change
 * - Skills are **uncapped** (no 100 ceiling); UI bars wrap every 100 pts
 * Playing Strength = sum of the 10 (4 + 6) for the current position.
 */

export const GENERAL_SKILLS: SkillCode[] = [
  "FITNESS",
  "RUNNING",
  "PASSING",
  "STRENGTH",
];

export const CLASS_SKILLS: Record<PlayerPosition, SkillCode[]> = {
  goalkeeper: [
    "GK_SHORT_SAVE",
    "GK_LONG_SAVE",
    "GK_HEADER_SAVE",
    "GK_ONE_ON_ONE",
    "GK_REFLEXES",
    "GK_COMMAND",
  ],
  defender: [
    "TACKLING",
    "INTERCEPTION",
    "HEADING",
    "MARKING",
    "CLEARANCE",
    "SLIDING",
  ],
  midfielder: [
    "DRIBBLING",
    "INTERCEPTION",
    "FINISHING",
    "CROSSING",
    "VISION",
    "LONG_SHOTS",
  ],
  striker: [
    "DRIBBLING",
    "FINISHING",
    "HEADING",
    "FIRST_TOUCH",
    "SHOT_POWER",
    "OFF_BALL",
  ],
};

/** Ten skills shown / trained / counted for PS on this position. */
export const POSITION_SKILLS: Record<PlayerPosition, SkillCode[]> = {
  goalkeeper: [...GENERAL_SKILLS, ...CLASS_SKILLS.goalkeeper],
  defender: [...GENERAL_SKILLS, ...CLASS_SKILLS.defender],
  midfielder: [...GENERAL_SKILLS, ...CLASS_SKILLS.midfielder],
  striker: [...GENERAL_SKILLS, ...CLASS_SKILLS.striker],
};

/** Every skill code that can exist on a player row. */
export const ALL_SKILL_CODES: SkillCode[] = [
  "FITNESS",
  "RUNNING",
  "PASSING",
  "STRENGTH",
  "DRIBBLING",
  "TACKLING",
  "INTERCEPTION",
  "FINISHING",
  "HEADING",
  "MARKING",
  "CLEARANCE",
  "SLIDING",
  "CROSSING",
  "VISION",
  "LONG_SHOTS",
  "FIRST_TOUCH",
  "SHOT_POWER",
  "OFF_BALL",
  "GK_SHORT_SAVE",
  "GK_LONG_SAVE",
  "GK_HEADER_SAVE",
  "GK_ONE_ON_ONE",
  "GK_REFLEXES",
  "GK_COMMAND",
];

export const SKILL_LABELS: Record<SkillCode, string> = {
  FITNESS: "Fitness",
  RUNNING: "Running",
  PASSING: "Passing",
  STRENGTH: "Strength",
  DRIBBLING: "Dribbling",
  TACKLING: "Tackling",
  INTERCEPTION: "Interception",
  FINISHING: "Finishing",
  HEADING: "Heading",
  MARKING: "Marking",
  CLEARANCE: "Clearance",
  SLIDING: "Sliding tackle",
  CROSSING: "Crossing",
  VISION: "Vision",
  LONG_SHOTS: "Long shots",
  FIRST_TOUCH: "First touch",
  SHOT_POWER: "Shot power",
  OFF_BALL: "Off the ball",
  GK_SHORT_SAVE: "Short-range saves",
  GK_LONG_SAVE: "Long-range saves",
  GK_HEADER_SAVE: "Header saves",
  GK_ONE_ON_ONE: "One-on-ones",
  GK_REFLEXES: "Reflexes",
  GK_COMMAND: "Command of box",
};

/**
 * Values after switching position:
 * - 4 general skills keep trained values
 * - new class skills start fresh (base + bonus)
 * - unused skills reset to base
 */
export function skillsAfterPositionChange(
  newPosition: PlayerPosition,
  current: Partial<Record<SkillCode, number>>,
): Record<SkillCode, number> {
  const general = new Set(GENERAL_SKILLS);
  const classSet = new Set(CLASS_SKILLS[newPosition]);
  const next = {} as Record<SkillCode, number>;

  for (const code of ALL_SKILL_CODES) {
    if (general.has(code)) {
      next[code] = current[code] ?? BASE_SKILL_VALUE;
    } else if (classSet.has(code)) {
      next[code] = BASE_SKILL_VALUE + STARTING_POSITION_SKILL_BONUS;
    } else {
      next[code] = BASE_SKILL_VALUE;
    }
  }

  return next;
}

/** Sum of the ten position skills (4 general + 6 class). */
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
