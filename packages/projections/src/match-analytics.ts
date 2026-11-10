import type { DeliveryRecorded, T20MatchEvent, T20Scorecard, ODIMatchEvent, ODIScorecard, Red5MatchEvent, Red5Scorecard } from "@lcxxvi/contracts";

/** Event-derived, presentation-only analytics. No state mutation or invented ball telemetry. */
export type OverSummary = Readonly<{ inningsIndex: number; overNumber: number; runs: number; wickets: number; legalBalls: number; attempts: number }>;
export type WormPoint = Readonly<{ inningsIndex: number; sequence: number; legalBalls: number; totalRuns: number; wickets: number }>;
export type Partnership = Readonly<{ inningsIndex: number; players: readonly [string, string]; runs: number; legalBalls: number; fromSequence: number; toSequence: number }>;
export type ShotSector = Readonly<{ inningsIndex: number; batterId: string; sector: number; attempts: number; batRuns: number; fours: number; sixes: number }>;
export type FallOfWicket = Readonly<{ inningsIndex: number; sequence: number; playerId: string; runs: number; wickets: number; legalBalls: number }>;
export type MatchAnalytics = Readonly<{
  overSummaries: readonly OverSummary[];
  worm: readonly WormPoint[];
  partnerships: readonly Partnership[];
  shotSectors: readonly ShotSector[];
  unlocatedShots: number;
  finalRuns: readonly number[];
  finalLegalBalls: readonly number[];
  finalWickets: readonly number[];
  fallOfWickets: readonly FallOfWicket[];
}>;

type MutableOver = { inningsIndex: number; overNumber: number; runs: number; wickets: number; legalBalls: number; attempts: number };
type MutablePartnership = { inningsIndex: number; players: [string, string]; runs: number; legalBalls: number; fromSequence: number; toSequence: number };
type MutableSector = { inningsIndex: number; batterId: string; sector: number; attempts: number; batRuns: number; fours: number; sixes: number };

function guard(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(`LC_MATCH_ANALYTICS_${code}`); }
function sumRuns(d: DeliveryRecorded) { return d.batRuns + d.extras.wides + d.extras.noBalls + d.extras.byes + d.extras.legByes + d.extras.penalties; }

/**
 * Read the canonical event stream, never a parallel score source. Illegal balls remain
 * in their actual over; wagon wheel only shows sectors explicitly recorded by engine.
 */
export function projectT20MatchAnalytics(events: readonly T20MatchEvent[], scorecard?: Readonly<T20Scorecard>): MatchAnalytics {
  return projectMatchAnalytics(events, 2, scorecard);
}

export function projectODIMatchAnalytics(events: readonly ODIMatchEvent[], scorecard?: Readonly<ODIScorecard>): MatchAnalytics {
  return projectMatchAnalytics(events, 2, scorecard);
}

export function projectRed5MatchAnalytics(events: readonly Red5MatchEvent[], scorecard?: Readonly<Red5Scorecard>): MatchAnalytics {
  return projectMatchAnalytics(events, scorecard?.innings.length ?? 4, scorecard);
}

function projectMatchAnalytics(events: readonly (T20MatchEvent | ODIMatchEvent | Red5MatchEvent)[], inningsCount: number, scorecard?: Readonly<T20Scorecard | ODIScorecard | Red5Scorecard>): MatchAnalytics {
  const overs = new Map<string, MutableOver>();
  const pairs: MutablePartnership[] = [];
  const shots = new Map<string, MutableSector>();
  const worm: WormPoint[] = [];
  const falls: FallOfWicket[] = [];
  const runs = Array<number>(inningsCount).fill(0), wickets = Array<number>(inningsCount).fill(0), balls = Array<number>(inningsCount).fill(0);
  let unlocatedShots = 0, priorSequence = 0;
  for (const e of events) {
    guard(e.sequence > priorSequence, "SEQUENCE_ORDER");
    priorSequence = e.sequence;
    if (e.type !== "DELIVERY_RECORDED") continue;
    const d = (e.payload as { event: DeliveryRecorded }).event;
    const idx = d.inningsIndex;
    guard(Number.isInteger(idx) && idx >= 0 && idx < inningsCount, "INNINGS_INDEX");
    const earned = sumRuns(d);
    guard(Number.isSafeInteger(earned) && earned >= 0, "INVALID_RUNS");
    const overNumber = Math.floor(balls[idx]! / 6) + 1;
    const key = `${idx}:${overNumber}`;
    const over = overs.get(key) ?? { inningsIndex: idx, overNumber, runs: 0, wickets: 0, legalBalls: 0, attempts: 0 };
    over.runs += earned;
    over.wickets += Number(d.dismissal !== null);
    over.legalBalls += Number(d.legalBall);
    over.attempts += 1;
    overs.set(key, over);

    const ids = [d.strikerId, d.nonStrikerId].sort() as [string, string];
    let active = pairs.at(-1);
    if (!active || active.inningsIndex !== idx || active.players[0] !== ids[0] || active.players[1] !== ids[1]) {
      active = { inningsIndex: idx, players: ids, runs: 0, legalBalls: 0, fromSequence: e.sequence, toSequence: e.sequence };
      pairs.push(active);
    }
    active.runs += earned;
    active.legalBalls += Number(d.legalBall);
    active.toSequence = e.sequence;

    if (d.shotSector !== null) {
      guard(Number.isInteger(d.shotSector) && d.shotSector >= 0 && d.shotSector < 8, "SHOT_SECTOR");
      const sectorKey = `${idx}:${d.strikerId}:${d.shotSector}`;
      const shot = shots.get(sectorKey) ?? { inningsIndex: idx, batterId: d.strikerId, sector: d.shotSector, attempts: 0, batRuns: 0, fours: 0, sixes: 0 };
      shot.attempts++;
      shot.batRuns += d.batRuns;
      shot.fours += Number(d.boundary === "FOUR");
      shot.sixes += Number(d.boundary === "SIX");
      shots.set(sectorKey, shot);
    } else if (d.batRuns > 0) {
      unlocatedShots++;
    }
    runs[idx]! += earned;
    wickets[idx]! += Number(d.dismissal !== null);
    balls[idx]! += Number(d.legalBall);
    if (d.dismissal) falls.push({ inningsIndex: idx, sequence: e.sequence, playerId: d.dismissal.playerId, runs: runs[idx]!, wickets: wickets[idx]!, legalBalls: balls[idx]! });
    worm.push({ inningsIndex: idx, sequence: e.sequence, legalBalls: balls[idx]!, totalRuns: runs[idx]!, wickets: wickets[idx]! });
  }
  if (scorecard) {
    for (let idx = 0; idx < inningsCount; idx++) {
      const score = scorecard.innings[idx];
      guard(Boolean(score) && runs[idx] === score!.runs, `RUN_RECONCILIATION_${idx}`);
      guard(wickets[idx] === score!.wickets, `WICKET_RECONCILIATION_${idx}`);
      guard(balls[idx] === score!.legalBalls, `BALL_RECONCILIATION_${idx}`);
    }
  }
  return {
    overSummaries: [...overs.values()].map(x => ({ ...x })),
    worm,
    partnerships: pairs.map(p => ({ ...p, players: [...p.players] as [string, string] })),
    shotSectors: [...shots.values()].sort((a,b)=>a.inningsIndex-b.inningsIndex || a.batterId.localeCompare(b.batterId) || a.sector-b.sector),
    unlocatedShots,
    finalRuns: runs,
    finalLegalBalls: balls,
    finalWickets: wickets,
    fallOfWickets: falls,
  };
}
