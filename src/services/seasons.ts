import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  botPlayers,
  clubMemberships,
  clubs,
  cups,
  fixtures,
  leagueGroupClubs,
  leagueGroups,
  players,
  playerSeasonStats,
  seasons,
  type Club,
  type CupCode,
  type LeagueTier,
  type Season,
} from "../db/schema.js";
import { getOpenWorldOrThrow } from "../game/bootstrap.js";
import {
  LEAGUE_TIERS,
  MAX_SQUAD_SIZE,
  SQUAD_442,
  botAppearanceFor,
  botNameFor,
  botStrengthFor,
  systemNamesForDivision,
} from "../game/clubCatalog.js";
import {
  CUP_FAME_MIN_APPS,
  CUP_PAIRINGS,
  LEAGUE_FAME_MIN_APPS,
  cupExitFame,
  leaguePlaceFame,
} from "../game/fameCatalog.js";
import { AppError } from "../middleware/error.js";

const LEAGUE_MATCHDAYS = 14;

async function insertBotSquad(
  clubId: string,
  clubName: string,
  tier: LeagueTier,
) {
  await db.insert(botPlayers).values(
    SQUAD_442.map((slot, index) => ({
      clubId,
      displayName: botNameFor(clubName, index),
      position: slot.position,
      slot: slot.slot,
      isStarter: slot.starter ? 1 : 0,
      playingStrength: botStrengthFor(tier, clubName, index),
      tirednessCurrent: 0,
      appearance: botAppearanceFor(clubName, index),
    })),
  );
}

export async function ensureClubBots(
  clubId: string,
  clubName: string,
  tier: LeagueTier,
) {
  const botCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(botPlayers)
    .where(eq(botPlayers.clubId, clubId));
  if ((botCount[0]?.n ?? 0) >= MAX_SQUAD_SIZE) return;
  await db.delete(botPlayers).where(eq(botPlayers.clubId, clubId));
  await insertBotSquad(clubId, clubName, tier);
}

function nextSaturday(from: Date): Date {
  const d = new Date(from);
  d.setHours(15, 0, 0, 0);
  const day = d.getDay();
  if (day === 6) {
    d.setDate(d.getDate() + 7);
    return d;
  }
  d.setDate(d.getDate() + ((6 - day + 7) % 7));
  return d;
}

/** Circle method: 8 teams → 14 matchdays (H&A). */
export function generateRoundRobinPairs(clubIds: string[]): Array<{
  matchday: number;
  homeId: string;
  awayId: string;
}> {
  const n = clubIds.length;
  if (n !== 8) throw new Error("League groups must have 8 clubs");
  const ids = [...clubIds];
  const half = n / 2;
  const firstHalf: Array<{ matchday: number; homeId: string; awayId: string }> =
    [];

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < half; i++) {
      const home = ids[i]!;
      const away = ids[n - 1 - i]!;
      if (round % 2 === 0) {
        firstHalf.push({ matchday: round + 1, homeId: home, awayId: away });
      } else {
        firstHalf.push({ matchday: round + 1, homeId: away, awayId: home });
      }
    }
    const fixed = ids[0]!;
    const rest = ids.slice(1);
    rest.unshift(rest.pop()!);
    ids.splice(0, ids.length, fixed, ...rest);
  }

  const secondHalf = firstHalf.map((f) => ({
    matchday: f.matchday + (n - 1),
    homeId: f.awayId,
    awayId: f.homeId,
  }));
  return [...firstHalf, ...secondHalf];
}

async function createSystemClub(
  worldId: string,
  name: string,
  tier: LeagueTier,
): Promise<Club> {
  const existing = await db.query.clubs.findFirst({
    where: and(eq(clubs.worldId, worldId), eq(clubs.name, name)),
  });
  if (existing) {
    await ensureClubBots(existing.id, existing.name, tier);
    if (existing.tier !== tier) {
      await db.update(clubs).set({ tier }).where(eq(clubs.id, existing.id));
      return { ...existing, tier };
    }
    return existing;
  }
  const [club] = await db
    .insert(clubs)
    .values({ worldId, name, tier, isSystem: 1 })
    .returning();
  await insertBotSquad(club!.id, name, tier);
  return club!;
}

async function createLeagueGroupWithClubs(
  seasonId: string,
  worldId: string,
  tier: LeagueTier,
  divisionIndex: number,
): Promise<{ groupId: string; clubIds: string[] }> {
  const [group] = await db
    .insert(leagueGroups)
    .values({ seasonId, tier, divisionIndex })
    .returning();

  const names = systemNamesForDivision(tier, divisionIndex);
  const clubIds: string[] = [];
  for (const name of names) {
    let finalName = name;
    let suffix = 2;
    while (
      await db.query.clubs.findFirst({
        where: and(eq(clubs.worldId, worldId), eq(clubs.name, finalName)),
      })
    ) {
      finalName = `${name} ${suffix++}`;
    }
    const club = await createSystemClub(worldId, finalName, tier);
    await db.insert(leagueGroupClubs).values({
      leagueGroupId: group!.id,
      clubId: club.id,
    });
    clubIds.push(club.id);
  }
  return { groupId: group!.id, clubIds };
}

async function insertLeagueFixtures(
  seasonId: string,
  groupId: string,
  clubIds: string[],
  seasonStart: Date,
) {
  const pairs = generateRoundRobinPairs(clubIds);
  let kick = nextSaturday(seasonStart);
  const byMatchday = new Map<number, typeof pairs>();
  for (const p of pairs) {
    const list = byMatchday.get(p.matchday) ?? [];
    list.push(p);
    byMatchday.set(p.matchday, list);
  }
  const rows = [];
  for (let md = 1; md <= LEAGUE_MATCHDAYS; md++) {
    for (const p of byMatchday.get(md) ?? []) {
      rows.push({
        seasonId,
        competition: "league" as const,
        leagueGroupId: groupId,
        cupId: null,
        round: md,
        leg: 1,
        homeClubId: p.homeId,
        awayClubId: p.awayId,
        kickoffAt: new Date(kick),
        status: "scheduled" as const,
      });
    }
    kick = nextSaturday(new Date(kick.getTime() + 24 * 3600 * 1000));
  }
  if (rows.length) await db.insert(fixtures).values(rows);
}

function shuffle<T>(arr: T[], seed: string): T[] {
  const a = [...arr];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = a.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 1 | h);
    const j = Math.floor(((h >>> 0) / 4294967296) * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

async function seedCup(
  seasonId: string,
  code: CupCode,
  low: LeagueTier,
  high: LeagueTier,
  seasonStart: Date,
) {
  const existing = await db.query.cups.findFirst({
    where: and(eq(cups.seasonId, seasonId), eq(cups.code, code)),
  });
  if (existing) return;

  const groups = await db.query.leagueGroups.findMany({
    where: eq(leagueGroups.seasonId, seasonId),
  });
  const lowGroups = groups.filter((g) => g.tier === low);
  const highGroups = groups.filter((g) => g.tier === high);
  if (!lowGroups.length || !highGroups.length) return;

  const highClubIds: string[] = [];
  for (const g of highGroups) {
    const rows = await db.query.leagueGroupClubs.findMany({
      where: eq(leagueGroupClubs.leagueGroupId, g.id),
    });
    highClubIds.push(...rows.map((r) => r.clubId));
  }
  const lowClubIds: string[] = [];
  for (const g of lowGroups) {
    const rows = await db.query.leagueGroupClubs.findMany({
      where: eq(leagueGroupClubs.leagueGroupId, g.id),
    });
    lowClubIds.push(...rows.map((r) => r.clubId));
  }

  // 8 from high tier + 8 best from low tier (by current season points across divisions)
  const rankByPoints = async (groupList: typeof lowGroups, clubIdList: string[]) => {
    const scored: Array<{ id: string; pts: number; gd: number; gf: number }> = [];
    for (const g of groupList) {
      const table = await computeGroupStandings(g.id);
      for (const row of table) {
        if (clubIdList.includes(row.clubId)) {
          scored.push({
            id: row.clubId,
            pts: row.pts,
            gd: row.gd,
            gf: row.gf,
          });
        }
      }
    }
    // Include any clubs missing from standings (0 pts)
    for (const id of clubIdList) {
      if (!scored.some((s) => s.id === id)) {
        scored.push({ id, pts: 0, gd: 0, gf: 0 });
      }
    }
    scored.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    return scored.map((s) => s.id);
  };

  const highRanked = await rankByPoints(highGroups, highClubIds);
  const lowRanked = await rankByPoints(lowGroups, lowClubIds);
  const highEight = highRanked.slice(0, 8);
  const lowEight = lowRanked.slice(0, 8);
  if (highEight.length < 8 || lowEight.length < 8) return;

  const entrants = shuffle(
    [...highEight, ...lowEight],
    `${seasonId}:${code}:draw`,
  );
  const [cup] = await db
    .insert(cups)
    .values({ seasonId, code, status: "active" })
    .returning();

  let kick = nextSaturday(
    new Date(seasonStart.getTime() + 8 * 7 * 24 * 3600 * 1000),
  );
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const home = entrants[i * 2]!;
    const away = entrants[i * 2 + 1]!;
    const leg2 = nextSaturday(new Date(kick.getTime() + 24 * 3600 * 1000));
    rows.push({
      seasonId,
      competition: "cup" as const,
      leagueGroupId: null,
      cupId: cup!.id,
      round: 16,
      leg: 1,
      homeClubId: home,
      awayClubId: away,
      kickoffAt: new Date(kick),
      status: "scheduled" as const,
    });
    rows.push({
      seasonId,
      competition: "cup" as const,
      leagueGroupId: null,
      cupId: cup!.id,
      round: 16,
      leg: 2,
      homeClubId: away,
      awayClubId: home,
      kickoffAt: leg2,
      status: "scheduled" as const,
    });
  }
  await db.insert(fixtures).values(rows);
}

async function seedSeasonStructure(season: Season) {
  for (const tier of LEAGUE_TIERS) {
    const existing = await db.query.leagueGroups.findFirst({
      where: and(
        eq(leagueGroups.seasonId, season.id),
        eq(leagueGroups.tier, tier),
        eq(leagueGroups.divisionIndex, 1),
      ),
    });
    if (existing) continue;
    const { groupId, clubIds } = await createLeagueGroupWithClubs(
      season.id,
      season.worldId,
      tier,
      1,
    );
    await insertLeagueFixtures(season.id, groupId, clubIds, season.startsAt);
  }
  for (const pair of CUP_PAIRINGS) {
    await seedCup(
      season.id,
      pair.code,
      pair.low,
      pair.high,
      season.startsAt,
    );
  }
}

export async function ensureActiveSeason(worldId?: string): Promise<Season> {
  const world = worldId ? { id: worldId } : await getOpenWorldOrThrow();

  const active = await db.query.seasons.findFirst({
    where: and(eq(seasons.worldId, world.id), eq(seasons.status, "active")),
  });
  if (active) {
    const groupCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(leagueGroups)
      .where(eq(leagueGroups.seasonId, active.id));
    if ((groupCount[0]?.n ?? 0) === 0) {
      await seedSeasonStructure(active);
    }
    return active;
  }

  const all = await db.query.seasons.findMany({
    where: eq(seasons.worldId, world.id),
  });
  const nextNum = all.reduce((m, s) => Math.max(m, s.number), 0) + 1;

  const [season] = await db
    .insert(seasons)
    .values({
      worldId: world.id,
      number: nextNum || 1,
      status: "active",
      startsAt: new Date(),
    })
    .returning();

  await seedSeasonStructure(season!);
  return season!;
}

export async function openNewBronzeDivision(seasonId: string, worldId: string) {
  const bronzeGroups = await db.query.leagueGroups.findMany({
    where: and(
      eq(leagueGroups.seasonId, seasonId),
      eq(leagueGroups.tier, "bronze"),
    ),
  });
  const nextIndex =
    bronzeGroups.reduce((m, g) => Math.max(m, g.divisionIndex), 0) + 1;

  const { groupId, clubIds } = await createLeagueGroupWithClubs(
    seasonId,
    worldId,
    "bronze",
    nextIndex,
  );
  await insertLeagueFixtures(seasonId, groupId, clubIds, new Date());
  return { groupId, clubIds, divisionIndex: nextIndex };
}

export async function claimBronzeClubSlot(
  worldId: string,
  newName: string,
): Promise<{ club: Club; season: Season; leagueGroupId: string }> {
  const season = await ensureActiveSeason(worldId);

  const nameTaken = await db.query.clubs.findFirst({
    where: and(eq(clubs.worldId, worldId), eq(clubs.name, newName)),
  });
  if (nameTaken && nameTaken.isSystem === 0) {
    throw new AppError(409, "Club name already taken", "NAME_TAKEN");
  }

  const bronzeGroups = await db.query.leagueGroups.findMany({
    where: and(
      eq(leagueGroups.seasonId, season.id),
      eq(leagueGroups.tier, "bronze"),
    ),
    orderBy: [asc(leagueGroups.divisionIndex)],
  });

  for (const group of bronzeGroups) {
    const links = await db.query.leagueGroupClubs.findMany({
      where: eq(leagueGroupClubs.leagueGroupId, group.id),
    });
    for (const link of links) {
      const club = await db.query.clubs.findFirst({
        where: eq(clubs.id, link.clubId),
      });
      if (club && club.isSystem === 1) {
        if (nameTaken && nameTaken.id !== club.id) {
          throw new AppError(409, "Club name already taken", "NAME_TAKEN");
        }
        const [updated] = await db
          .update(clubs)
          .set({ name: newName, isSystem: 0, tier: "bronze" })
          .where(eq(clubs.id, club.id))
          .returning();
        await db.delete(botPlayers).where(eq(botPlayers.clubId, club.id));
        await insertBotSquad(club.id, newName, "bronze");
        return { club: updated!, season, leagueGroupId: group.id };
      }
    }
  }

  const { groupId, clubIds } = await openNewBronzeDivision(season.id, worldId);
  const firstId = clubIds[0]!;
  const [updated] = await db
    .update(clubs)
    .set({ name: newName, isSystem: 0, tier: "bronze" })
    .where(eq(clubs.id, firstId))
    .returning();
  await db.delete(botPlayers).where(eq(botPlayers.clubId, firstId));
  await insertBotSquad(firstId, newName, "bronze");
  return { club: updated!, season, leagueGroupId: groupId };
}

export type StandingRow = {
  clubId: string;
  clubName: string;
  isSystem: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  divisionIndex: number;
  tier: LeagueTier;
};

export async function computeGroupStandings(
  leagueGroupId: string,
): Promise<StandingRow[]> {
  const group = await db.query.leagueGroups.findFirst({
    where: eq(leagueGroups.id, leagueGroupId),
  });
  if (!group) return [];

  const links = await db.query.leagueGroupClubs.findMany({
    where: eq(leagueGroupClubs.leagueGroupId, leagueGroupId),
  });
  const map = new Map<string, StandingRow>();
  for (const link of links) {
    const club = await db.query.clubs.findFirst({
      where: eq(clubs.id, link.clubId),
    });
    if (!club) continue;
    map.set(club.id, {
      clubId: club.id,
      clubName: club.name,
      isSystem: club.isSystem === 1,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      pts: 0,
      divisionIndex: group.divisionIndex,
      tier: group.tier,
    });
  }

  const finished = await db.query.fixtures.findMany({
    where: and(
      eq(fixtures.leagueGroupId, leagueGroupId),
      eq(fixtures.competition, "league"),
      eq(fixtures.status, "finished"),
    ),
  });

  for (const f of finished) {
    if (f.homeScore == null || f.awayScore == null) continue;
    const home = map.get(f.homeClubId);
    const away = map.get(f.awayClubId);
    if (!home || !away) continue;
    home.played += 1;
    away.played += 1;
    home.gf += f.homeScore;
    home.ga += f.awayScore;
    away.gf += f.awayScore;
    away.ga += f.homeScore;
    if (f.homeScore > f.awayScore) {
      home.won += 1;
      home.pts += 3;
      away.lost += 1;
    } else if (f.homeScore < f.awayScore) {
      away.won += 1;
      away.pts += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.pts += 1;
      away.pts += 1;
    }
  }

  const rows = [...map.values()];
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return rows;
}

export async function getMyLeagueGroupId(clubId: string, seasonId: string) {
  const links = await db.query.leagueGroupClubs.findMany({
    where: eq(leagueGroupClubs.clubId, clubId),
  });
  for (const link of links) {
    const g = await db.query.leagueGroups.findFirst({
      where: eq(leagueGroups.id, link.leagueGroupId),
    });
    if (g && g.seasonId === seasonId) return g.id;
  }
  return null;
}

export async function awardHumansClubFame(
  seasonId: string,
  clubId: string,
  kind: "place" | "cup",
  amount: number,
) {
  const memberships = await db.query.clubMemberships.findMany({
    where: eq(clubMemberships.clubId, clubId),
  });

  for (const m of memberships) {
    let stats = await db.query.playerSeasonStats.findFirst({
      where: and(
        eq(playerSeasonStats.seasonId, seasonId),
        eq(playerSeasonStats.playerId, m.playerId),
      ),
    });
    if (!stats) {
      const [row] = await db
        .insert(playerSeasonStats)
        .values({ seasonId, playerId: m.playerId, clubId })
        .returning();
      stats = row!;
    }

    if (kind === "place") {
      if (stats.placeFamePaid === 1) continue;
      if (stats.leagueAppearances < LEAGUE_FAME_MIN_APPS) continue;
      await db
        .update(playerSeasonStats)
        .set({ placeFame: amount, placeFamePaid: 1 })
        .where(eq(playerSeasonStats.id, stats.id));
      await db
        .update(players)
        .set({ fame: sql`${players.fame} + ${amount}` })
        .where(eq(players.id, m.playerId));
    } else {
      if (stats.cupFamePaid === 1) continue;
      if (stats.cupAppearances < CUP_FAME_MIN_APPS) continue;
      await db
        .update(playerSeasonStats)
        .set({ cupFame: amount, cupFamePaid: 1 })
        .where(eq(playerSeasonStats.id, stats.id));
      await db
        .update(players)
        .set({ fame: sql`${players.fame} + ${amount}` })
        .where(eq(players.id, m.playerId));
    }
  }
}

async function payCupFame(cupId: string) {
  const cup = await db.query.cups.findFirst({ where: eq(cups.id, cupId) });
  if (!cup) return;
  const all = await db.query.fixtures.findMany({
    where: and(eq(fixtures.cupId, cupId), eq(fixtures.status, "finished")),
  });
  const furthest = new Map<string, number>();
  for (const f of all) {
    for (const id of [f.homeClubId, f.awayClubId]) {
      furthest.set(id, Math.min(furthest.get(id) ?? 99, f.round));
    }
  }
  const finalLegs = all.filter((f) => f.round === 2);
  let winnerId: string | null = null;
  if (finalLegs.length) {
    const ids = [
      ...new Set(finalLegs.flatMap((f) => [f.homeClubId, f.awayClubId])),
    ];
    if (ids.length === 2) {
      const [a, b] = ids as [string, string];
      let aG = 0;
      let bG = 0;
      for (const f of finalLegs) {
        if (f.homeScore == null || f.awayScore == null) continue;
        if (f.homeClubId === a) {
          aG += f.homeScore;
          bG += f.awayScore;
        } else {
          bG += f.homeScore;
          aG += f.awayScore;
        }
      }
      winnerId = aG >= bG ? a : b;
    }
  }
  for (const [clubId, round] of furthest) {
    const exitRound = winnerId === clubId ? 1 : round;
    await awardHumansClubFame(
      cup.seasonId,
      clubId,
      "cup",
      cupExitFame(cup.code, exitRound),
    );
  }
}

export async function maybeAdvanceCup(cupId: string) {
  const cup = await db.query.cups.findFirst({ where: eq(cups.id, cupId) });
  if (!cup || cup.status !== "active") return;

  const all = await db.query.fixtures.findMany({
    where: eq(fixtures.cupId, cupId),
  });
  const rounds = [...new Set(all.map((f) => f.round))].sort((a, b) => b - a);
  const currentRound = rounds[0]!;
  const roundFixtures = all.filter((f) => f.round === currentRound);
  if (roundFixtures.some((f) => f.status !== "finished")) return;

  const ties = new Map<
    string,
    { a: string; b: string; aGoals: number; bGoals: number }
  >();
  for (const f of roundFixtures) {
    if (f.homeScore == null || f.awayScore == null) continue;
    const sorted = [f.homeClubId, f.awayClubId].sort();
    const key = sorted.join(":");
    const t = ties.get(key) ?? {
      a: sorted[0]!,
      b: sorted[1]!,
      aGoals: 0,
      bGoals: 0,
    };
    if (f.homeClubId === t.a) {
      t.aGoals += f.homeScore;
      t.bGoals += f.awayScore;
    } else {
      t.bGoals += f.homeScore;
      t.aGoals += f.awayScore;
    }
    ties.set(key, t);
  }

  if (currentRound === 2) {
    await db.update(cups).set({ status: "finished" }).where(eq(cups.id, cupId));
    await payCupFame(cupId);
    return;
  }

  const winners: string[] = [];
  for (const t of ties.values()) {
    winners.push(t.aGoals >= t.bGoals ? t.a : t.b);
  }
  if (winners.length < 2) return;

  const nextRound = currentRound / 2;
  const lastKick = roundFixtures.reduce(
    (m, f) => (f.kickoffAt > m ? f.kickoffAt : m),
    roundFixtures[0]!.kickoffAt,
  );
  let kick = nextSaturday(new Date(lastKick.getTime() + 24 * 3600 * 1000));
  const shuffled = shuffle(winners, `${cupId}:${nextRound}`);
  const rows = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const home = shuffled[i]!;
    const away = shuffled[i + 1];
    if (!away) continue;
    rows.push({
      seasonId: cup.seasonId,
      competition: "cup" as const,
      leagueGroupId: null,
      cupId,
      round: nextRound,
      leg: 1,
      homeClubId: home,
      awayClubId: away,
      kickoffAt: new Date(kick),
      status: "scheduled" as const,
    });
    rows.push({
      seasonId: cup.seasonId,
      competition: "cup" as const,
      leagueGroupId: null,
      cupId,
      round: nextRound,
      leg: 2,
      homeClubId: away,
      awayClubId: home,
      kickoffAt: nextSaturday(new Date(kick.getTime() + 24 * 3600 * 1000)),
      status: "scheduled" as const,
    });
    kick = nextSaturday(new Date(kick.getTime() + 8 * 24 * 3600 * 1000));
  }
  if (rows.length) await db.insert(fixtures).values(rows);
}

export async function payLeaguePlaceFame(leagueGroupId: string) {
  const group = await db.query.leagueGroups.findFirst({
    where: eq(leagueGroups.id, leagueGroupId),
  });
  if (!group) return;
  const standings = await computeGroupStandings(leagueGroupId);
  for (let i = 0; i < standings.length; i++) {
    const row = standings[i]!;
    await awardHumansClubFame(
      group.seasonId,
      row.clubId,
      "place",
      leaguePlaceFame(group.tier, i + 1),
    );
  }
}

const TIER_ORDER: LeagueTier[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "champion",
];

async function buildSeasonFromCurrentClubs(season: Season) {
  for (const tier of LEAGUE_TIERS) {
    const tierClubs = await db.query.clubs.findMany({
      where: and(eq(clubs.worldId, season.worldId), eq(clubs.tier, tier)),
    });
    const ids = tierClubs.map((c) => c.id);
    let div = 1;
    do {
      const slice = ids.splice(0, 8);
      while (slice.length < 8) {
        const names = systemNamesForDivision(tier, div + 20 + slice.length);
        const club = await createSystemClub(
          season.worldId,
          `${names[slice.length % 8]!} S${season.number}d${div}`,
          tier,
        );
        slice.push(club.id);
      }
      const [group] = await db
        .insert(leagueGroups)
        .values({ seasonId: season.id, tier, divisionIndex: div })
        .returning();
      for (const clubId of slice) {
        await db.insert(leagueGroupClubs).values({
          leagueGroupId: group!.id,
          clubId,
        });
      }
      await insertLeagueFixtures(season.id, group!.id, slice, season.startsAt);
      div += 1;
    } while (ids.length > 0);
  }
  for (const pair of CUP_PAIRINGS) {
    await seedCup(season.id, pair.code, pair.low, pair.high, season.startsAt);
  }
}

export async function endSeasonIfComplete(seasonId: string) {
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, seasonId),
  });
  if (!season || season.status !== "active") return null;

  const unfinished = await db.query.fixtures.findMany({
    where: and(
      eq(fixtures.seasonId, seasonId),
      eq(fixtures.competition, "league"),
      eq(fixtures.status, "scheduled"),
    ),
  });
  if (unfinished.length) return null;

  const groups = await db.query.leagueGroups.findMany({
    where: eq(leagueGroups.seasonId, seasonId),
  });
  for (const g of groups) {
    await payLeaguePlaceFame(g.id);
  }

  type Move = { clubId: string; toTier: LeagueTier };
  const promotions: Move[] = [];
  const relegations: Move[] = [];

  for (const tier of TIER_ORDER) {
    const tierGroups = groups.filter((g) => g.tier === tier);
    for (const g of tierGroups) {
      const table = await computeGroupStandings(g.id);
      if (table.length < 8) continue;
      const idx = TIER_ORDER.indexOf(tier);
      if (idx < TIER_ORDER.length - 1) {
        promotions.push(
          { clubId: table[0]!.clubId, toTier: TIER_ORDER[idx + 1]! },
          { clubId: table[1]!.clubId, toTier: TIER_ORDER[idx + 1]! },
        );
      }
      if (tier !== "bronze" && idx > 0) {
        relegations.push(
          { clubId: table[6]!.clubId, toTier: TIER_ORDER[idx - 1]! },
          { clubId: table[7]!.clubId, toTier: TIER_ORDER[idx - 1]! },
        );
      }
    }
  }

  await db
    .update(seasons)
    .set({ status: "ended", endsAt: new Date() })
    .where(eq(seasons.id, seasonId));

  for (const m of [...promotions, ...relegations]) {
    await db.update(clubs).set({ tier: m.toTier }).where(eq(clubs.id, m.clubId));
  }

  const [next] = await db
    .insert(seasons)
    .values({
      worldId: season.worldId,
      number: season.number + 1,
      status: "active",
      startsAt: new Date(),
    })
    .returning();

  await buildSeasonFromCurrentClubs(next!);
  return next!;
}

export async function getClubSchedule(clubId: string) {
  const world = await getOpenWorldOrThrow();
  const season = await ensureActiveSeason(world.id);
  const rows = await db
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.seasonId, season.id),
        sql`(${fixtures.homeClubId} = ${clubId} OR ${fixtures.awayClubId} = ${clubId})`,
      ),
    )
    .orderBy(asc(fixtures.kickoffAt));

  const clubIds = [
    ...new Set(rows.flatMap((f) => [f.homeClubId, f.awayClubId])),
  ];
  const clubRows =
    clubIds.length > 0
      ? await db.query.clubs.findMany({ where: inArray(clubs.id, clubIds) })
      : [];
  const nameById = new Map(clubRows.map((c) => [c.id, c.name]));

  return {
    season: { id: season.id, number: season.number, status: season.status },
    fixtures: rows.map((f) => ({
      id: f.id,
      competition: f.competition,
      round: f.round,
      leg: f.leg,
      homeClubId: f.homeClubId,
      awayClubId: f.awayClubId,
      homeName: nameById.get(f.homeClubId) ?? "?",
      awayName: nameById.get(f.awayClubId) ?? "?",
      kickoffAt: f.kickoffAt.toISOString(),
      status: f.status,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
      matchId: f.matchId,
      cupId: f.cupId,
      leagueGroupId: f.leagueGroupId,
    })),
  };
}

export async function getGlobalStandings(tier: LeagueTier) {
  const world = await getOpenWorldOrThrow();
  const season = await ensureActiveSeason(world.id);
  const groups = await db.query.leagueGroups.findMany({
    where: and(
      eq(leagueGroups.seasonId, season.id),
      eq(leagueGroups.tier, tier),
    ),
    orderBy: [asc(leagueGroups.divisionIndex)],
  });
  const all: StandingRow[] = [];
  for (const g of groups) {
    all.push(...(await computeGroupStandings(g.id)));
  }
  all.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return {
    season: { id: season.id, number: season.number },
    tier,
    standings: all,
  };
}

export async function listCups() {
  const world = await getOpenWorldOrThrow();
  const season = await ensureActiveSeason(world.id);
  const rows = await db.query.cups.findMany({
    where: eq(cups.seasonId, season.id),
  });
  return {
    season: { id: season.id, number: season.number, status: season.status },
    cups: rows.map((c) => ({
      id: c.id,
      code: c.code,
      status: c.status,
    })),
  };
}

export async function getCupByCode(code: CupCode) {
  const world = await getOpenWorldOrThrow();
  const season = await ensureActiveSeason(world.id);
  const cup = await db.query.cups.findFirst({
    where: and(eq(cups.seasonId, season.id), eq(cups.code, code)),
  });
  if (!cup) {
    throw new AppError(404, "Cup not found", "CUP_NOT_FOUND");
  }
  const rows = await db
    .select()
    .from(fixtures)
    .where(eq(fixtures.cupId, cup.id))
    .orderBy(asc(fixtures.round), asc(fixtures.leg), asc(fixtures.kickoffAt));

  const clubIds = [
    ...new Set(rows.flatMap((f) => [f.homeClubId, f.awayClubId])),
  ];
  const clubRows =
    clubIds.length > 0
      ? await db.query.clubs.findMany({ where: inArray(clubs.id, clubIds) })
      : [];
  const nameById = new Map(clubRows.map((c) => [c.id, c.name]));

  return {
    season: { id: season.id, number: season.number },
    cup: { id: cup.id, code: cup.code, status: cup.status },
    fixtures: rows.map((f) => ({
      id: f.id,
      round: f.round,
      leg: f.leg,
      homeClubId: f.homeClubId,
      awayClubId: f.awayClubId,
      homeName: nameById.get(f.homeClubId) ?? "?",
      awayName: nameById.get(f.awayClubId) ?? "?",
      kickoffAt: f.kickoffAt.toISOString(),
      status: f.status,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
      matchId: f.matchId,
    })),
  };
}
