import { z } from "zod";

export const playerPositionSchema = z.enum([
  "goalkeeper",
  "defender",
  "midfielder",
  "striker",
]);

export const playerGenderSchema = z.enum(["male", "female"]);

/** Phase 1 appearance — enough for create; expand when art exists. */
export const playerAppearanceSchema = z.object({
  gender: playerGenderSchema,
  skinColour: z.enum(["fair", "light", "medium", "tan", "dark"]),
  hairColour: z.enum(["black", "brown", "blonde", "red", "gray"]),
  hairStyle: z.enum(["buzz", "short", "medium", "long", "ponytail"]),
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

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type PlayerAppearanceInput = z.infer<typeof playerAppearanceSchema>;
