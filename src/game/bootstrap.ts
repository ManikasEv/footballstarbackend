import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { worlds } from "../db/schema.js";
import { DEFAULT_WORLD_NAME } from "./constants.js";

/** Ensures World 1 exists and is open (idempotent). */
export async function ensureBootstrapData() {
  const byName = await db.query.worlds.findFirst({
    where: eq(worlds.name, DEFAULT_WORLD_NAME),
  });

  if (!byName) {
    await db.insert(worlds).values({
      name: DEFAULT_WORLD_NAME,
      status: "open",
      openedAt: new Date(),
    });
    return;
  }

  if (byName.status !== "open") {
    await db
      .update(worlds)
      .set({ status: "open", openedAt: byName.openedAt ?? new Date() })
      .where(eq(worlds.id, byName.id));
  }
}

export async function getOpenWorldOrThrow() {
  await ensureBootstrapData();

  const world = await db.query.worlds.findFirst({
    where: eq(worlds.name, DEFAULT_WORLD_NAME),
  });

  if (!world || world.status !== "open") {
    throw new Error("World 1 is not available");
  }

  return world;
}
