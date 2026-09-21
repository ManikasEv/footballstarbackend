/**
 * One-off: delete player "Manikas" and club "test" so create-flow can be retested.
 * Run: npx tsx scripts/reset-manikas.ts
 */
import "dotenv/config";
import { eq, ilike } from "drizzle-orm";
import { db } from "../src/db/index.js";
import {
  botPlayers,
  clubMemberships,
  clubs,
  players,
} from "../src/db/schema.js";

async function main() {
  const named = await db.query.players.findMany({
    where: ilike(players.displayName, "Manikas"),
  });

  console.log(`Found ${named.length} player(s) named Manikas`);

  for (const p of named) {
    const membership = await db.query.clubMemberships.findFirst({
      where: eq(clubMemberships.playerId, p.id),
      with: { club: true },
    });

    if (membership?.club) {
      const clubId = membership.club.id;
      const clubName = membership.club.name;
      console.log(`  Leaving/dissolving club "${clubName}" (${clubId})`);
      await db.delete(clubMemberships).where(eq(clubMemberships.clubId, clubId));
      if (membership.club.isSystem !== 1) {
        await db.delete(botPlayers).where(eq(botPlayers.clubId, clubId));
        await db.delete(clubs).where(eq(clubs.id, clubId));
        console.log(`  Deleted player club + bots`);
      }
    }

    await db.delete(players).where(eq(players.id, p.id));
    console.log(`  Deleted player ${p.id}`);
  }

  // Any leftover club named exactly "test" that is not system
  const testClubs = await db.query.clubs.findMany({
    where: ilike(clubs.name, "test"),
  });
  for (const c of testClubs) {
    if (c.isSystem === 1) continue;
    console.log(`Deleting leftover club "${c.name}" (${c.id})`);
    await db.delete(clubMemberships).where(eq(clubMemberships.clubId, c.id));
    await db.delete(botPlayers).where(eq(botPlayers.clubId, c.id));
    await db.delete(clubs).where(eq(clubs.id, c.id));
  }

  console.log("Done — create player again from /create-player");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
