/**
 * Club fans + ranking points — soft prestige that boosts rewards.
 * League table pts stay separate (W/D/L only).
 */

export function clubRewardScale(fans: number, rankingPoints: number) {
  const f = Math.max(0, fans);
  const r = Math.max(0, rankingPoints);
  // Soft curve: ~+25% at 500 fans / 200 pts, soft ~+80%
  const fanBoost = Math.min(0.5, f / 2000);
  const rankBoost = Math.min(0.3, r / 800);
  return 1 + fanBoost + rankBoost;
}

export function matchClubAwards(input: {
  result: "win" | "draw" | "loss";
  isHome: boolean;
  competition: string;
}): { fans: number; rankingPoints: number } {
  if (input.result === "loss") {
    return { fans: input.isHome ? 2 : 1, rankingPoints: 0 };
  }
  if (input.result === "draw") {
    return {
      fans: input.isHome ? 8 : 5,
      rankingPoints: input.isHome ? 2 : 1,
    };
  }
  // Win
  let fans = input.isHome ? 25 : 15;
  let rankingPoints = input.isHome ? 8 : 5;
  if (input.competition === "cup") {
    fans = Math.round(fans * 1.4);
    rankingPoints = Math.round(rankingPoints * 1.5);
  }
  return { fans, rankingPoints };
}

/** Extra fame for humans when their club has a strong home crowd. */
export function homeCrowdFameBonus(fans: number, isHome: boolean, won: boolean) {
  if (!isHome || !won) return 0;
  return Math.min(12, Math.floor(Math.max(0, fans) / 80));
}

/** Extra coins on training claim from club prestige. */
export function clubTrainingCoinBonus(
  baseCoins: number,
  fans: number,
  rankingPoints: number,
) {
  const scale = clubRewardScale(fans, rankingPoints);
  return Math.max(0, Math.round(baseCoins * (scale - 1)));
}
