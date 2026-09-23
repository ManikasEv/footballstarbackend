import type { SkillCode } from "../db/schema.js";

/** Kit shop — permanent gear with uncapped skill boosts (no tip jar / gels). */

export type GearShopSlot =
  | "shirt"
  | "shorts"
  | "socks"
  | "boots"
  | "special";

export type GearShopItem = {
  id: string;
  label: string;
  blurb: string;
  coinCost: number;
  starCost: number;
  kind: "gear";
  slot: GearShopSlot;
  skillCode: SkillCode;
  skillGain: number;
  accent: "blue" | "orange" | "green" | "purple";
};

const SKILL_MAP: Record<string, SkillCode> = {
  first_touch: "FIRST_TOUCH",
  dribbling: "DRIBBLING",
  strength: "STRENGTH",
};

const RARITY_GAIN: Record<string, number> = {
  common: 55,
  uncommon: 120,
  rare: 280,
  epic: 650,
};

type RawGear = {
  id: string;
  name: string;
  slot: GearShopSlot;
  rarity: string;
  price: { currency: "coins" | "stars"; amount: number };
  bonus: { skill: string; amount: number };
};

/** Keep IDs aligned with front-end item catalog. */
const RAW_GEAR: RawGear[] = [
  { id: "pitch_blue_shirt", name: "Pitch Blue Shirt", slot: "shirt", rarity: "common", price: { currency: "coins", amount: 120 }, bonus: { skill: "first_touch", amount: 55 } },
  { id: "touchline_stripes_shirt", name: "Touchline Stripes", slot: "shirt", rarity: "uncommon", price: { currency: "coins", amount: 320 }, bonus: { skill: "first_touch", amount: 120 } },
  { id: "playmaker_hoops_shirt", name: "Playmaker Hoops", slot: "shirt", rarity: "rare", price: { currency: "coins", amount: 620 }, bonus: { skill: "first_touch", amount: 280 } },
  { id: "midfield_halves_shirt", name: "Midfield Halves", slot: "shirt", rarity: "rare", price: { currency: "stars", amount: 12 }, bonus: { skill: "first_touch", amount: 280 } },
  { id: "captain_gold_shirt", name: "Captain Gold Shirt", slot: "shirt", rarity: "epic", price: { currency: "stars", amount: 36 }, bonus: { skill: "first_touch", amount: 650 } },
  { id: "club_navy_shorts", name: "Club Navy Shorts", slot: "shorts", rarity: "common", price: { currency: "coins", amount: 100 }, bonus: { skill: "strength", amount: 55 } },
  { id: "sprint_blue_shorts", name: "Sprint Blue Shorts", slot: "shorts", rarity: "uncommon", price: { currency: "coins", amount: 260 }, bonus: { skill: "dribbling", amount: 120 } },
  { id: "pro_white_shorts", name: "Pro White Shorts", slot: "shorts", rarity: "rare", price: { currency: "coins", amount: 560 }, bonus: { skill: "first_touch", amount: 280 } },
  { id: "night_match_shorts", name: "Night Match Shorts", slot: "shorts", rarity: "rare", price: { currency: "stars", amount: 11 }, bonus: { skill: "strength", amount: 280 } },
  { id: "gold_trim_shorts", name: "Gold Trim Shorts", slot: "shorts", rarity: "epic", price: { currency: "stars", amount: 32 }, bonus: { skill: "dribbling", amount: 650 } },
  { id: "classic_white_socks", name: "Classic White Socks", slot: "socks", rarity: "common", price: { currency: "coins", amount: 80 }, bonus: { skill: "strength", amount: 55 } },
  { id: "pitch_blue_socks", name: "Pitch Blue Socks", slot: "socks", rarity: "uncommon", price: { currency: "coins", amount: 240 }, bonus: { skill: "dribbling", amount: 120 } },
  { id: "royal_stripe_socks", name: "Royal Stripe Socks", slot: "socks", rarity: "rare", price: { currency: "coins", amount: 500 }, bonus: { skill: "first_touch", amount: 280 } },
  { id: "navy_compression_socks", name: "Navy Compression Socks", slot: "socks", rarity: "rare", price: { currency: "stars", amount: 10 }, bonus: { skill: "strength", amount: 280 } },
  { id: "gold_match_socks", name: "Gold Match Socks", slot: "socks", rarity: "epic", price: { currency: "stars", amount: 28 }, bonus: { skill: "dribbling", amount: 650 } },
  { id: "rookie_cleats", name: "Rookie Cleats", slot: "boots", rarity: "common", price: { currency: "coins", amount: 150 }, bonus: { skill: "dribbling", amount: 55 } },
  { id: "dash_red_boots", name: "Dash Red Boots", slot: "boots", rarity: "uncommon", price: { currency: "coins", amount: 360 }, bonus: { skill: "dribbling", amount: 120 } },
  { id: "control_blue_boots", name: "Control Blue Boots", slot: "boots", rarity: "rare", price: { currency: "coins", amount: 750 }, bonus: { skill: "first_touch", amount: 280 } },
  { id: "power_black_boots", name: "Power Black Boots", slot: "boots", rarity: "rare", price: { currency: "stars", amount: 15 }, bonus: { skill: "strength", amount: 280 } },
  { id: "golden_goal_boots", name: "Golden Goal Boots", slot: "boots", rarity: "epic", price: { currency: "stars", amount: 42 }, bonus: { skill: "dribbling", amount: 650 } },
  { id: "shin_guards", name: "Shin Guards", slot: "special", rarity: "common", price: { currency: "coins", amount: 210 }, bonus: { skill: "strength", amount: 55 } },
  { id: "wrist_tape", name: "Wrist Tape", slot: "special", rarity: "uncommon", price: { currency: "coins", amount: 360 }, bonus: { skill: "first_touch", amount: 120 } },
  { id: "captain_armband", name: "Captain Armband", slot: "special", rarity: "rare", price: { currency: "coins", amount: 700 }, bonus: { skill: "first_touch", amount: 280 } },
  { id: "keeper_gloves", name: "Keeper Gloves", slot: "special", rarity: "rare", price: { currency: "stars", amount: 15 }, bonus: { skill: "strength", amount: 280 } },
  { id: "compression_sleeves", name: "Compression Sleeves", slot: "special", rarity: "epic", price: { currency: "stars", amount: 38 }, bonus: { skill: "dribbling", amount: 650 } },
];

function accentFor(slot: GearShopSlot): GearShopItem["accent"] {
  switch (slot) {
    case "shirt":
      return "blue";
    case "shorts":
      return "green";
    case "socks":
      return "orange";
    case "boots":
      return "purple";
    default:
      return "blue";
  }
}

export const GEAR_SHOP_ITEMS: GearShopItem[] = RAW_GEAR.map((g) => {
  const skillCode = SKILL_MAP[g.bonus.skill] ?? "STRENGTH";
  const skillGain = RARITY_GAIN[g.rarity] ?? g.bonus.amount;
  return {
    id: g.id,
    label: g.name,
    blurb: `+${skillGain} ${g.bonus.skill.replace(/_/g, " ")} · ${g.slot}`,
    coinCost: g.price.currency === "coins" ? g.price.amount : 0,
    starCost: g.price.currency === "stars" ? g.price.amount : 0,
    kind: "gear" as const,
    slot: g.slot,
    skillCode,
    skillGain,
    accent: accentFor(g.slot),
  };
});

/** Bonuses from currently equipped kit ids in appearance.equipped. */
export function skillBonusesFromEquipped(
  equipped: unknown,
): Partial<Record<SkillCode, number>> {
  if (!equipped || typeof equipped !== "object") return {};
  const map = equipped as Record<string, unknown>;
  const out: Partial<Record<SkillCode, number>> = {};
  for (const item of GEAR_SHOP_ITEMS) {
    if (map[item.slot] !== item.id) continue;
    out[item.skillCode] = (out[item.skillCode] ?? 0) + item.skillGain;
  }
  return out;
}

export function applyGearBonusesToSkills(
  skills: Partial<Record<SkillCode, number>>,
  equipped: unknown,
): Partial<Record<SkillCode, number>> {
  const bonuses = skillBonusesFromEquipped(equipped);
  const next = { ...skills };
  for (const [code, amount] of Object.entries(bonuses) as [
    SkillCode,
    number,
  ][]) {
    next[code] = (next[code] ?? 0) + amount;
  }
  return next;
}
