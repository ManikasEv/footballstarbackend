import type {
  LeagueTier,
  PlayerAppearance,
  PlayerPosition,
  SquadSlot,
} from "../db/schema.js";

/** 4-4-2 first XI + 11 bench = 22 bots (max squad capacity). */
export type SquadTemplateSlot = {
  slot: SquadSlot;
  position: PlayerPosition;
  starter: boolean;
};

export const MAX_SQUAD_SIZE = 22;

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
  { slot: "lb", position: "defender", starter: false },
  { slot: "cb", position: "defender", starter: false },
  { slot: "rb", position: "defender", starter: false },
  { slot: "lm", position: "midfielder", starter: false },
  { slot: "cm", position: "midfielder", starter: false },
  { slot: "cm", position: "midfielder", starter: false },
  { slot: "rm", position: "midfielder", starter: false },
  { slot: "st", position: "striker", starter: false },
  { slot: "st", position: "striker", starter: false },
  { slot: "cb", position: "defender", starter: false },
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

/** 8 seeded NPC clubs per league — replaced when a player creates a club. */
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

/** Extra NPC names when opening Bronze League 2, 3, … */
const EXTRA_NPC_POOL = [
  "Harbor Youth",
  "Pinewood FC",
  "Cedar Athletic",
  "Riverbend",
  "Stonegate",
  "Fairview Town",
  "Maple XI",
  "Bayfront",
  "Hillcrest",
  "Glen Rovers",
  "Parkside United",
  "Meadow FC",
  "Brookfield",
  "Ash Grove",
  "Cliffside",
  "Lakeview",
  "Ridge Athletic",
  "Townsend",
  "Foxhollow",
  "Windmill FC",
  "Chapel End",
  "Bridgewater",
  "Sandstone",
  "Ironwood",
];

/** 8 unique system names for a division (1 = base catalog). */
export function systemNamesForDivision(
  tier: LeagueTier,
  divisionIndex: number,
): string[] {
  if (divisionIndex <= 1) return [...SYSTEM_CLUB_NAMES[tier]];
  const rng = mulberry32(hash(`div:${tier}:${divisionIndex}`));
  const used = new Set<string>();
  const out: string[] = [];
  const pool = [...EXTRA_NPC_POOL];
  while (out.length < 8) {
    const idx = Math.floor(rng() * pool.length);
    const base = pool[idx] ?? `NPC ${out.length + 1}`;
    const name =
      divisionIndex > 2 ? `${base} ${divisionIndex}` : base;
    if (used.has(name)) {
      out.push(`${base} ${tier[0]!.toUpperCase()}${divisionIndex}-${out.length}`);
    } else {
      used.add(name);
      out.push(name);
    }
  }
  return out;
}

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

const SKINS = ["skin_0", "skin_1", "skin_2", "skin_3", "skin_4"] as const;
const HAIRS_M = [
  "textured_crop",
  "side_part",
  "tight_curls",
  "buzz_cut",
  "swept_back",
] as const;
const HAIR_COLORS = ["hair_0", "hair_1", "hair_2", "hair_3", "hair_4"] as const;
const EYES = ["friendly", "focused", "relaxed", "bright", "confident"] as const;
const BROWS = ["natural", "straight", "arched", "angled", "soft"] as const;
const NOSES = ["button", "straight", "rounded", "broad", "hooked"] as const;
const MOUTHS = ["gentle", "smile", "neutral", "grin", "smirk"] as const;
const FACIAL = [
  null,
  null,
  "stubble",
  "moustache",
  "goatee",
  "short_boxed",
] as const;
const SHIRTS = ["home", "solid", "vertical", "hoops", "diagonal", "halves"] as const;

/** Deterministic illustrated look for a bot (same catalog as real players). */
export function botAppearanceFor(
  clubName: string,
  index: number,
  shirtPatternId = "home",
): PlayerAppearance {
  const rng = mulberry32(hash(`look:${clubName}:${index}`));
  const pick = <T,>(arr: readonly T[]) =>
    arr[Math.floor(rng() * arr.length)]!;

  const hairStyleId = pick(HAIRS_M);
  const skinToneId = pick(SKINS);
  const hairColorId = pick(HAIR_COLORS);
  const facialHairId = pick(FACIAL);

  return {
    schemaVersion: 4,
    gender: "male",
    skinToneId,
    hairStyleId,
    hairColorId,
    browStyleId: pick(BROWS),
    eyeStyleId: pick(EYES),
    eyeColorId: pick(["eye_0", "eye_1", "eye_2", "eye_3", "eye_4"] as const),
    noseStyleId: pick(NOSES),
    mouthStyleId: pick(MOUTHS),
    facialHairId,
    accessoryIds: [],
    shirtPatternId: shirtPatternId === "home" ? pick(SHIRTS) : shirtPatternId,
    shortsColourId: pick([
      "colour-1",
      "colour-2",
      "colour-3",
      "colour-4",
      "colour-5",
    ] as const),
    socksColourId: pick([
      "colour-1",
      "colour-2",
      "colour-3",
      "colour-4",
      "colour-5",
    ] as const),
    bootsColourId: pick([
      "colour-1",
      "colour-2",
      "colour-3",
      "colour-4",
      "colour-5",
    ] as const),
    kitId: "home",
    clubName,
    clubRole: null,
    skinColour: "medium",
    hairColour: "brown",
    hairStyle: "short",
  };
}
