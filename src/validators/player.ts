import { z } from "zod";

export const playerPositionSchema = z.enum([
  "goalkeeper",
  "defender",
  "midfielder",
  "striker",
]);

export const playerGenderSchema = z.enum(["male", "female"]);

const FREE_MALE_HAIR = [
  "textured_crop",
  "side_part",
  "tight_curls",
  "buzz_cut",
  "swept_back",
] as const;

const FREE_FEMALE_HAIR = [
  "pixie",
  "bob",
  "long_straight",
  "wavy",
  "twin_braids",
] as const;

const FREE_ACCESSORIES = [
  "blue_headband",
  "clear_glasses",
  "black_studs",
] as const;

const FREE_FACIAL_HAIR = [
  "stubble",
  "moustache",
  "goatee",
  "short_boxed",
  "full_trimmed",
] as const;

const SKIN_TONES = [
  "skin_0",
  "skin_1",
  "skin_2",
  "skin_3",
  "skin_4",
] as const;

const BROWS = [
  "natural",
  "straight",
  "arched",
  "angled",
  "soft",
] as const;

const EYES = [
  "friendly",
  "focused",
  "relaxed",
  "bright",
  "confident",
] as const;

const NOSES = [
  "button",
  "straight",
  "rounded",
  "broad",
  "hooked",
] as const;

const MOUTHS = [
  "gentle",
  "smile",
  "neutral",
  "grin",
  "smirk",
] as const;

const SHIRTS = [
  "home",
  "solid",
  "vertical",
  "hoops",
  "diagonal",
  "halves",
] as const;

const COLOURWAYS = [
  "colour-1",
  "colour-2",
  "colour-3",
  "colour-4",
  "colour-5",
] as const;

const HAIR_COLORS = [
  "hair_0",
  "hair_1",
  "hair_2",
  "hair_3",
  "hair_4",
] as const;

const EYE_COLORS = [
  "eye_0",
  "eye_1",
  "eye_2",
  "eye_3",
  "eye_4",
] as const;

const EYE_ID_MAP: Record<string, string> = {
  eyes_friendly: "friendly",
  eyes_focused: "focused",
  eyes_relaxed: "relaxed",
  eyes_confident: "confident",
  eyes_bright: "bright",
};

const NOSE_ID_MAP: Record<string, string> = {
  nose_straight: "straight",
  nose_rounded: "rounded",
  nose_broad: "broad",
  nose_hooked: "hooked",
  nose_button: "button",
};

const MOUTH_ID_MAP: Record<string, string> = {
  mouth_smile: "smile",
  mouth_neutral: "neutral",
  mouth_grin: "grin",
  mouth_smirk: "smirk",
  mouth_gentle: "gentle",
};

const HAIR_ID_MAP: Record<string, string> = {
  shaggy: "textured_crop",
  mohawk: "buzz_cut",
  shoulder_length: "swept_back",
  high_ponytail: "pixie",
  top_bun: "bob",
  side_swept_undercut: "pixie",
};

const SKIN_ID_MAP: Record<string, string> = {
  light_warm: "skin_0",
  light_medium: "skin_1",
  medium_warm: "skin_2",
  golden_brown: "skin_3",
  deep_brown: "skin_4",
  very_deep_brown: "skin_4",
  fair_cool: "skin_0",
  medium_golden: "skin_2",
  tan_olive: "skin_3",
  rich_dark_brown: "skin_4",
};

const HAIR_COLOR_MAP: Record<string, string> = {
  black: "hair_1",
  dark_brown: "hair_0",
  brown: "hair_0",
  light_brown: "hair_2",
  sandy: "hair_2",
  blonde: "hair_2",
  auburn: "hair_3",
  gray: "hair_4",
  silver: "hair_4",
  blue: "hair_1",
  purple: "hair_1",
};

const EYE_COLOR_MAP: Record<string, string> = {
  brown: "eye_0",
  blue: "eye_1",
  green: "eye_2",
  gray: "eye_3",
  hazel: "eye_4",
};

function migrate(raw: string | undefined, map: Record<string, string>) {
  if (!raw) return undefined;
  return map[raw] ?? raw;
}

/** Clean player kit — schemaVersion 4 blank-face + layered kit. */
export const playerAppearanceSchema = z
  .object({
    schemaVersion: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    gender: playerGenderSchema.default("male"),
    skinToneId: z.string().min(1).max(64).optional(),
    hairStyleId: z.string().min(1).max(64).optional(),
    hairColorId: z.string().min(1).max(64).optional(),
    browStyleId: z.string().min(1).max(64).optional(),
    eyeStyleId: z.string().min(1).max(64).optional(),
    eyeColorId: z.string().min(1).max(64).optional(),
    noseStyleId: z.string().min(1).max(64).optional(),
    mouthStyleId: z.string().min(1).max(64).optional(),
    facialHairId: z.string().min(1).max(64).nullable().optional(),
    accessoryIds: z.array(z.string().min(1).max(64)).max(4).optional(),
    shirtPatternId: z.string().min(1).max(64).optional(),
    shortsColourId: z.string().min(1).max(64).optional(),
    socksColourId: z.string().min(1).max(64).optional(),
    bootsColourId: z.string().min(1).max(64).optional(),
    kitId: z.string().min(1).max(64).optional(),
    unlockedHairIds: z.array(z.string().min(1).max(64)).max(16).optional(),
    clubName: z.string().min(2).max(40).nullable().optional(),
    skinColour: z.string().min(1).max(32).optional(),
    hairColour: z.string().min(1).max(32).optional(),
    hairStyle: z.string().min(1).max(32).optional(),
  })
  .transform((raw) => {
    const gender = raw.gender;
    const freeHair =
      gender === "female" ? FREE_FEMALE_HAIR : FREE_MALE_HAIR;
    const unlockedHairIds = [...new Set(raw.unlockedHairIds ?? [])];
    const allowedHair = new Set<string>([...freeHair, ...unlockedHairIds]);

    let skinToneId =
      migrate(raw.skinToneId, SKIN_ID_MAP) ??
      (gender === "female" ? "skin_2" : "skin_1");
    if (!(SKIN_TONES as readonly string[]).includes(skinToneId)) {
      skinToneId = gender === "female" ? "skin_2" : "skin_1";
    }

    let hairStyleId =
      migrate(raw.hairStyleId, HAIR_ID_MAP) ??
      (gender === "female" ? "pixie" : "textured_crop");
    if (!allowedHair.has(hairStyleId)) {
      hairStyleId = gender === "female" ? "pixie" : "textured_crop";
    }

    let hairColorId =
      migrate(raw.hairColorId, HAIR_COLOR_MAP) ?? "hair_0";
    if (!(HAIR_COLORS as readonly string[]).includes(hairColorId)) {
      hairColorId = "hair_0";
    }

    let eyeColorId =
      migrate(raw.eyeColorId, EYE_COLOR_MAP) ?? "eye_0";
    if (!(EYE_COLORS as readonly string[]).includes(eyeColorId)) {
      eyeColorId = "eye_0";
    }

    let browStyleId = raw.browStyleId ?? "natural";
    if (!(BROWS as readonly string[]).includes(browStyleId)) {
      browStyleId = "natural";
    }

    let eyeStyleId = migrate(raw.eyeStyleId, EYE_ID_MAP) ?? "friendly";
    if (!(EYES as readonly string[]).includes(eyeStyleId)) {
      eyeStyleId = "friendly";
    }

    let noseStyleId = migrate(raw.noseStyleId, NOSE_ID_MAP) ?? "straight";
    if (!(NOSES as readonly string[]).includes(noseStyleId)) {
      noseStyleId = "straight";
    }

    let mouthStyleId = migrate(raw.mouthStyleId, MOUTH_ID_MAP) ?? "smile";
    if (!(MOUTHS as readonly string[]).includes(mouthStyleId)) {
      mouthStyleId = "smile";
    }

    const accessoryIds = (raw.accessoryIds ?? []).filter((id) =>
      (FREE_ACCESSORIES as readonly string[]).includes(id),
    );

    let facialHairId: string | null = null;
    if (gender !== "female" && raw.facialHairId) {
      facialHairId = (FREE_FACIAL_HAIR as readonly string[]).includes(
        raw.facialHairId,
      )
        ? raw.facialHairId
        : null;
    }

    let shirtPatternId =
      raw.shirtPatternId ??
      (raw.kitId === "home_blue" ? "home" : raw.kitId) ??
      "home";
    if (!(SHIRTS as readonly string[]).includes(shirtPatternId)) {
      shirtPatternId = "home";
    }

    const colourOr = (id: string | undefined, fallback: string) =>
      id && (COLOURWAYS as readonly string[]).includes(id) ? id : fallback;

    const shortsColourId = colourOr(raw.shortsColourId, "colour-1");
    const socksColourId = colourOr(raw.socksColourId, "colour-1");
    const bootsColourId = colourOr(raw.bootsColourId, "colour-1");

    const skinColour =
      raw.skinColour ??
      ({
        skin_0: "fair",
        skin_1: "light",
        skin_2: "medium",
        skin_3: "tan",
        skin_4: "dark",
      }[skinToneId] ?? "medium");

    const hairStyle =
      raw.hairStyle ??
      ({
        textured_crop: "short",
        side_part: "short",
        tight_curls: "medium",
        buzz_cut: "buzz",
        swept_back: "short",
        pixie: "short",
        bob: "medium",
        long_straight: "long",
        wavy: "medium",
        twin_braids: "long",
      }[hairStyleId] ?? "short");

    const hairColour =
      raw.hairColour ??
      ({
        hair_0: "brown",
        hair_1: "black",
        hair_2: "blonde",
        hair_3: "red",
        hair_4: "gray",
      }[hairColorId] ?? "brown");

    return {
      schemaVersion: 4 as const,
      gender,
      skinToneId,
      hairStyleId,
      hairColorId,
      browStyleId,
      eyeStyleId,
      eyeColorId,
      noseStyleId,
      mouthStyleId,
      facialHairId,
      accessoryIds,
      shirtPatternId,
      shortsColourId,
      socksColourId,
      bootsColourId,
      kitId: shirtPatternId,
      unlockedHairIds,
      clubName: raw.clubName ?? null,
      skinColour,
      hairColour,
      hairStyle,
    };
  });

export const createPlayerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(3, "Display name must be at least 3 characters")
    .max(24, "Display name must be at most 24 characters")
    .regex(
      /^[a-zA-Z0-9 _-]+$/,
      "Display name may only contain letters, numbers, spaces, hyphens and underscores",
    ),
  position: playerPositionSchema,
  appearance: playerAppearanceSchema,
});

export const changePositionSchema = z.object({
  position: playerPositionSchema,
});

export const updateTacticsSchema = z.object({
  passingStyle: z.enum(["conservative", "balanced", "risky"]),
  foulIntensity: z.enum(["careful", "normal", "aggressive"]),
});

export const updateAppearanceSchema = playerAppearanceSchema;

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type PlayerAppearanceInput = z.infer<typeof playerAppearanceSchema>;
export type UpdateTacticsInput = z.infer<typeof updateTacticsSchema>;
export type UpdateAppearanceInput = z.infer<typeof updateAppearanceSchema>;
