import { z } from "zod";

export const startTrainingSchema = z.object({
  offerId: z.string().uuid(),
});
