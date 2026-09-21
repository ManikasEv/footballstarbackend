import "dotenv/config";
import { eq, ilike } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { botPlayers, clubMemberships, clubs, players } from "../src/db/schema.js";

const testClubs = await db.query.clubs.findMany({
  where: ilike(clubs.name, "test"),
});
console.log(
  "test clubs:",
  testClubs.map((c) => ({ id: c.id, name: c.name, sys: c.isSystem })),
);

for (const c of testClubs) {
  if (c.isSystem === 1) continue;
  await db.delete(clubMemberships).where(eq(clubMemberships.clubId, c.id));
  await db.delete(botPlayers).where(eq(botPlayers.clubId, c.id));
  await db.delete(clubs).where(eq(clubs.id, c.id));
  console.log("deleted club", c.name);
}

const leftover = await db.query.players.findMany({
  where: ilike(players.displayName, "Manikas"),
});
console.log("Manikas players:", leftover.length);
process.exit(0);
