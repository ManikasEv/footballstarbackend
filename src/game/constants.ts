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

/** Cap for player endurance. */
export const ENDURANCE_MAX = 100;
/** +1 endurance every minute while below cap. */
export const ENDURANCE_REGEN_MS = 60_000;

/** Cap for tiredness (100 = exhausted). */
export const TIREDNESS_MAX = 100;
/** Recover −1 tiredness every 2 minutes while above 0. */
export const TIREDNESS_REGEN_MS = 120_000;

/**
 * Passive regen: +1 per minute since last tick, capped at ENDURANCE_MAX.
 * `enduranceResetAt` stores the last applied tick time (not midnight).
 */
export function applyEnduranceRegen(
  current: number,
  lastTickAt: Date,
  now = new Date(),
): { enduranceCurrent: number; lastTickAt: Date; changed: boolean } {
  // Legacy midnight-reset timestamps were in the future — clamp to now.
  const tick =
    lastTickAt.getTime() > now.getTime() ? now : lastTickAt;
  const migrated = tick.getTime() !== lastTickAt.getTime();

  if (current >= ENDURANCE_MAX) {
    return {
      enduranceCurrent: ENDURANCE_MAX,
      lastTickAt: tick,
      changed: migrated,
    };
  }

  const elapsed = Math.max(0, now.getTime() - tick.getTime());
  const gained = Math.min(
    ENDURANCE_MAX - current,
    Math.floor(elapsed / ENDURANCE_REGEN_MS),
  );
  if (gained <= 0) {
    return {
      enduranceCurrent: current,
      lastTickAt: tick,
      changed: migrated,
    };
  }

  return {
    enduranceCurrent: current + gained,
    lastTickAt: new Date(tick.getTime() + gained * ENDURANCE_REGEN_MS),
    changed: true,
  };
}

/**
 * Passive recovery: −1 tiredness every 2 minutes toward 0.
 * `tirednessResetAt` stores the last applied recovery tick.
 */
export function applyTirednessRegen(
  current: number,
  lastTickAt: Date,
  now = new Date(),
): { tirednessCurrent: number; lastTickAt: Date; changed: boolean } {
  const tick =
    lastTickAt.getTime() > now.getTime() ? now : lastTickAt;
  const migrated = tick.getTime() !== lastTickAt.getTime();
  const clamped = Math.max(0, Math.min(TIREDNESS_MAX, current));

  if (clamped <= 0) {
    return {
      tirednessCurrent: 0,
      lastTickAt: tick,
      changed: migrated || clamped !== current,
    };
  }

  const elapsed = Math.max(0, now.getTime() - tick.getTime());
  const recovered = Math.min(
    clamped,
    Math.floor(elapsed / TIREDNESS_REGEN_MS),
  );
  if (recovered <= 0) {
    return {
      tirednessCurrent: clamped,
      lastTickAt: tick,
      changed: migrated || clamped !== current,
    };
  }

  return {
    tirednessCurrent: clamped - recovered,
    lastTickAt: new Date(tick.getTime() + recovered * TIREDNESS_REGEN_MS),
    changed: true,
  };
}

/** Tiredness gained from a training session (scales with endurance cost). */
export function tirednessFromTraining(enduranceCost: number): number {
  return Math.max(2, Math.min(25, Math.round(enduranceCost * 0.45)));
}

/** Tiredness from playing a competitive match (starter vs sub). */
export function tirednessFromMatch(minutes: number, wasStarter: boolean): number {
  if (minutes <= 0) return 0;
  const base = wasStarter ? 18 : 8;
  const scaled = Math.round(base * (Math.min(90, minutes) / 90));
  return Math.max(4, Math.min(28, scaled));
}

/** @deprecated Midnight reset removed — endurance now regens +1/min. */
export function nextUtcMidnight(from = new Date()): Date {
  const next = new Date(from);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

export const DEFAULT_WORLD_NAME = "World 1";
export const BASE_SKILL_VALUE = 10;
export const STARTING_POSITION_SKILL_BONUS = 4;
