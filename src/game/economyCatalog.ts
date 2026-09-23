/** Static catalogs for Work / Store / Fitness / Stars — server-authoritative prices. */

import type { SkillCode } from "../db/schema.js";
import { GEAR_SHOP_ITEMS } from "./gearCatalog.js";

export type WorkJob = {
  id: string;
  label: string;
  blurb: string;
  enduranceCost: number;
  coinReward: number;
  durationLabel: string;
  accent: "blue" | "orange" | "green" | "purple";
};

export type ShopItem = {
  id: string;
  label: string;
  blurb: string;
  coinCost: number;
  starCost: number;
  kind: "gear";
  slot: "shirt" | "shorts" | "socks" | "boots" | "special";
  skillCode: SkillCode;
  skillGain: number;
  accent: "blue" | "orange" | "green" | "purple";
};

export type FitnessItem = {
  id: string;
  label: string;
  blurb: string;
  coinCost: number;
  starCost: number;
  enduranceRestore: number;
  accent: "green" | "blue" | "orange";
};

export type StarPack = {
  id: string;
  label: string;
  blurb: string;
  /** Coins spent to receive stars (soft exchange). */
  coinCost: number;
  starsGranted: number;
  accent: "blue" | "purple" | "orange";
};

export const WORK_JOBS: WorkJob[] = [
  {
    id: "ball_boy",
    label: "Ball boy",
    blurb: "Chase balls at the local pitch.",
    enduranceCost: 8,
    coinReward: 25,
    durationLabel: "Quick",
    accent: "green",
  },
  {
    id: "kit_wash",
    label: "Kit wash",
    blurb: "Scrub boots and hang the nets.",
    enduranceCost: 14,
    coinReward: 55,
    durationLabel: "Shift",
    accent: "blue",
  },
  {
    id: "youth_coach",
    label: "Youth coach",
    blurb: "Run cones for the under-12s.",
    enduranceCost: 22,
    coinReward: 95,
    durationLabel: "Session",
    accent: "orange",
  },
  {
    id: "street_match",
    label: "Street match",
    blurb: "Pick-up game for a side bet.",
    enduranceCost: 30,
    coinReward: 140,
    durationLabel: "Match",
    accent: "purple",
  },
];

export const SHOP_ITEMS: ShopItem[] = GEAR_SHOP_ITEMS;

export type SpaItem = {
  id: string;
  label: string;
  blurb: string;
  coinCost: number;
  starCost: number;
  tirednessRestore: number;
  accent: "green" | "blue" | "orange" | "purple";
};

export const FITNESS_ITEMS: FitnessItem[] = [
  {
    id: "water",
    label: "Water bottle",
    blurb: "Sip and recover.",
    coinCost: 20,
    starCost: 0,
    enduranceRestore: 15,
    accent: "blue",
  },
  {
    id: "energy_drink",
    label: "Energy drink",
    blurb: "Sweet boost for the next drill.",
    coinCost: 45,
    starCost: 0,
    enduranceRestore: 35,
    accent: "green",
  },
  {
    id: "recovery_shake",
    label: "Recovery shake",
    blurb: "Near-full tank, premium price.",
    coinCost: 0,
    starCost: 2,
    enduranceRestore: 60,
    accent: "orange",
  },
  {
    id: "full_rest",
    label: "Physio nap",
    blurb: "Fill endurance to the top.",
    coinCost: 0,
    starCost: 5,
    enduranceRestore: 100,
    accent: "green",
  },
];

export const STAR_PACKS: StarPack[] = [
  {
    id: "handful",
    label: "Handful",
    blurb: "A few blue stars from the exchange.",
    coinCost: 100,
    starsGranted: 5,
    accent: "blue",
  },
  {
    id: "pocket",
    label: "Pocket pack",
    blurb: "Better rate for regulars.",
    coinCost: 250,
    starsGranted: 15,
    accent: "purple",
  },
  {
    id: "boot_bag",
    label: "Boot bag",
    blurb: "Best soft-currency deal.",
    coinCost: 500,
    starsGranted: 40,
    accent: "orange",
  },
];

export const SPA_ITEMS: SpaItem[] = [
  {
    id: "quick_rinse",
    label: "Quick rinse",
    blurb: "A cold splash. A fresh start.",
    coinCost: 25,
    starCost: 0,
    tirednessRestore: 12,
    accent: "blue",
  },
  {
    id: "steam_room",
    label: "Steam room",
    blurb: "Warm up. Wind down.",
    coinCost: 55,
    starCost: 0,
    tirednessRestore: 28,
    accent: "green",
  },
  {
    id: "deep_tissue",
    label: "Deep tissue",
    blurb: "Give those match legs a break.",
    coinCost: 0,
    starCost: 2,
    tirednessRestore: 50,
    accent: "orange",
  },
  {
    id: "full_spa_day",
    label: "Full spa day",
    blurb: "Leave every bit of tiredness behind.",
    coinCost: 0,
    starCost: 5,
    tirednessRestore: 100,
    accent: "purple",
  },
];
