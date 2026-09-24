import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clubMemberships,
  clubs,
  players,
} from "../db/schema.js";
import { clubRewardScale } from "../game/clubPrestige.js";
import { getOpenWorldOrThrow } from "../game/bootstrap.js";

const LIMIT = 25;

export type RankedPlayer = {
  rank: number;
  playerId: string;
  displayName: string;
  position: string;
  fame: number;
  playingStrength: number;
  clubName: string | null;
};

export type RankedTeam = {
  rank: number;
  clubId: string;
  name: string;
  tier: string;
  fans: number;
  rankingPoints: number;
  rewardScale: number;
  humanCount: number;
};

export async function getGlobalRankings(userId?: string) {
  const world = await getOpenWorldOrThrow();

  const topPlayersRaw = await db
    .select({
      playerId: players.id,
      displayName: players.displayName,
      position: players.position,
      fame: players.fame,
      playingStrength: players.playingStrength,
      clubName: clubs.name,
    })
    .from(players)
    .leftJoin(clubMemberships, eq(clubMemberships.playerId, players.id))
    .leftJoin(clubs, eq(clubs.id, clubMemberships.clubId))
    .where(eq(players.worldId, world.id))
    .orderBy(desc(players.fame), desc(players.playingStrength))
    .limit(LIMIT);

  const topPlayers: RankedPlayer[] = topPlayersRaw.map((row, i) => ({
    rank: i + 1,
    playerId: row.playerId,
    displayName: row.displayName,
    position: row.position,
    fame: row.fame,
    playingStrength: row.playingStrength,
    clubName: row.clubName ?? null,
  }));

  const topTeamsRaw = await db
    .select({
      clubId: clubs.id,
      name: clubs.name,
      tier: clubs.tier,
      fans: clubs.fans,
      rankingPoints: clubs.rankingPoints,
      humanCount: sql<number>`(
        select count(*)::int from club_memberships cm
        where cm.club_id = ${clubs.id}
      )`,
    })
    .from(clubs)
    .where(and(eq(clubs.worldId, world.id), eq(clubs.isSystem, 0)))
    .orderBy(desc(clubs.rankingPoints), desc(clubs.fans))
    .limit(LIMIT);

  // If few player clubs, also show system clubs so the board isn't empty
  let teamsSource = topTeamsRaw;
  if (teamsSource.length < 5) {
    teamsSource = await db
      .select({
        clubId: clubs.id,
        name: clubs.name,
        tier: clubs.tier,
        fans: clubs.fans,
        rankingPoints: clubs.rankingPoints,
        humanCount: sql<number>`(
          select count(*)::int from club_memberships cm
          where cm.club_id = ${clubs.id}
        )`,
      })
      .from(clubs)
      .where(eq(clubs.worldId, world.id))
      .orderBy(desc(clubs.rankingPoints), desc(clubs.fans))
      .limit(LIMIT);
  }

  const topTeams: RankedTeam[] = teamsSource.map((row, i) => ({
    rank: i + 1,
    clubId: row.clubId,
    name: row.name,
    tier: row.tier,
    fans: row.fans ?? 0,
    rankingPoints: row.rankingPoints ?? 0,
    rewardScale: Number(
      clubRewardScale(row.fans ?? 0, row.rankingPoints ?? 0).toFixed(2),
    ),
    humanCount: row.humanCount ?? 0,
  }));

  let me: {
    player: RankedPlayer | null;
    team: RankedTeam | null;
  } = { player: null, team: null };

  if (userId) {
    const player = await db.query.players.findFirst({
      where: eq(players.userId, userId),
    });
    if (player) {
      const betterFame = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(players)
        .where(
          and(
            eq(players.worldId, world.id),
            sql`(${players.fame} > ${player.fame}
              or (${players.fame} = ${player.fame}
                and ${players.playingStrength} > ${player.playingStrength}))`,
          ),
        );
      const membership = await db.query.clubMemberships.findFirst({
        where: eq(clubMemberships.playerId, player.id),
        with: { club: true },
      });
      me.player = {
        rank: (betterFame[0]?.n ?? 0) + 1,
        playerId: player.id,
        displayName: player.displayName,
        position: player.position,
        fame: player.fame,
        playingStrength: player.playingStrength,
        clubName: membership?.club?.name ?? null,
      };

      if (membership?.club) {
        const club = membership.club;
        const betterTeams = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(clubs)
          .where(
            and(
              eq(clubs.worldId, world.id),
              sql`(${clubs.rankingPoints} > ${club.rankingPoints ?? 0}
                or (${clubs.rankingPoints} = ${club.rankingPoints ?? 0}
                  and ${clubs.fans} > ${club.fans ?? 0}))`,
            ),
          );
        me.team = {
          rank: (betterTeams[0]?.n ?? 0) + 1,
          clubId: club.id,
          name: club.name,
          tier: club.tier,
          fans: club.fans ?? 0,
          rankingPoints: club.rankingPoints ?? 0,
          rewardScale: Number(
            clubRewardScale(club.fans ?? 0, club.rankingPoints ?? 0).toFixed(2),
          ),
          humanCount: 0,
        };
      }
    }
  }

  return {
    players: topPlayers,
    teams: topTeams,
    me,
  };
}
