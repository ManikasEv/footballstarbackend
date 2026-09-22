import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  botPlayers,
  clubMemberships,
  clubs,
  fixtures,
  matches,
  playerMatchStats,
  playerSeasonStats,
  players,
  DEFAULT_CLUB_KIT,
  type ClubKit,
  type PlayerAppearance,
} from "../db/schema.js";
import { getOpenWorldOrThrow } from "../game/bootstrap.js";
import {
  applyKitToAppearance,
  botAppearanceFor,
} from "../game/clubCatalog.js";
import { matchFameFromStats } from "../game/fameCatalog.js";
import { TIREDNESS_MAX, tirednessFromMatch } from "../game/constants.js";
import {
  placeSquad,
  simulateMatch,
  type MatchActor,
  type MatchEvent,
} from "../game/matchSim.js";
import { AppError } from "../middleware/error.js";
import { ensureSystemLeagues, ensureClubBots } from "./clubs.js";
import {
  endSeasonIfComplete,
  maybeAdvanceCup,
} from "./seasons.js";

export type MatchSquadPlayer = {
  id: string;
  name: string;
  slot: string;
  position: string;
  playingStrength: number;
  isStarter: boolean;
  kind: "bot" | "human";
  appearance: Record<string, unknown>;
  baseX: number;
  baseY: number;
  side: "home" | "away";
};

function asAppearance(
  raw: unknown,
  clubName: string,
  index: number,
  kit: ClubKit,
): Record<string, unknown> {
  const base =
    raw && typeof raw === "object" && "gender" in (raw as object)
      ? (raw as PlayerAppearance)
      : botAppearanceFor(clubName, index, kit);
  return applyKitToAppearance(base, kit, clubName) as unknown as Record<
    string,
    unknown
  >;
}

async function loadClubSquad(
  clubId: string,
  clubName: string,
  side: "home" | "away",
  kit: ClubKit,
  human?: { id: string; name: string; position: string; appearance: PlayerAppearance; playingStrength: number } | null,
): Promise<{ actors: MatchActor[]; public: MatchSquadPlayer[] }> {
  const strip = kit ?? DEFAULT_CLUB_KIT;
  const bots = await db.query.botPlayers.findMany({
    where: eq(botPlayers.clubId, clubId),
  });

  const starters: Array<{
    id: string;
    name: string;
    slot: string;
    position: string;
    playingStrength: number;
    appearance: Record<string, unknown>;
    kind: "bot" | "human";
  }> = bots
    .filter((b) => b.isStarter === 1)
    .slice(0, 11)
    .map((b, i) => ({
      id: b.id,
      name: b.displayName,
      slot: b.slot,
      position: b.position,
      playingStrength: b.playingStrength,
      appearance: asAppearance(b.appearance, clubName, i, strip),
      kind: "bot" as const,
    }));

  // If human is on this club and shares a position with a starter bot, swap one in
  if (human) {
    const slotPrefer =
      human.position === "goalkeeper"
        ? "gk"
        : human.position === "defender"
          ? "cb"
          : human.position === "midfielder"
            ? "cm"
            : "st";
    const idx = starters.findIndex((s) => s.slot === slotPrefer);
    const replaceAt = idx >= 0 ? idx : Math.max(0, starters.length - 1);
    if (starters.length) {
      starters[replaceAt] = {
        id: human.id,
        name: human.name,
        slot: starters[replaceAt]!.slot,
        position: human.position,
        playingStrength: human.playingStrength,
        appearance: applyKitToAppearance(
          human.appearance,
          strip,
          clubName,
        ) as unknown as Record<string, unknown>,
        kind: "human",
      };
    }
  }

  while (starters.length < 11 && bots.length > starters.length) {
    const b = bots[starters.length]!;
    starters.push({
      id: b.id,
      name: b.displayName,
      slot: b.slot,
      position: b.position,
      playingStrength: b.playingStrength,
      appearance: asAppearance(b.appearance, clubName, starters.length, strip),
      kind: "bot",
    });
  }

  const actors = placeSquad(side, starters);
  const pub: MatchSquadPlayer[] = actors.map((a) => ({
    id: a.id,
    name: a.name,
    slot: a.slot,
    position: a.position,
    playingStrength: a.playingStrength,
    isStarter: true,
    kind: (starters.find((s) => s.id === a.id)?.kind ?? "bot") as "bot" | "human",
    appearance: a.appearance,
    baseX: a.baseX,
    baseY: a.baseY,
    side: a.side,
  }));

  return { actors, public: pub };
}

/** Start a test match for the caller's club vs a random bronze NPC side. */
export async function startTestMatch(userId: string) {
  const world = await getOpenWorldOrThrow();
  await ensureSystemLeagues(world.id);

  const player = await db.query.players.findFirst({
    where: eq(players.userId, userId),
  });
  if (!player) {
    throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  }

  const membership = await db.query.clubMemberships.findFirst({
    where: eq(clubMemberships.playerId, player.id),
    with: { club: true },
  });
  if (!membership?.club) {
    throw new AppError(400, "Join or create a club first", "NOT_IN_CLUB");
  }

  const myClub = membership.club;

  const homeKit = myClub.kit ?? DEFAULT_CLUB_KIT;
  await ensureClubBots(myClub.id, myClub.name, myClub.tier, homeKit);

  const opponents = await db.query.clubs.findMany({
    where: and(
      eq(clubs.worldId, world.id),
      eq(clubs.isSystem, 1),
      eq(clubs.tier, myClub.tier),
      ne(clubs.id, myClub.id),
    ),
  });
  if (!opponents.length) {
    throw new AppError(500, "No opponent clubs seeded", "NO_OPPONENTS");
  }

  const awayClub = opponents[Math.floor(Math.random() * opponents.length)]!;
  const awayKit = awayClub.kit ?? DEFAULT_CLUB_KIT;
  await ensureClubBots(awayClub.id, awayClub.name, awayClub.tier, awayKit);

  const homePack = await loadClubSquad(myClub.id, myClub.name, "home", homeKit, {
    id: player.id,
    name: player.displayName,
    position: player.position,
    appearance: player.appearance,
    playingStrength: player.playingStrength,
  });
  const awayPack = await loadClubSquad(
    awayClub.id,
    awayClub.name,
    "away",
    awayKit,
    null,
  );

  const seed = `${myClub.id}:${awayClub.id}:${Date.now()}`;
  const sim = simulateMatch(homePack.actors, awayPack.actors, seed);

  const [row] = await db
    .insert(matches)
    .values({
      worldId: world.id,
      homeClubId: myClub.id,
      awayClubId: awayClub.id,
      homeName: myClub.name,
      awayName: awayClub.name,
      status: "finished",
      isTest: 1,
      competition: "test",
      seed,
      homeScore: sim.homeScore,
      awayScore: sim.awayScore,
      events: sim.events,
      actorStats: sim.actorStats,
      squads: {
        home: homePack.public,
        away: awayPack.public,
      },
      kickoffAt: new Date(),
      finishedAt: new Date(),
    })
    .returning();

  return {
    match: {
      id: row!.id,
      homeName: myClub.name,
      awayName: awayClub.name,
      homeScore: sim.homeScore,
      awayScore: sim.awayScore,
      isTest: true,
      status: "finished" as const,
      durationMs: sim.durationMs,
      seed,
      fameAwarded: 0,
    },
    events: sim.events as MatchEvent[],
    squads: {
      home: homePack.public,
      away: awayPack.public,
    },
  };
}

async function humansOnClub(clubId: string) {
  const memberships = await db.query.clubMemberships.findMany({
    where: eq(clubMemberships.clubId, clubId),
  });
  const out: Array<{
    id: string;
    name: string;
    position: string;
    appearance: PlayerAppearance;
    playingStrength: number;
  }> = [];
  for (const m of memberships) {
    const p = await db.query.players.findFirst({ where: eq(players.id, m.playerId) });
    if (p) {
      out.push({
        id: p.id,
        name: p.displayName,
        position: p.position,
        appearance: p.appearance,
        playingStrength: p.playingStrength,
      });
    }
  }
  return out;
}

async function awardMatchFame(opts: {
  matchId: string;
  fixtureId: string | null;
  seasonId: string | null;
  competition: string;
  homeClubId: string;
  awayClubId: string;
  homeScore: number;
  awayScore: number;
  actorStats: Array<{
    id: string;
    minutes: number;
    goals: number;
    assists: number;
    shots: number;
    rating: number;
    wasStarter: boolean;
    wasSub: boolean;
    side: "home" | "away";
  }>;
  kindById: Map<string, "bot" | "human">;
}) {
  let totalFame = 0;
  for (const stat of opts.actorStats) {
    if (opts.kindById.get(stat.id) !== "human") continue;
    if (stat.minutes <= 0) continue;

    const teamWon =
      stat.side === "home"
        ? opts.homeScore > opts.awayScore
        : opts.awayScore > opts.homeScore;
    const teamDraw = opts.homeScore === opts.awayScore;
    const teamResult = teamWon ? "win" : teamDraw ? "draw" : "loss";

    const fame = matchFameFromStats({
      rating: stat.rating,
      goals: stat.goals,
      assists: stat.assists,
      teamResult,
      wasSub: stat.wasSub && !stat.wasStarter,
      minutes: stat.minutes,
    });
    if (fame <= 0) continue;

    await db.insert(playerMatchStats).values({
      matchId: opts.matchId,
      fixtureId: opts.fixtureId,
      seasonId: opts.seasonId,
      playerId: stat.id,
      clubId: stat.side === "home" ? opts.homeClubId : opts.awayClubId,
      competition: opts.competition,
      minutes: stat.minutes,
      goals: stat.goals,
      assists: stat.assists,
      shots: stat.shots,
      rating: stat.rating,
      wasStarter: stat.wasStarter ? 1 : 0,
      wasSub: stat.wasSub ? 1 : 0,
      fameAwarded: fame,
    });

    await db
      .update(players)
      .set({ fame: sql`${players.fame} + ${fame}` })
      .where(eq(players.id, stat.id));

    if (opts.seasonId) {
      let seasonRow = await db.query.playerSeasonStats.findFirst({
        where: and(
          eq(playerSeasonStats.seasonId, opts.seasonId),
          eq(playerSeasonStats.playerId, stat.id),
        ),
      });
      if (!seasonRow) {
        const [created] = await db
          .insert(playerSeasonStats)
          .values({
            seasonId: opts.seasonId,
            playerId: stat.id,
            clubId: stat.side === "home" ? opts.homeClubId : opts.awayClubId,
          })
          .returning();
        seasonRow = created!;
      }
      const leagueInc = opts.competition === "league" ? 1 : 0;
      const cupInc = opts.competition === "cup" ? 1 : 0;
      await db
        .update(playerSeasonStats)
        .set({
          leagueAppearances: sql`${playerSeasonStats.leagueAppearances} + ${leagueInc}`,
          cupAppearances: sql`${playerSeasonStats.cupAppearances} + ${cupInc}`,
          goals: sql`${playerSeasonStats.goals} + ${stat.goals}`,
          assists: sql`${playerSeasonStats.assists} + ${stat.assists}`,
          matchFame: sql`${playerSeasonStats.matchFame} + ${fame}`,
        })
        .where(eq(playerSeasonStats.id, seasonRow.id));
    }

    totalFame += fame;
  }
  return totalFame;
}

/** Play a scheduled league/cup fixture for a club the user belongs to. */
export async function playFixture(userId: string, fixtureId: string) {
  const player = await db.query.players.findFirst({
    where: eq(players.userId, userId),
  });
  if (!player) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");

  const membership = await db.query.clubMemberships.findFirst({
    where: eq(clubMemberships.playerId, player.id),
  });
  if (!membership) throw new AppError(400, "Not in a club", "NOT_IN_CLUB");

  const fixture = await db.query.fixtures.findFirst({
    where: eq(fixtures.id, fixtureId),
  });
  if (!fixture) throw new AppError(404, "Fixture not found", "FIXTURE_NOT_FOUND");
  if (fixture.status === "finished") {
    throw new AppError(400, "Fixture already played", "ALREADY_PLAYED");
  }
  if (
    fixture.homeClubId !== membership.clubId &&
    fixture.awayClubId !== membership.clubId
  ) {
    throw new AppError(403, "Not your fixture", "NOT_YOUR_FIXTURE");
  }

  const homeClub = await db.query.clubs.findFirst({
    where: eq(clubs.id, fixture.homeClubId),
  });
  const awayClub = await db.query.clubs.findFirst({
    where: eq(clubs.id, fixture.awayClubId),
  });
  if (!homeClub || !awayClub) {
    throw new AppError(500, "Clubs missing", "CLUBS_MISSING");
  }

  const homeKit = homeClub.kit ?? DEFAULT_CLUB_KIT;
  const awayKit = awayClub.kit ?? DEFAULT_CLUB_KIT;
  await ensureClubBots(homeClub.id, homeClub.name, homeClub.tier, homeKit);
  await ensureClubBots(awayClub.id, awayClub.name, awayClub.tier, awayKit);

  const homeHumans = await humansOnClub(homeClub.id);
  const awayHumans = await humansOnClub(awayClub.id);

  const homePack = await loadClubSquad(
    homeClub.id,
    homeClub.name,
    "home",
    homeKit,
    homeHumans[0] ?? null,
  );
  const awayPack = await loadClubSquad(
    awayClub.id,
    awayClub.name,
    "away",
    awayKit,
    awayHumans[0] ?? null,
  );

  // Swap in additional humans onto bench/starter slots when possible
  const kindById = new Map<string, "bot" | "human">();
  for (const p of [...homePack.public, ...awayPack.public]) {
    kindById.set(p.id, p.kind);
  }

  const seed = `${fixture.id}:${Date.now()}`;
  const sim = simulateMatch(homePack.actors, awayPack.actors, seed);
  const world = await getOpenWorldOrThrow();

  const [row] = await db
    .insert(matches)
    .values({
      worldId: world.id,
      fixtureId: fixture.id,
      homeClubId: homeClub.id,
      awayClubId: awayClub.id,
      homeName: homeClub.name,
      awayName: awayClub.name,
      status: "finished",
      isTest: 0,
      competition: fixture.competition,
      seed,
      homeScore: sim.homeScore,
      awayScore: sim.awayScore,
      events: sim.events,
      actorStats: sim.actorStats,
      squads: { home: homePack.public, away: awayPack.public },
      kickoffAt: fixture.kickoffAt,
      finishedAt: new Date(),
    })
    .returning();

  await db
    .update(fixtures)
    .set({
      status: "finished",
      homeScore: sim.homeScore,
      awayScore: sim.awayScore,
      matchId: row!.id,
    })
    .where(eq(fixtures.id, fixture.id));

  const fameAwarded = await awardMatchFame({
    matchId: row!.id,
    fixtureId: fixture.id,
    seasonId: fixture.seasonId,
    competition: fixture.competition,
    homeClubId: homeClub.id,
    awayClubId: awayClub.id,
    homeScore: sim.homeScore,
    awayScore: sim.awayScore,
    actorStats: sim.actorStats,
    kindById,
  });

  // Humans who played pick up tiredness (test matches skip this path)
  const now = new Date();
  for (const stat of sim.actorStats) {
    if (kindById.get(stat.id) !== "human" || stat.minutes <= 0) continue;
    const gain = tirednessFromMatch(stat.minutes, stat.wasStarter);
    const human = await db.query.players.findFirst({
      where: eq(players.id, stat.id),
    });
    if (!human) continue;
    await db
      .update(players)
      .set({
        tirednessCurrent: Math.min(
          TIREDNESS_MAX,
          (human.tirednessCurrent ?? 0) + gain,
        ),
        tirednessResetAt: now,
        updatedAt: now,
      })
      .where(eq(players.id, human.id));
  }

  if (fixture.competition === "cup" && fixture.cupId) {
    await maybeAdvanceCup(fixture.cupId);
  }
  if (fixture.competition === "league") {
    await endSeasonIfComplete(fixture.seasonId);
  }

  return {
    match: {
      id: row!.id,
      homeName: homeClub.name,
      awayName: awayClub.name,
      homeScore: sim.homeScore,
      awayScore: sim.awayScore,
      isTest: false,
      status: "finished" as const,
      durationMs: sim.durationMs,
      seed,
      competition: fixture.competition,
      fameAwarded,
    },
    events: sim.events as MatchEvent[],
    squads: {
      home: homePack.public,
      away: awayPack.public,
    },
  };
}

/** Next playable fixture for the user's club. */
export async function getNextFixture(userId: string) {
  const player = await db.query.players.findFirst({
    where: eq(players.userId, userId),
  });
  if (!player) throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  const membership = await db.query.clubMemberships.findFirst({
    where: eq(clubMemberships.playerId, player.id),
  });
  if (!membership) throw new AppError(400, "Not in a club", "NOT_IN_CLUB");

  const rows = await db
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.status, "scheduled"),
        or(
          eq(fixtures.homeClubId, membership.clubId),
          eq(fixtures.awayClubId, membership.clubId),
        ),
      ),
    )
    .orderBy(asc(fixtures.kickoffAt))
    .limit(1);
  return { fixture: rows[0] ?? null };
}

export async function getMatch(matchId: string) {
  const row = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!row) {
    throw new AppError(404, "Match not found", "MATCH_NOT_FOUND");
  }
  return {
    match: {
      id: row.id,
      homeName: row.homeName,
      awayName: row.awayName,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      isTest: row.isTest === 1,
      status: row.status,
      seed: row.seed,
      competition: row.competition,
      kickoffAt: row.kickoffAt?.toISOString?.() ?? row.kickoffAt,
      finishedAt: row.finishedAt?.toISOString?.() ?? row.finishedAt,
    },
    events: row.events as MatchEvent[],
    squads: row.squads as {
      home: MatchSquadPlayer[];
      away: MatchSquadPlayer[];
    },
  };
}

/** Recent matches for the caller's club (league + cup + tests). */
export async function listMyMatches(userId: string, limit = 20) {
  const player = await db.query.players.findFirst({
    where: eq(players.userId, userId),
  });
  if (!player) {
    throw new AppError(404, "Player not found", "PLAYER_NOT_FOUND");
  }
  const membership = await db.query.clubMemberships.findFirst({
    where: eq(clubMemberships.playerId, player.id),
  });
  if (!membership) {
    throw new AppError(400, "Not in a club", "NOT_IN_CLUB");
  }

  const rows = await db
    .select()
    .from(matches)
    .where(
      or(
        eq(matches.homeClubId, membership.clubId),
        eq(matches.awayClubId, membership.clubId),
      ),
    )
    .orderBy(sql`${matches.kickoffAt} desc nulls last`)
    .limit(Math.min(50, Math.max(1, limit)));

  return {
    matches: rows.map((row) => ({
      id: row.id,
      homeName: row.homeName,
      awayName: row.awayName,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      isTest: row.isTest === 1,
      competition: row.competition,
      status: row.status,
      kickoffAt: row.kickoffAt?.toISOString?.() ?? null,
      finishedAt: row.finishedAt?.toISOString?.() ?? null,
      usSide:
        row.homeClubId === membership.clubId
          ? ("home" as const)
          : ("away" as const),
    })),
  };
}
