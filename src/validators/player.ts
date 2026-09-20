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
  "shaggy",
  "side_part",
  "tight_curls",
  "buzz_cut",
  "swept_back",
] as const;

const FREE_FEMALE_HAIR = [
  "high_ponytail",
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
  "white_sweatband",
] as const;

const FREE_FACIAL_HAIR = [
  "stubble",
  "moustache",
  "goatee",
  "short_boxed",
  "full_trimmed",
  "rugged_medium",
] as const;

const MALE_SKINS = [
  "light_warm",
  "light_medium",
  "medium_warm",
  "golden_brown",
  "deep_brown",
  "very_deep_brown",
] as const;

const FEMALE_SKINS = [
  "fair_cool",
  "light_warm",
  "medium_golden",
  "tan_olive",
  "deep_brown",
  "rich_dark_brown",
] as const;

/** Illustrated Create Player — schemaVersion 3 with male/female. */
export const playerAppearanceSchema = z
  .object({
    schemaVersion: z.union([z.literal(2), z.literal(3)]).optional(),
    gender: playerGenderSchema.default("male"),
    skinToneId: z.string().min(1).max(64).optional(),
    hairStyleId: z.string().min(1).max(64).optional(),
    hairColorId: z.string().min(1).max(64).optional(),
    eyeStyleId: z.string().min(1).max(64).optional(),
    eyeColorId: z.string().min(1).max(64).optional(),
    noseStyleId: z.string().min(1).max(64).optional(),
    mouthStyleId: z.string().min(1).max(64).optional(),
    facialHairId: z.string().min(1).max(64).nullable().optional(),
    accessoryIds: z.array(z.string().min(1).max(64)).max(4).optional(),
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
    const skins = gender === "female" ? FEMALE_SKINS : MALE_SKINS;
    const unlockedHairIds = [...new Set(raw.unlockedHairIds ?? [])];
    const allowedHair = new Set<string>([...freeHair, ...unlockedHairIds]);

    let skinToneId = raw.skinToneId ?? (gender === "female" ? "medium_golden" : "light_medium");
    if (!(skins as readonly string[]).includes(skinToneId)) {
      skinToneId = gender === "female" ? "medium_golden" : "light_medium";
    }

    let hairStyleId =
      raw.hairStyleId ??
      (gender === "female" ? "high_ponytail" : "textured_crop");
    if (!allowedHair.has(hairStyleId)) {
      hairStyleId = gender === "female" ? "high_ponytail" : "textured_crop";
    }

    const hairColorId = raw.hairColorId ?? "brown";
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

    const skinColour =
      raw.skinColour ??
      (gender === "female"
        ? {
            fair_cool: "fair",
            light_warm: "light",
            medium_golden: "medium",
            tan_olive: "tan",
            deep_brown: "dark",
            rich_dark_brown: "dark",
          }[skinToneId]
        : {
            light_warm: "fair",
            light_medium: "light",
            medium_warm: "medium",
            golden_brown: "tan",
            deep_brown: "dark",
            very_deep_brown: "dark",
          }[skinToneId]) ??
      "medium";

    const hairStyle =
      raw.hairStyle ??
      ({
        textured_crop: "short",
        shaggy: "medium",
        side_part: "short",
        tight_curls: "medium",
        buzz_cut: "buzz",
        swept_back: "short",
        high_ponytail: "ponytail",
        pixie: "short",
        bob: "medium",
        long_straight: "long",
        wavy: "medium",
        twin_braids: "long",
      }[hairStyleId] ?? "short");

    const hairColour =
      raw.hairColour ??
      ({
        black: "black",
        dark_brown: "brown",
        brown: "brown",
        light_brown: "brown",
        sandy: "blonde",
        blonde: "blonde",
        auburn: "red",
        blue: "black",
        purple: "black",
        gray: "gray",
        silver: "gray",
      }[hairColorId] ?? "brown");

    return {
      schemaVersion: 3 as const,
      gender,
      skinToneId,
      hairStyleId,
      hairColorId,
      eyeStyleId: raw.eyeStyleId ?? "eyes_friendly",
      eyeColorId: raw.eyeColorId ?? "brown",
      noseStyleId: raw.noseStyleId ?? "nose_straight",
      mouthStyleId: raw.mouthStyleId ?? "mouth_smile",
      facialHairId,
      accessoryIds,
      kitId: raw.kitId ?? "home_blue",
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
