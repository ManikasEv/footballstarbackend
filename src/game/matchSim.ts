/**
 * OG Soccer Star–style match simulation.
 * One authoritative event timeline — watching only presents it.
 */

export type MatchSide = "home" | "away";

export type MatchActor = {
  id: string;
  name: string;
  side: MatchSide;
  slot: string;
  position: string;
  playingStrength: number;
  /** Pitch base position 0–100 */
  baseX: number;
  baseY: number;
  appearance: Record<string, unknown>;
};

export type MatchEventType =
  | "kickoff"
  | "pass"
  | "dribble"
  | "shot"
  | "save"
  | "goal"
  | "clearance"
  | "tackle"
  | "half_time"
  | "full_time";

export type MatchEvent = {
  id: string;
  /** Match clock minute 0–90 */
  minute: number;
  /** Playback offset from kickoff (ms) */
  atMs: number;
  type: MatchEventType;
  actorId: string;
  actorName: string;
  actorSide: MatchSide;
  targetId?: string;
  targetName?: string;
  /** Ball position on pitch 0–100 */
  ball: { x: number; y: number };
  commentary: string;
  score: { home: number; away: number };
};

export type ActorMatchStat = {
  id: string;
  name: string;
  side: MatchSide;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  rating: number;
  wasStarter: boolean;
  wasSub: boolean;
};

export type MatchSimResult = {
  events: MatchEvent[];
  homeScore: number;
  awayScore: number;
  durationMs: number;
  actorStats: ActorMatchStat[];
};

/** 4-4-2 base spots — home attacks toward x=100 (right goal). */
const HOME_SLOTS: Record<string, { x: number; y: number }> = {
  gk: { x: 6, y: 50 },
  lb: { x: 20, y: 14 },
  cb: { x: 18, y: 38 },
  "cb-2": { x: 18, y: 62 },
  rb: { x: 20, y: 86 },
  lm: { x: 38, y: 12 },
  cm: { x: 36, y: 38 },
  "cm-2": { x: 36, y: 62 },
  rm: { x: 38, y: 88 },
  st: { x: 58, y: 36 },
  "st-2": { x: 58, y: 64 },
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mirrorX(x: number) {
  return 100 - x;
}

export function placeSquad(
  side: MatchSide,
  starters: Array<{
    id: string;
    name: string;
    slot: string;
    position: string;
    playingStrength: number;
    appearance: Record<string, unknown>;
  }>,
): MatchActor[] {
  const slotCounts: Record<string, number> = {};
  return starters.map((p) => {
    const n = (slotCounts[p.slot] ?? 0) + 1;
    slotCounts[p.slot] = n;
    const key = n > 1 ? `${p.slot}-${n}` : p.slot;
    const base = HOME_SLOTS[key] ?? HOME_SLOTS[p.slot] ?? { x: 40, y: 50 };
    const x = side === "home" ? base.x : mirrorX(base.x);
    return {
      id: p.id,
      name: p.name,
      side,
      slot: p.slot,
      position: p.position,
      playingStrength: p.playingStrength,
      baseX: x,
      baseY: base.y,
      appearance: p.appearance,
    };
  });
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Simulate a full match. `playbackScale` compresses 90' into wall-clock
 * (default ~2.5 min for a test match).
 */
export function simulateMatch(
  home: MatchActor[],
  away: MatchActor[],
  seed: string,
  opts?: { playbackScale?: number },
): MatchSimResult {
  const rng = mulberry32(hash(seed));
  // Each match-minute ≈ 1.4s wall time → ~2.1 min for a test 90'
  const msPerMinute = opts?.playbackScale ?? 1400;

  const events: MatchEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;
  let eventSeq = 0;
  let atMs = 0;

  const statMap = new Map<string, ActorMatchStat>();
  const ensureStat = (a: MatchActor, starter: boolean) => {
    let s = statMap.get(a.id);
    if (!s) {
      s = {
        id: a.id,
        name: a.name,
        side: a.side,
        minutes: 0,
        goals: 0,
        assists: 0,
        shots: 0,
        rating: 6,
        wasStarter: starter,
        wasSub: !starter,
      };
      statMap.set(a.id, s);
    }
    return s;
  };
  for (const a of [...home, ...away]) ensureStat(a, true);

  // Up to 3 subs per side enter around minutes 55–75
  const homeBench: MatchActor[] = [];
  const awayBench: MatchActor[] = [];
  // Bench slots are not separate actors yet — mark late minutes on random non-GK as "sub minutes boost"
  // Real bench: duplicate weaker clones aren't available; use unused starters as sub recipients via wasSub flag on late entrants.
  void homeBench;
  void awayBench;

  const push = (
    minute: number,
    type: MatchEventType,
    actor: MatchActor,
    ball: { x: number; y: number },
    commentary: string,
    extra?: Partial<MatchEvent>,
  ) => {
    atMs = Math.round(minute * msPerMinute);
    events.push({
      id: `e${eventSeq++}`,
      minute,
      atMs,
      type,
      actorId: actor.id,
      actorName: actor.name,
      actorSide: actor.side,
      ball,
      commentary,
      score: { home: homeScore, away: awayScore },
      ...extra,
    });
  };

  const kickActor = pick(rng, home);
  push(
    0,
    "kickoff",
    kickActor,
    { x: 50, y: 50 },
    `${kickActor.name} kicks off for the home side.`,
  );

  let possession: MatchSide = "home";
  let carrier =
    home.find((p) => p.slot === "cm") ?? pick(rng, home.filter((p) => p.slot !== "gk"));
  let minute = 1;

  const team = (side: MatchSide) => (side === "home" ? home : away);
  const other = (side: MatchSide) => (side === "home" ? "away" : "home");

  const attackToward = (side: MatchSide) => (side === "home" ? 1 : -1);

  while (minute < 90) {
    if (minute === 45) {
      const any = pick(rng, home);
      push(45, "half_time", any, { x: 50, y: 50 }, "Half-time.");
      possession = "away";
      carrier =
        away.find((p) => p.slot === "cm") ??
        pick(
          rng,
          away.filter((p) => p.slot !== "gk"),
        );
      minute = 46;
      continue;
    }

    const mates = team(possession).filter((p) => p.id !== carrier.id && p.slot !== "gk");
    const foes = team(other(possession));
    const dir = attackToward(possession);

    const foeSample = pick(rng, foes);
    const strength =
      carrier.playingStrength /
      (carrier.playingStrength + foeSample.playingStrength + 1);
    // Stronger attackers push the ball forward more often; weak sides recycle possession.
    const passBias = 0.28 + strength * 0.22;
    const dribbleBias = passBias + 0.16 + strength * 0.1;
    const duelBias = dribbleBias + 0.14;
    const roll = rng();

    // Ball near carrier, nudged toward goal
    const ball = {
      x: clamp(carrier.baseX + dir * (6 + rng() * 14), 4, 96),
      y: clamp(carrier.baseY + (rng() - 0.5) * 18, 8, 92),
    };

    if (roll < passBias && mates.length) {
      // Prefer higher-PS teammates for progressive passes
      const ranked = [...mates].sort(
        (a, b) => b.playingStrength - a.playingStrength,
      );
      const target =
        rng() < 0.55
          ? ranked[Math.floor(rng() * Math.min(3, ranked.length))]!
          : pick(rng, mates);
      push(
        minute,
        "pass",
        carrier,
        {
          x: (carrier.baseX + target.baseX) / 2,
          y: (carrier.baseY + target.baseY) / 2,
        },
        `${carrier.name} finds ${target.name}.`,
        { targetId: target.id, targetName: target.name },
      );
      const cs = ensureStat(carrier, true);
      cs.assists += rng() < 0.08 ? 1 : 0;
      cs.rating = Math.min(10, cs.rating + 0.05);
      carrier = target;
    } else if (roll < dribbleBias) {
      const step = 3 + strength * 8 + rng() * 4;
      push(
        minute,
        "dribble",
        carrier,
        ball,
        `${carrier.name} drives forward with the ball.`,
      );
      carrier = {
        ...carrier,
        baseX: clamp(carrier.baseX + dir * step, 8, 92),
      };
    } else if (roll < duelBias) {
      const defender = pick(
        rng,
        foes.filter((p) => p.slot !== "gk"),
      );
      const tackleChance =
        defender.playingStrength /
        (defender.playingStrength + carrier.playingStrength + 1);
      if (rng() < tackleChance) {
        push(
          minute,
          "tackle",
          defender,
          ball,
          `${defender.name} wins the ball from ${carrier.name}.`,
          { targetId: carrier.id, targetName: carrier.name },
        );
        possession = other(possession);
        carrier = defender;
      } else {
        push(
          minute,
          "dribble",
          carrier,
          ball,
          `${carrier.name} slips past ${defender.name}.`,
          { targetId: defender.id, targetName: defender.name },
        );
      }
    } else {
      // Shot — finishing chance scales with attacker PS vs GK
      const gk = foes.find((p) => p.slot === "gk") ?? pick(rng, foes);
      const goalX = possession === "home" ? 96 : 4;
      const shotBall = { x: goalX, y: 42 + rng() * 16 };
      push(minute, "shot", carrier, shotBall, `${carrier.name} shoots!`);
      ensureStat(carrier, true).shots += 1;

      const finishChance =
        0.12 +
        (carrier.playingStrength /
          (carrier.playingStrength + gk.playingStrength + 1)) *
          0.38;
      if (rng() < finishChance) {
        if (possession === "home") homeScore += 1;
        else awayScore += 1;
        push(
          minute,
          "goal",
          carrier,
          shotBall,
          `GOAL! ${carrier.name} scores!`,
        );
        const gs = ensureStat(carrier, true);
        gs.goals += 1;
        gs.rating = Math.min(10, gs.rating + 1.2);
        possession = other(possession);
        const kickSide = team(possession);
        carrier =
          kickSide.find((p) => p.slot === "st") ??
          pick(
            rng,
            kickSide.filter((p) => p.slot !== "gk"),
          );
        push(
          minute,
          "kickoff",
          carrier,
          { x: 50, y: 50 },
          `Restart after the goal.`,
        );
      } else if (rng() < 0.5 + gk.playingStrength / 800) {
        push(
          minute,
          "save",
          gk,
          shotBall,
          `${gk.name} makes the save!`,
          { targetId: carrier.id, targetName: carrier.name },
        );
        push(
          minute,
          "clearance",
          gk,
          { x: possession === "home" ? 80 : 20, y: 50 },
          `${gk.name} clears it long.`,
        );
        possession = other(possession);
        carrier = pick(
          rng,
          team(possession).filter((p) => p.slot !== "gk"),
        );
      } else {
        push(
          minute,
          "clearance",
          pick(
            rng,
            foes.filter((p) => p.slot === "cb" || p.slot === "gk"),
          ),
          { x: possession === "home" ? 75 : 25, y: 50 },
          `Blocked — cleared away.`,
          { targetId: carrier.id, targetName: carrier.name },
        );
        possession = other(possession);
        carrier = pick(
          rng,
          team(possession).filter((p) => p.slot !== "gk"),
        );
      }
    }

    // Stronger teams advance the clock slower (more actions) — weak sides skip ahead
    const tempo = 1 + Math.floor(rng() * (strength > 0.55 ? 2 : 3));
    minute += tempo;
  }

  const closer = pick(rng, [...home, ...away]);
  push(
    90,
    "full_time",
    closer,
    { x: 50, y: 50 },
    `Full-time ${homeScore}–${awayScore}.`,
  );

  // Fix scores on trailing events already stamped — re-stamp final
  events[events.length - 1]!.score = { home: homeScore, away: awayScore };

  // Minutes + sub appearances: pick 3 non-GK per side as "subs" who get partial minutes
  for (const side of ["home", "away"] as const) {
    const squad = side === "home" ? home : away;
    const candidates = squad.filter((p) => p.slot !== "gk");
    const subCount = Math.min(3, candidates.length);
    for (let i = 0; i < subCount; i++) {
      const a = candidates[Math.floor(rng() * candidates.length)]!;
      const s = ensureStat(a, true);
      if (!s.wasSub) {
        s.wasSub = true;
        s.wasStarter = i === 0 ? s.wasStarter : false;
        if (!s.wasStarter) s.minutes = 20 + Math.floor(rng() * 25);
      }
    }
  }
  for (const s of statMap.values()) {
    if (s.minutes <= 0) s.minutes = s.wasStarter ? 90 : 0;
    s.rating = Math.max(1, Math.min(10, Math.round(s.rating)));
  }

  return {
    events,
    homeScore,
    awayScore,
    durationMs: Math.round(90 * msPerMinute) + 2000,
    actorStats: [...statMap.values()].filter((s) => s.minutes > 0),
  };
}
