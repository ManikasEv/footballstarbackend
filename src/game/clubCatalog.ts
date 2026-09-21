import type { LeagueTier, PlayerPosition, SquadSlot } from "../db/schema.js";

/** 4-4-2 first XI + 4 bench = 15 bots per club. */
export type SquadTemplateSlot = {
  slot: SquadSlot;
  position: PlayerPosition;
  starter: boolean;
};

export const SQUAD_442: SquadTemplateSlot[] = [
  { slot: "gk", position: "goalkeeper", starter: true },
  { slot: "lb", position: "defender", starter: true },
  { slot: "cb", position: "defender", starter: true },
  { slot: "cb", position: "defender", starter: true },
  { slot: "rb", position: "defender", starter: true },
  { slot: "lm", position: "midfielder", starter: true },
  { slot: "cm", position: "midfielder", starter: true },
  { slot: "cm", position: "midfielder", starter: true },
  { slot: "rm", position: "midfielder", starter: true },
  { slot: "st", position: "striker", starter: true },
  { slot: "st", position: "striker", starter: true },
  { slot: "gk", position: "goalkeeper", starter: false },
  { slot: "cb", position: "defender", starter: false },
  { slot: "cm", position: "midfielder", starter: false },
  { slot: "st", position: "striker", starter: false },
];

export const LEAGUE_TIERS: LeagueTier[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "champion",
];

export const LEAGUE_LABELS: Record<LeagueTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
  champion: "Champion",
};

/** Rough PS band for bots in each tier. */
export const TIER_PS_RANGE: Record<LeagueTier, [number, number]> = {
  bronze: [90, 130],
  silver: [130, 170],
  gold: [170, 220],
  platinum: [220, 280],
  diamond: [280, 350],
  champion: [350, 450],
};

/** 8 seeded NPC clubs per league — not joinable by real players. */
export const SYSTEM_CLUB_NAMES: Record<LeagueTier, string[]> = {
  bronze: [
    "United Youth",
    "Coastal FC",
    "Steelworks Utd",
    "Harbor Athletic",
    "Mill Town",
    "Oak Park",
    "Brick Lane FC",
    "Dockside",
  ],
  silver: [
    "North End Rovers",
    "Riverside XI",
    "Valley Wanderers",
    "Summit Athletic",
    "Crown Bridge",
    "Ashford Town",
    "Redcliff",
    "Portside",
  ],
  gold: [
    "Metro Athletic",
    "Capitol FC",
    "Ironbridge",
    "Lakeside United",
    "Highlanders",
    "Southgate",
    "Eastbank",
    "Westfield",
  ],
  platinum: [
    "Royal Crescent",
    "Atlas FC",
    "Northern Lights",
    "Empire City",
    "Grand Harbor",
    "Silverwing",
    "Prime Athletic",
    "Orbit FC",
  ],
  diamond: [
    "Crystal Youth",
    "Apex United",
    "Nova Athletic",
    "Eclipse FC",
    "Vertex",
    "Titanium Town",
    "Aurora FC",
    "Zenith",
  ],
  champion: [
    "Dynasty FC",
    "Legend Athletic",
    "World Crown",
    "Infinity United",
    "Olympus FC",
    "Imperial XI",
    "Galaxy Town",
    "Throne City",
  ],
};

// Fix diamond name that might be problematic - Crystal Palace Youth is fine as youth fictional
const FIRST_NAMES = [
  "Alex", "Ben", "Chris", "Diego", "Eli", "Finn", "Gabe", "Hugo", "Ivan", "Jules",
  "Kai", "Leo", "Marco", "Nico", "Omar", "Pavel", "Quinn", "Rafa", "Sam", "Theo",
  "Uri", "Viktor", "Will", "Xander", "Yuri", "Zane", "Arlo", "Bruno", "Caleb", "Dario",
];

const LAST_NAMES = [
  "Adler", "Brooks", "Costa", "Dunn", "Ellis", "Frost", "Grant", "Hayes", "Ibarra",
  "Jones", "Klein", "Lane", "Moore", "Nash", "Ortiz", "Price", "Reed", "Stone",
  "Turner", "Vega", "Walsh", "Young", "Zimmerman", "Bennett", "Carter", "Diaz",
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function botNameFor(clubName: string, index: number): string {
  const rng = mulberry32(hash(`${clubName}:${index}`));
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]!;
  const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]!;
  return `${first} ${last}`;
}

export function botStrengthFor(
  tier: LeagueTier,
  clubName: string,
  index: number,
): number {
  const [lo, hi] = TIER_PS_RANGE[tier];
  const rng = mulberry32(hash(`ps:${clubName}:${index}`));
  return Math.round(lo + rng() * (hi - lo));
}
