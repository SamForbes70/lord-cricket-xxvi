import {
  HISTORICAL_STATS_PROJECTION_VERSION,
  HistoricalFilterQuerySchema,
  HistoricalStatisticsProjectionSchema,
  type CompletedCareerMatchEventArchive,
  type CompletedLifecycleMatchEventArchive,
  type HistoricalBattingPositionBand,
  type HistoricalContributingMatch,
  type HistoricalFilterQuery,
  type HistoricalFilterSupport,
  type HistoricalFilteredTeamRecord,
  type HistoricalLeaderboardEntry,
  type HistoricalLeaderboardMetric,
  type HistoricalLeaderboardTable,
  type HistoricalPlayerRecord,
  type HistoricalSeasonOption,
  type HistoricalStatisticsProjection,
  type PersistentWorldState,
  type PersistentWorldStateV2,
  type PersistentWorldStateV3,
  type RetiredPlayerRecord,
  type T20SeasonMatchCompletion,
  type T20SeasonState,
  compareCodePoints,
  CAREER_MATCH_DIGEST_VERSION,
  type CareerMatchDigest,
} from "@lcxxvi/contracts";

export const HISTORICAL_T20_COMPETITION_ID = "LC_T20_LEAGUE_01" as const;
export const HISTORICAL_T20_COMPETITION_LABEL = "Lord Cricket T20 League" as const;

export const HISTORICAL_SEPARATION_NOTICE =
  "Career statistics only — exhibition matches, scenario attempts, and imported-roster worlds remain isolated from these totals and leaderboards." as const;

export const DEFAULT_HISTORICAL_FILTER_QUERY: HistoricalFilterQuery = {
  seasonScope: "ALL",
  format: "T20",
  competitionId: "ALL",
  opponentTeamId: "ALL",
  venueGroundId: "ALL",
  battingPositionBand: "ALL",
  battingPositionExact: null,
  playerStatus: "ALL",
  teamId: "ALL",
};

export type HistoricalBattingEntryFact = {
  readonly playerId: string;
  readonly teamId: string;
  readonly inningsIndex: 0 | 1;
  readonly battingPosition: number;
  readonly runs: number;
  readonly ballsFaced: number;
  readonly fours: number;
  readonly sixes: number;
  readonly dismissed: boolean;
};

export type HistoricalBowlingEntryFact = {
  readonly playerId: string;
  readonly teamId: string;
  readonly inningsIndex: 0 | 1;
  readonly legalBalls: number;
  readonly runsConceded: number;
  readonly wickets: number;
  readonly maidens: number;
};

export type HistoricalFieldingEntryFact = {
  readonly playerId: string;
  readonly teamId: string;
  readonly catches: number;
  readonly stumpings: number;
  readonly runOuts: number;
};

export type HistoricalMatchFact = {
  readonly seasonNumber: number;
  readonly calendarYear: number;
  readonly seasonPhase: "ACTIVE" | "COMPLETE";
  readonly competitionId: string;
  readonly format: "T20";
  readonly fixtureId: string;
  readonly matchId: string;
  readonly fixtureOrdinal: number;
  readonly roundNumber: number;
  readonly matchDayDate: string;
  readonly groundId: string | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly sourceCompletionSha256: string;
  readonly resultSummary: string;
  readonly winnerTeamId: string | null;
  readonly resultKind: "WIN" | "TIE" | "NO_RESULT" | "DRAW";
  readonly homeRuns: number;
  readonly homeBalls: number;
  readonly awayRuns: number;
  readonly awayBalls: number;
  readonly homePoints: number;
  readonly awayPoints: number;
  readonly participantTeamByPlayerId: Readonly<Record<string, string>>;
  readonly battingEntries: readonly HistoricalBattingEntryFact[];
  readonly bowlingEntries: readonly HistoricalBowlingEntryFact[];
  readonly fieldingEntries: readonly HistoricalFieldingEntryFact[];
  readonly archiveEvaluated: boolean;
  readonly archiveReplayAvailable: boolean;
};

export type AnyCareerMatchEventArchive =
  | CompletedCareerMatchEventArchive
  | CompletedLifecycleMatchEventArchive;

export type AnyPersistentWorldState =
  | PersistentWorldState
  | PersistentWorldStateV2
  | PersistentWorldStateV3;

export type HistoricalSeasonInput = {
  readonly seasonNumber: number;
  readonly calendarYear: number;
  readonly phase: "ACTIVE" | "COMPLETE";
  readonly completedMatches: readonly T20SeasonMatchCompletion[];
  readonly groundByFixtureId?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
};

export type HistoricalCareerStatsSource = {
  readonly worldId: string;
  readonly competitionId?: string;
  readonly competitionLabel?: string;
  readonly seasons: readonly HistoricalSeasonInput[];
  readonly homeGroundIds?: Readonly<Record<string, string>>;
  readonly archivesByFixtureId?:
    | ReadonlyMap<string, AnyCareerMatchEventArchive>
    | readonly AnyCareerMatchEventArchive[];
  /** Per-match digests, used for fixtures whose full archive is not supplied. */
  readonly digestsByFixtureId?: ReadonlyMap<string, CareerMatchDigest>;
  readonly retiredPlayers?: readonly RetiredPlayerRecord[];
  readonly activeTeamIds?: readonly string[];
  readonly teamAffiliationByPlayerId?: Readonly<Record<string, string>>;
};

export type HistoricalStatsAccumulator = {
  readonly worldId: string;
  readonly competitionId: string;
  readonly competitionLabel: string;
  readonly seenFixtureIds: Set<string>;
  readonly seenMatchIds: Set<string>;
  readonly seenSourceHashes: Set<string>;
  readonly seasonsMeta: Map<number, HistoricalSeasonOption>;
  readonly facts: HistoricalMatchFact[];
  readonly retiredByPlayerId: Map<string, RetiredPlayerRecord>;
  readonly currentTeamByPlayerId: Map<string, string>;
  readonly teamIds: Set<string>;
  readonly groundIds: Set<string>;
  unknownGroundCount: number;
  archivedMatchCount: number;
};

function safeRatioX100(numerator: number, denominator: number): number {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  return Number((n * 2n + d) / (d * 2n));
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalStringify(v)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .filter((k) => record[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify(record[k])}`)
    .join(",")}}`;
}

function fnv1a128Hex(input: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const primes = [0x01000193, 0x01000193, 0x01000193, 0x01000193];
  let out = "";
  for (let lane = 0; lane < 4; lane += 1) {
    let h = seeds[lane]! >>> 0;
    const p = primes[lane]! >>> 0;
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i) ^ (lane * 31);
      h = Math.imul(h, p) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out;
}

function formatMatchResultSummary(completion: T20SeasonMatchCompletion): string {
  const r = completion.scorecard.result;
  if (r.kind === "WIN" && r.winnerTeamId) {
    if (r.marginType === "RUNS" && r.marginRuns !== null) {
      return `${r.winnerTeamId} won by ${r.marginRuns} run${r.marginRuns === 1 ? "" : "s"}`;
    }
    if (r.marginType === "WICKETS" && r.marginWickets !== null) {
      return `${r.winnerTeamId} won by ${r.marginWickets} wicket${r.marginWickets === 1 ? "" : "s"}`;
    }
    return `${r.winnerTeamId} won`;
  }
  if (r.kind === "TIE") return "Match tied";
  return r.completionReason || "No result";
}

function normalizeArchiveMap(
  input?: ReadonlyMap<string, AnyCareerMatchEventArchive> | readonly AnyCareerMatchEventArchive[],
): ReadonlyMap<string, AnyCareerMatchEventArchive> {
  if (!input) return new Map();
  if (Array.isArray(input)) {
    return new Map(input.map((a) => [a.fixtureId, a]));
  }
  return input as ReadonlyMap<string, AnyCareerMatchEventArchive>;
}

function archiveGroundId(archive: AnyCareerMatchEventArchive | undefined): string | null {
  if (!archive) return null;
  if ("setupRequest" in archive && archive.setupRequest?.setup?.groundId) {
    return archive.setupRequest.setup.groundId;
  }
  if ("preparation" in archive && archive.preparation?.selection?.groundId) {
    return archive.preparation.selection.groundId;
  }
  return null;
}

function extractArchiveDetail(
  archive: AnyCareerMatchEventArchive | undefined,
  completion: T20SeasonMatchCompletion,
): {
  creaseOrder: [string[], string[]];
  fieldingByPlayer: Map<string, { teamId: string; catches: number; stumpings: number; runOuts: number }>;
} | null {
  if (!archive) return null;
  const order0: string[] = [];
  const order1: string[] = [];
  const seen0 = new Set<string>();
  const seen1 = new Set<string>();
  const pushBatter = (inningsIndex: 0 | 1, pid: string) => {
    const seen = inningsIndex === 0 ? seen0 : seen1;
    const arr = inningsIndex === 0 ? order0 : order1;
    if (!seen.has(pid)) {
      seen.add(pid);
      arr.push(pid);
    }
  };

  const teamOfPlayer = new Map<string, string>();
  for (const sel of completion.selectedTeams) {
    for (const pid of sel.playerIds) teamOfPlayer.set(pid, sel.teamId);
  }
  const fieldingByPlayer = new Map<
    string,
    { teamId: string; catches: number; stumpings: number; runOuts: number }
  >();

  for (const envelope of archive.events) {
    if (envelope.type !== "DELIVERY_RECORDED") continue;
    const payload = envelope.payload as {
      type: "DELIVERY_RECORDED";
      event: {
        inningsIndex: 0 | 1;
        strikerId: string;
        nonStrikerId: string;
        bowlingTeamId: string;
        dismissal: {
          kind: "BOWLED" | "LBW" | "CAUGHT" | "RUN_OUT" | "STUMPED" | "HIT_WICKET";
          playerId: string;
          fielderId: string | null;
        } | null;
      };
    };
    const ev = payload.event;
    pushBatter(ev.inningsIndex, ev.strikerId);
    pushBatter(ev.inningsIndex, ev.nonStrikerId);
    const dismissal = ev.dismissal;
    if (dismissal && dismissal.fielderId) {
      const fid = dismissal.fielderId;
      const fTeam = teamOfPlayer.get(fid) ?? ev.bowlingTeamId;
      const cur = fieldingByPlayer.get(fid) ?? {
        teamId: fTeam,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
      };
      if (dismissal.kind === "CAUGHT") cur.catches += 1;
      else if (dismissal.kind === "STUMPED") cur.stumpings += 1;
      else if (dismissal.kind === "RUN_OUT") cur.runOuts += 1;
      fieldingByPlayer.set(fid, cur);
    }
  }

  return { creaseOrder: [order0, order1], fieldingByPlayer };
}

/** Derives the digest with exactly the logic statistics use on a full archive. */
export function deriveCareerMatchDigest(
  archive: AnyCareerMatchEventArchive,
  completion: T20SeasonMatchCompletion,
): CareerMatchDigest {
  const detail = extractArchiveDetail(archive, completion)!;
  return {
    digestVersion: CAREER_MATCH_DIGEST_VERSION,
    fixtureId: completion.fixtureId,
    groundId: archiveGroundId(archive),
    creaseOrder: [[...detail.creaseOrder[0]], [...detail.creaseOrder[1]]],
    fielding: [...detail.fieldingByPlayer.entries()]
      .map(([playerId, f]) => ({ playerId, teamId: f.teamId, catches: f.catches, stumpings: f.stumpings, runOuts: f.runOuts }))
      .sort((a, b) => compareCodePoints(a.playerId, b.playerId)),
  };
}

function detailFromDigest(digest: CareerMatchDigest): {
  creaseOrder: [string[], string[]];
  fieldingByPlayer: Map<string, { teamId: string; catches: number; stumpings: number; runOuts: number }>;
} {
  return {
    creaseOrder: [[...digest.creaseOrder[0]], [...digest.creaseOrder[1]]],
    fieldingByPlayer: new Map(
      digest.fielding.map((f) => [f.playerId, { teamId: f.teamId, catches: f.catches, stumpings: f.stumpings, runOuts: f.runOuts }]),
    ),
  };
}

function lookupGroundFromSeasonMap(
  map: ReadonlyMap<string, string> | Readonly<Record<string, string>> | undefined,
  fixtureId: string,
): string | null {
  if (!map) return null;
  if (map instanceof Map) return map.get(fixtureId) ?? null;
  return (map as Readonly<Record<string, string>>)[fixtureId] ?? null;
}

export function buildHistoricalMatchFact(
  season: HistoricalSeasonInput,
  completion: T20SeasonMatchCompletion,
  options: {
    competitionId: string;
    homeGroundIds?: Readonly<Record<string, string>>;
    archive?: AnyCareerMatchEventArchive;
    /** Used when the full archive is not loaded; derived from it, so the result is the same. */
    digest?: CareerMatchDigest;
  },
): HistoricalMatchFact {
  const resolvedGroundId =
    lookupGroundFromSeasonMap(season.groundByFixtureId, completion.fixtureId) ??
    archiveGroundId(options.archive) ??
    options.digest?.groundId ??
    options.homeGroundIds?.[completion.homeTeamId] ??
    null;

  const participantTeamByPlayerId: Record<string, string> = {};
  const selectionOrderByTeam = new Map<string, readonly string[]>();
  for (const sel of completion.selectedTeams) {
    selectionOrderByTeam.set(sel.teamId, sel.playerIds);
    for (const pid of sel.playerIds) {
      participantTeamByPlayerId[pid] = sel.teamId;
    }
  }

  const archiveDetail = options.archive
    ? extractArchiveDetail(options.archive, completion)
    : options.digest
      ? detailFromDigest(options.digest)
      : null;
  const battingEntries: HistoricalBattingEntryFact[] = [];
  const bowlingEntries: HistoricalBowlingEntryFact[] = [];

  completion.scorecard.innings.forEach((innings, idx) => {
    const inningsIndex = (idx === 0 ? 0 : 1) as 0 | 1;
    const declaredOrder = selectionOrderByTeam.get(innings.battingTeamId) ?? Object.keys(innings.batting);
    const creaseOrder = archiveDetail?.creaseOrder[inningsIndex] ?? [];
    const positionByPlayer = new Map<string, number>();
    let nextPos = 1;
    for (const pid of creaseOrder) {
      if (innings.batting[pid] && !positionByPlayer.has(pid)) {
        positionByPlayer.set(pid, Math.min(11, nextPos));
        nextPos += 1;
      }
    }
    for (const pid of declaredOrder) {
      const line = innings.batting[pid];
      if (!line) continue;
      const batted = line.ballsFaced > 0 || line.dismissed || line.runs > 0;
      if (batted && !positionByPlayer.has(pid)) {
        positionByPlayer.set(pid, Math.min(11, nextPos));
        nextPos += 1;
      }
    }
    for (const [pid, line] of Object.entries(innings.batting)) {
      const batted = line.ballsFaced > 0 || line.dismissed || line.runs > 0;
      if (!batted) continue;
      battingEntries.push({
        playerId: pid,
        teamId: innings.battingTeamId,
        inningsIndex,
        battingPosition: positionByPlayer.get(pid) ?? 11,
        runs: line.runs,
        ballsFaced: line.ballsFaced,
        fours: line.fours,
        sixes: line.sixes,
        dismissed: line.dismissed,
      });
    }
    for (const [pid, line] of Object.entries(innings.bowling)) {
      if (line.legalBalls === 0 && line.runsConceded === 0 && line.wickets === 0) continue;
      bowlingEntries.push({
        playerId: pid,
        teamId: innings.bowlingTeamId,
        inningsIndex,
        legalBalls: line.legalBalls,
        runsConceded: line.runsConceded,
        wickets: line.wickets,
        maidens: line.maidens,
      });
    }
  });

  const fieldingEntries: HistoricalFieldingEntryFact[] = [];
  if (archiveDetail) {
    for (const [playerId, counts] of archiveDetail.fieldingByPlayer.entries()) {
      fieldingEntries.push({
        playerId,
        teamId: counts.teamId,
        catches: counts.catches,
        stumpings: counts.stumpings,
        runOuts: counts.runOuts,
      });
    }
    fieldingEntries.sort((a, b) => compareCodePoints(a.playerId, b.playerId));
  }

  const r = completion.scorecard.result;
  let homePoints = 0;
  let awayPoints = 0;
  if (r.kind === "WIN" && r.winnerTeamId) {
    if (r.winnerTeamId === completion.homeTeamId) homePoints = 2;
    else if (r.winnerTeamId === completion.awayTeamId) awayPoints = 2;
  } else if (r.kind === "TIE" || r.kind === "NO_RESULT") {
    homePoints = 1;
    awayPoints = 1;
  }

  let homeRuns = 0;
  let homeBalls = 0;
  let awayRuns = 0;
  let awayBalls = 0;
  for (const innings of completion.scorecard.innings) {
    const nrrBalls = innings.wickets >= 10 ? 120 : innings.legalBalls;
    if (innings.battingTeamId === completion.homeTeamId) {
      homeRuns += innings.runs;
      homeBalls += nrrBalls;
    } else if (innings.battingTeamId === completion.awayTeamId) {
      awayRuns += innings.runs;
      awayBalls += nrrBalls;
    }
  }

  return {
    seasonNumber: season.seasonNumber,
    calendarYear: season.calendarYear,
    seasonPhase: season.phase,
    competitionId: options.competitionId,
    format: "T20",
    fixtureId: completion.fixtureId,
    matchId: completion.matchId,
    fixtureOrdinal: completion.fixtureOrdinal,
    roundNumber: completion.roundNumber,
    matchDayDate: completion.matchDayDate,
    groundId: resolvedGroundId,
    homeTeamId: completion.homeTeamId,
    awayTeamId: completion.awayTeamId,
    sourceCompletionSha256: completion.sourceCompletionSha256,
    resultSummary: formatMatchResultSummary(completion),
    winnerTeamId: r.kind === "WIN" ? r.winnerTeamId : null,
    resultKind: r.kind,
    homeRuns,
    homeBalls,
    awayRuns,
    awayBalls,
    homePoints,
    awayPoints,
    participantTeamByPlayerId,
    battingEntries,
    bowlingEntries,
    fieldingEntries,
    // A digest is only ever derived from a stored, verified archive, so the replay is available.
    archiveEvaluated: Boolean(options.archive ?? options.digest),
    archiveReplayAvailable: Boolean(options.archive ?? options.digest),
  };
}

export function createEmptyHistoricalStatsAccumulator(input: {
  worldId: string;
  competitionId?: string;
  competitionLabel?: string;
  retiredPlayers?: readonly RetiredPlayerRecord[];
  activeTeamIds?: readonly string[];
  teamAffiliationByPlayerId?: Readonly<Record<string, string>>;
}): HistoricalStatsAccumulator {
  const acc: HistoricalStatsAccumulator = {
    worldId: input.worldId,
    competitionId: input.competitionId ?? HISTORICAL_T20_COMPETITION_ID,
    competitionLabel: input.competitionLabel ?? HISTORICAL_T20_COMPETITION_LABEL,
    seenFixtureIds: new Set(),
    seenMatchIds: new Set(),
    seenSourceHashes: new Set(),
    seasonsMeta: new Map(),
    facts: [],
    retiredByPlayerId: new Map((input.retiredPlayers ?? []).map((r) => [r.playerId, r])),
    currentTeamByPlayerId: new Map(Object.entries(input.teamAffiliationByPlayerId ?? {})),
    teamIds: new Set(input.activeTeamIds ?? []),
    groundIds: new Set(),
    unknownGroundCount: 0,
    archivedMatchCount: 0,
  };
  return acc;
}

/**
 * Incrementally applies one committed match fact into the historical accumulator.
 * Returns `true` when newly applied and `false` if already present (idempotent duplicate protection).
 */
export function applyHistoricalMatchFact(
  acc: HistoricalStatsAccumulator,
  fact: HistoricalMatchFact,
): boolean {
  if (
    acc.seenFixtureIds.has(fact.fixtureId) ||
    acc.seenMatchIds.has(fact.matchId) ||
    acc.seenSourceHashes.has(fact.sourceCompletionSha256)
  ) {
    return false;
  }
  acc.seenFixtureIds.add(fact.fixtureId);
  acc.seenMatchIds.add(fact.matchId);
  acc.seenSourceHashes.add(fact.sourceCompletionSha256);
  acc.facts.push(fact);
  acc.teamIds.add(fact.homeTeamId);
  acc.teamIds.add(fact.awayTeamId);
  if (fact.groundId) acc.groundIds.add(fact.groundId);
  else acc.unknownGroundCount += 1;
  if (fact.archiveEvaluated) acc.archivedMatchCount += 1;

  const existingSeason = acc.seasonsMeta.get(fact.seasonNumber);
  if (existingSeason) {
    acc.seasonsMeta.set(fact.seasonNumber, {
      seasonNumber: fact.seasonNumber,
      calendarYear: fact.calendarYear,
      phase: fact.seasonPhase,
      matchesCount: existingSeason.matchesCount + 1,
    });
  } else {
    acc.seasonsMeta.set(fact.seasonNumber, {
      seasonNumber: fact.seasonNumber,
      calendarYear: fact.calendarYear,
      phase: fact.seasonPhase,
      matchesCount: 1,
    });
  }
  return true;
}

export function registerHistoricalSeasonMetadata(
  acc: HistoricalStatsAccumulator,
  season: Pick<HistoricalSeasonInput, "seasonNumber" | "calendarYear" | "phase">,
): void {
  const existing = acc.seasonsMeta.get(season.seasonNumber);
  acc.seasonsMeta.set(season.seasonNumber, {
    seasonNumber: season.seasonNumber,
    calendarYear: season.calendarYear,
    phase: season.phase,
    matchesCount: existing?.matchesCount ?? 0,
  });
}

export function buildHistoricalMatchFactsFromCareer(source: HistoricalCareerStatsSource): {
  accumulator: HistoricalStatsAccumulator;
  facts: HistoricalMatchFact[];
} {
  const archiveMap = normalizeArchiveMap(source.archivesByFixtureId);
  const acc = createEmptyHistoricalStatsAccumulator({
    worldId: source.worldId,
    ...(source.competitionId ? { competitionId: source.competitionId } : {}),
    ...(source.competitionLabel ? { competitionLabel: source.competitionLabel } : {}),
    ...(source.retiredPlayers ? { retiredPlayers: source.retiredPlayers } : {}),
    ...(source.activeTeamIds ? { activeTeamIds: source.activeTeamIds } : {}),
    ...(source.teamAffiliationByPlayerId
      ? { teamAffiliationByPlayerId: source.teamAffiliationByPlayerId }
      : {}),
  });
  const orderedSeasons = [...source.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber);
  for (const season of orderedSeasons) {
    registerHistoricalSeasonMetadata(acc, season);
    const orderedCompletions = [...season.completedMatches].sort(
      (a, b) => a.fixtureOrdinal - b.fixtureOrdinal || compareCodePoints(a.fixtureId, b.fixtureId),
    );
    for (const completion of orderedCompletions) {
      const archive = archiveMap.get(completion.fixtureId);
      const digest = archive ? undefined : source.digestsByFixtureId?.get(completion.fixtureId);
      const fact = buildHistoricalMatchFact(season, completion, {
        competitionId: acc.competitionId,
        ...(source.homeGroundIds ? { homeGroundIds: source.homeGroundIds } : {}),
        ...(archive ? { archive } : {}),
        ...(digest ? { digest } : {}),
      });
      applyHistoricalMatchFact(acc, fact);
    }
  }
  return { accumulator: acc, facts: acc.facts };
}

function matchesBattingPositionFilter(
  battingPosition: number | null,
  band: HistoricalBattingPositionBand,
  exact: number | null,
): boolean {
  if (exact !== null) return battingPosition === exact;
  if (band === "ALL") return true;
  if (battingPosition === null) return false;
  if (band === "OPENER") return battingPosition >= 1 && battingPosition <= 2;
  if (band === "TOP_ORDER") return battingPosition >= 1 && battingPosition <= 3;
  if (band === "MIDDLE_ORDER") return battingPosition >= 4 && battingPosition <= 7;
  return battingPosition >= 8 && battingPosition <= 11;
}

function isBetterHighScore(
  runs: number,
  notOut: boolean,
  curRuns: number,
  curNotOut: boolean,
  hasBatted: boolean,
): boolean {
  if (!hasBatted) return true;
  if (runs !== curRuns) return runs > curRuns;
  return notOut && !curNotOut;
}

function isBetterBowlingSpell(
  wickets: number,
  runs: number,
  curWickets: number,
  curRuns: number | null,
): boolean {
  if (wickets !== curWickets) return wickets > curWickets;
  if (curRuns === null) return true;
  return runs < curRuns;
}

function formatX100(value: number): string {
  return (value / 100).toFixed(2);
}

function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function buildLeaderboardTable(input: {
  metric: HistoricalLeaderboardMetric;
  title: string;
  sortDirection: "DESC" | "ASC";
  minDenominator: number;
  denominatorField: string;
  summary: string;
  secondaryRule: string | null;
  denominatorDefinition: string;
  nullPolicy: string;
  tieRule: string;
  candidates: Array<{
    playerId: string;
    teamId: string;
    status: "ACTIVE" | "RETIRED";
    qualified: boolean;
    primaryValueX100: number;
    secondaryTieRankValue: number;
    primaryDisplay: string;
    secondaryDisplay: string;
    denominatorCount: number;
    denominatorLabel: string;
    contributingFixtureIds: string[];
  }>;
}): HistoricalLeaderboardTable {
  const qualifiedCandidates = input.candidates.filter((c) => c.qualified);
  const sorted = [...qualifiedCandidates].sort((a, b) => {
    if (a.primaryValueX100 !== b.primaryValueX100) {
      return input.sortDirection === "DESC"
        ? b.primaryValueX100 - a.primaryValueX100
        : a.primaryValueX100 - b.primaryValueX100;
    }
    if (a.secondaryTieRankValue !== b.secondaryTieRankValue) {
      return input.sortDirection === "DESC"
        ? b.secondaryTieRankValue - a.secondaryTieRankValue
        : a.secondaryTieRankValue - b.secondaryTieRankValue;
    }
    return compareCodePoints(a.playerId, b.playerId);
  });

  const top = sorted.slice(0, 50);
  const keyCounts = new Map<string, number>();
  for (const row of top) {
    const key = `${row.primaryValueX100}:${row.secondaryTieRankValue}`;
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }

  const entries: HistoricalLeaderboardEntry[] = [];
  let currentRank = 1;
  for (let i = 0; i < top.length; i += 1) {
    const cur = top[i]!;
    if (i > 0) {
      const prev = top[i - 1]!;
      if (
        cur.primaryValueX100 !== prev.primaryValueX100 ||
        cur.secondaryTieRankValue !== prev.secondaryTieRankValue
      ) {
        currentRank = i + 1;
      }
    }
    const tieKey = `${cur.primaryValueX100}:${cur.secondaryTieRankValue}`;
    entries.push({
      rank: currentRank,
      tied: (keyCounts.get(tieKey) ?? 0) > 1,
      playerId: cur.playerId,
      teamId: cur.teamId,
      status: cur.status,
      qualified: cur.qualified,
      primaryDisplay: cur.primaryDisplay,
      primaryValueX100: cur.primaryValueX100,
      secondaryDisplay: cur.secondaryDisplay,
      denominatorCount: cur.denominatorCount,
      denominatorLabel: cur.denominatorLabel,
      contributingFixtureIds: cur.contributingFixtureIds,
    });
  }

  return {
    metric: input.metric,
    title: input.title,
    sortDirection: input.sortDirection,
    qualificationRule: {
      summary: input.summary,
      minDenominator: input.minDenominator,
      denominatorField: input.denominatorField,
      secondaryRule: input.secondaryRule,
    },
    denominatorDefinition: input.denominatorDefinition,
    nullPolicy: input.nullPolicy,
    tieRule: input.tieRule,
    entries,
    qualifiedCount: qualifiedCandidates.length,
    totalCandidatesCount: input.candidates.length,
  };
}

export function finalizeHistoricalStatisticsProjection(
  acc: HistoricalStatsAccumulator,
  rawQuery: Partial<HistoricalFilterQuery> = {},
): HistoricalStatisticsProjection {
  const query = HistoricalFilterQuerySchema.parse({
    ...DEFAULT_HISTORICAL_FILTER_QUERY,
    ...rawQuery,
  });

  const orderedSeasons = [...acc.seasonsMeta.values()].sort(
    (a, b) => a.seasonNumber - b.seasonNumber,
  );
  const activeSeasonNumber =
    orderedSeasons.find((s) => s.phase === "ACTIVE")?.seasonNumber ??
    orderedSeasons[orderedSeasons.length - 1]?.seasonNumber ??
    1;

  const orderedFacts = [...acc.facts].sort(
    (a, b) =>
      a.seasonNumber - b.seasonNumber ||
      a.fixtureOrdinal - b.fixtureOrdinal ||
      compareCodePoints(a.fixtureId, b.fixtureId),
  );

  const filteredFacts = orderedFacts.filter((fact) => {
    if (query.seasonScope === "ACTIVE" && fact.seasonNumber !== activeSeasonNumber) return false;
    if (typeof query.seasonScope === "number" && fact.seasonNumber !== query.seasonScope) {
      return false;
    }
    if (query.competitionId !== "ALL" && fact.competitionId !== query.competitionId) return false;
    if (query.venueGroundId !== "ALL" && fact.groundId !== query.venueGroundId) return false;
    if (
      query.teamId !== "ALL" &&
      fact.homeTeamId !== query.teamId &&
      fact.awayTeamId !== query.teamId
    ) {
      return false;
    }
    if (
      query.opponentTeamId !== "ALL" &&
      fact.homeTeamId !== query.opponentTeamId &&
      fact.awayTeamId !== query.opponentTeamId
    ) {
      return false;
    }
    return true;
  });

  type MutablePlayerAgg = {
    playerId: string;
    status: "ACTIVE" | "RETIRED";
    currentTeamId: string;
    careerTeamSet: Set<string>;
    careerTeamsOrdered: string[];
    seasonsSet: Set<number>;
    retiredAfterSeasonNumber: number | null;
    retiredCalendarYear: number | null;
    matches: number;
    battingInnings: number;
    notOuts: number;
    runs: number;
    dismissals: number;
    ballsFaced: number;
    fours: number;
    sixes: number;
    fifties: number;
    hundreds: number;
    ducks: number;
    highScoreRuns: number;
    highScoreNotOut: boolean;
    highScoreFixtureId: string | null;
    bowlingInnings: number;
    bowlingRunsConceded: number;
    bowlingLegalBalls: number;
    bowlingWickets: number;
    maidens: number;
    threeWicketHauls: number;
    fourWicketHauls: number;
    fiveWicketHauls: number;
    bestBowlingWickets: number;
    bestBowlingRuns: number | null;
    bestBowlingFixtureId: string | null;
    fieldingMatchesArchived: number;
    catches: number;
    stumpings: number;
    runOuts: number;
    bestMatchCatches: number;
    bestMatchFieldingDismissals: number;
    bestFieldingFixtureId: string | null;
    contributingMatches: HistoricalContributingMatch[];
  };

  const teamStandingMap = new Map<string, HistoricalFilteredTeamRecord>();
  for (const tid of [...acc.teamIds].sort()) {
    teamStandingMap.set(tid, {
      teamId: tid,
      played: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      noResults: 0,
      points: 0,
      runsFor: 0,
      ballsFor: 0,
      runsAgainst: 0,
      ballsAgainst: 0,
    });
  }

  const playerMap = new Map<string, MutablePlayerAgg>();
  const ensurePlayer = (playerId: string, fallbackTeamId: string): MutablePlayerAgg => {
    let cur = playerMap.get(playerId);
    if (!cur) {
      const retired = acc.retiredByPlayerId.get(playerId) ?? null;
      const latestTeam = acc.currentTeamByPlayerId.get(playerId) ?? retired?.lastTeamId ?? fallbackTeamId;
      cur = {
        playerId,
        status: retired ? "RETIRED" : "ACTIVE",
        currentTeamId: latestTeam,
        careerTeamSet: new Set([fallbackTeamId]),
        careerTeamsOrdered: [fallbackTeamId],
        seasonsSet: new Set(),
        retiredAfterSeasonNumber: retired?.retiredAfterSeasonNumber ?? null,
        retiredCalendarYear: retired?.retiredCalendarYear ?? null,
        matches: 0,
        battingInnings: 0,
        notOuts: 0,
        runs: 0,
        dismissals: 0,
        ballsFaced: 0,
        fours: 0,
        sixes: 0,
        fifties: 0,
        hundreds: 0,
        ducks: 0,
        highScoreRuns: 0,
        highScoreNotOut: false,
        highScoreFixtureId: null,
        bowlingInnings: 0,
        bowlingRunsConceded: 0,
        bowlingLegalBalls: 0,
        bowlingWickets: 0,
        maidens: 0,
        threeWicketHauls: 0,
        fourWicketHauls: 0,
        fiveWicketHauls: 0,
        bestBowlingWickets: 0,
        bestBowlingRuns: null,
        bestBowlingFixtureId: null,
        fieldingMatchesArchived: 0,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
        bestMatchCatches: 0,
        bestMatchFieldingDismissals: 0,
        bestFieldingFixtureId: null,
        contributingMatches: [],
      };
      playerMap.set(playerId, cur);
    } else if (!cur.careerTeamSet.has(fallbackTeamId)) {
      cur.careerTeamSet.add(fallbackTeamId);
      cur.careerTeamsOrdered.push(fallbackTeamId);
    }
    return cur;
  };

  const positionFilterActive =
    query.battingPositionBand !== "ALL" || query.battingPositionExact !== null;

  for (const fact of filteredFacts) {
    const homeRow = teamStandingMap.get(fact.homeTeamId);
    const awayRow = teamStandingMap.get(fact.awayTeamId);
    if (homeRow && awayRow) {
      homeRow.played += 1;
      awayRow.played += 1;
      homeRow.points += fact.homePoints;
      awayRow.points += fact.awayPoints;
      homeRow.runsFor += fact.homeRuns;
      homeRow.ballsFor += fact.homeBalls;
      homeRow.runsAgainst += fact.awayRuns;
      homeRow.ballsAgainst += fact.awayBalls;
      awayRow.runsFor += fact.awayRuns;
      awayRow.ballsFor += fact.awayBalls;
      awayRow.runsAgainst += fact.homeRuns;
      awayRow.ballsAgainst += fact.homeBalls;
      if (fact.resultKind === "WIN" && fact.winnerTeamId) {
        if (fact.winnerTeamId === fact.homeTeamId) {
          homeRow.wins += 1;
          awayRow.losses += 1;
        } else {
          awayRow.wins += 1;
          homeRow.losses += 1;
        }
      } else if (fact.resultKind === "TIE") {
        homeRow.ties += 1;
        awayRow.ties += 1;
      } else {
        homeRow.noResults += 1;
        awayRow.noResults += 1;
      }
    }

    const battingByPlayer = new Map<string, HistoricalBattingEntryFact>();
    for (const b of fact.battingEntries) battingByPlayer.set(b.playerId, b);
    const bowlingByPlayer = new Map<string, HistoricalBowlingEntryFact>();
    for (const bw of fact.bowlingEntries) bowlingByPlayer.set(bw.playerId, bw);
    const fieldingByPlayer = new Map<string, HistoricalFieldingEntryFact>();
    for (const f of fact.fieldingEntries) fieldingByPlayer.set(f.playerId, f);

    const participantIds = Object.keys(fact.participantTeamByPlayerId).sort();
    for (const playerId of participantIds) {
      const matchTeamId = fact.participantTeamByPlayerId[playerId]!;
      const opponentTeamId =
        matchTeamId === fact.homeTeamId ? fact.awayTeamId : fact.homeTeamId;
      if (query.teamId !== "ALL" && matchTeamId !== query.teamId) continue;
      if (query.opponentTeamId !== "ALL" && opponentTeamId !== query.opponentTeamId) continue;

      const retired = acc.retiredByPlayerId.get(playerId) ?? null;
      const pStatus: "ACTIVE" | "RETIRED" = retired ? "RETIRED" : "ACTIVE";
      if (query.playerStatus !== "ALL" && pStatus !== query.playerStatus) continue;

      const bat = battingByPlayer.get(playerId) ?? null;
      const batPos = bat ? bat.battingPosition : null;
      if (
        positionFilterActive &&
        !matchesBattingPositionFilter(
          batPos,
          query.battingPositionBand,
          query.battingPositionExact,
        )
      ) {
        continue;
      }

      const agg = ensurePlayer(playerId, matchTeamId);
      agg.matches += 1;
      agg.seasonsSet.add(fact.seasonNumber);

      if (bat) {
        const hadBattedBefore = agg.battingInnings > 0;
        agg.battingInnings += 1;
        agg.runs += bat.runs;
        agg.ballsFaced += bat.ballsFaced;
        agg.fours += bat.fours;
        agg.sixes += bat.sixes;
        if (bat.dismissed) agg.dismissals += 1;
        else agg.notOuts += 1;
        if (bat.runs >= 100) agg.hundreds += 1;
        else if (bat.runs >= 50) agg.fifties += 1;
        if (bat.dismissed && bat.runs === 0) agg.ducks += 1;
        if (
          isBetterHighScore(
            bat.runs,
            !bat.dismissed,
            agg.highScoreRuns,
            agg.highScoreNotOut,
            hadBattedBefore,
          )
        ) {
          agg.highScoreRuns = bat.runs;
          agg.highScoreNotOut = !bat.dismissed;
          agg.highScoreFixtureId = fact.fixtureId;
        }
      }

      const bowl = bowlingByPlayer.get(playerId) ?? null;
      if (bowl) {
        agg.bowlingInnings += 1;
        agg.bowlingRunsConceded += bowl.runsConceded;
        agg.bowlingLegalBalls += bowl.legalBalls;
        agg.bowlingWickets += bowl.wickets;
        agg.maidens += bowl.maidens;
        if (bowl.wickets >= 5) agg.fiveWicketHauls += 1;
        else if (bowl.wickets === 4) agg.fourWicketHauls += 1;
        else if (bowl.wickets === 3) agg.threeWicketHauls += 1;
        if (
          isBetterBowlingSpell(
            bowl.wickets,
            bowl.runsConceded,
            agg.bestBowlingWickets,
            agg.bestBowlingRuns,
          )
        ) {
          agg.bestBowlingWickets = bowl.wickets;
          agg.bestBowlingRuns = bowl.runsConceded;
          agg.bestBowlingFixtureId = fact.fixtureId;
        }
      }

      const fld = fieldingByPlayer.get(playerId) ?? null;
      const catches = fact.archiveEvaluated ? (fld?.catches ?? 0) : null;
      const stumpings = fact.archiveEvaluated ? (fld?.stumpings ?? 0) : null;
      const runOuts = fact.archiveEvaluated ? (fld?.runOuts ?? 0) : null;
      if (fact.archiveEvaluated) {
        agg.fieldingMatchesArchived += 1;
        const c = catches ?? 0;
        const s = stumpings ?? 0;
        const ro = runOuts ?? 0;
        const tot = c + s + ro;
        agg.catches += c;
        agg.stumpings += s;
        agg.runOuts += ro;
        if (c > agg.bestMatchCatches) agg.bestMatchCatches = c;
        if (tot > agg.bestMatchFieldingDismissals) {
          agg.bestMatchFieldingDismissals = tot;
          agg.bestFieldingFixtureId = fact.fixtureId;
        }
      }

      agg.contributingMatches.push({
        fixtureId: fact.fixtureId,
        matchId: fact.matchId,
        seasonNumber: fact.seasonNumber,
        calendarYear: fact.calendarYear,
        roundNumber: fact.roundNumber,
        matchDayDate: fact.matchDayDate,
        competitionId: fact.competitionId,
        format: fact.format,
        groundId: fact.groundId,
        homeTeamId: fact.homeTeamId,
        awayTeamId: fact.awayTeamId,
        teamId: matchTeamId,
        opponentTeamId,
        battedInnings: bat ? (bat.inningsIndex === 0 ? 1 : 2) : null,
        battingPosition: bat ? bat.battingPosition : null,
        runsScored: bat ? bat.runs : null,
        ballsFaced: bat ? bat.ballsFaced : null,
        fours: bat ? bat.fours : null,
        sixes: bat ? bat.sixes : null,
        notOut: bat ? !bat.dismissed : null,
        bowledLegalBalls: bowl ? bowl.legalBalls : null,
        bowlingRunsConceded: bowl ? bowl.runsConceded : null,
        bowlingWickets: bowl ? bowl.wickets : null,
        maidens: bowl ? bowl.maidens : null,
        catches,
        stumpings,
        runOuts,
        archiveEvaluated: fact.archiveEvaluated,
        archiveReplayAvailable: fact.archiveReplayAvailable,
        resultSummary: fact.resultSummary,
        sourceCompletionSha256: fact.sourceCompletionSha256,
      });
    }
  }

  const players: HistoricalPlayerRecord[] = [...playerMap.values()]
    .map((agg) => {
      const boundaryRuns = agg.fours * 4 + agg.sixes * 6;
      const totalFieldingDismissals = agg.catches + agg.stumpings + agg.runOuts;
      return {
        playerId: agg.playerId,
        status: agg.status,
        currentTeamId: agg.currentTeamId,
        careerTeamIds: agg.careerTeamsOrdered,
        retiredAfterSeasonNumber: agg.retiredAfterSeasonNumber,
        retiredCalendarYear: agg.retiredCalendarYear,
        seasonsPlayed: agg.seasonsSet.size,
        matches: agg.matches,
        battingInnings: agg.battingInnings,
        notOuts: agg.notOuts,
        runs: agg.runs,
        dismissals: agg.dismissals,
        ballsFaced: agg.ballsFaced,
        fours: agg.fours,
        sixes: agg.sixes,
        fifties: agg.fifties,
        hundreds: agg.hundreds,
        ducks: agg.ducks,
        highScoreRuns: agg.highScoreRuns,
        highScoreNotOut: agg.highScoreNotOut,
        highScoreFixtureId: agg.highScoreFixtureId,
        battingAverageX100:
          agg.dismissals === 0 ? null : safeRatioX100(agg.runs * 100, agg.dismissals),
        strikeRateX100:
          agg.ballsFaced === 0 ? null : safeRatioX100(agg.runs * 10000, agg.ballsFaced),
        boundaryRunsPercentX100:
          agg.runs === 0 ? null : safeRatioX100(boundaryRuns * 10000, agg.runs),
        bowlingInnings: agg.bowlingInnings,
        bowlingRunsConceded: agg.bowlingRunsConceded,
        bowlingLegalBalls: agg.bowlingLegalBalls,
        bowlingWickets: agg.bowlingWickets,
        maidens: agg.maidens,
        threeWicketHauls: agg.threeWicketHauls,
        fourWicketHauls: agg.fourWicketHauls,
        fiveWicketHauls: agg.fiveWicketHauls,
        bestBowlingWickets: agg.bestBowlingWickets,
        bestBowlingRuns: agg.bestBowlingRuns,
        bestBowlingFixtureId: agg.bestBowlingFixtureId,
        bowlingAverageX100:
          agg.bowlingWickets === 0
            ? null
            : safeRatioX100(agg.bowlingRunsConceded * 100, agg.bowlingWickets),
        economyX100:
          agg.bowlingLegalBalls === 0
            ? null
            : safeRatioX100(agg.bowlingRunsConceded * 600, agg.bowlingLegalBalls),
        bowlingStrikeRateX100:
          agg.bowlingWickets === 0
            ? null
            : safeRatioX100(agg.bowlingLegalBalls * 100, agg.bowlingWickets),
        fieldingMatchesArchived: agg.fieldingMatchesArchived,
        catches: agg.catches,
        stumpings: agg.stumpings,
        runOuts: agg.runOuts,
        totalFieldingDismissals,
        bestMatchCatches: agg.bestMatchCatches,
        bestMatchFieldingDismissals: agg.bestMatchFieldingDismissals,
        bestFieldingFixtureId: agg.bestFieldingFixtureId,
        contributingMatches: agg.contributingMatches,
      };
    })
    .sort(
      (a, b) =>
        b.runs - a.runs ||
        b.bowlingWickets - a.bowlingWickets ||
        compareCodePoints(a.playerId, b.playerId),
    );

  const teamStandings = [...teamStandingMap.values()].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || compareCodePoints(a.teamId, b.teamId),
  );
  const maxTeamMatches = teamStandings.reduce((max, r) => Math.max(max, r.played), 0);
  const isMultiSeasonScope = query.seasonScope === "ALL" && orderedSeasons.length > 1 && filteredFacts.length > 56;
  const isSmallSample = maxTeamMatches <= 4;

  const minBatAvgInnings = isSmallSample ? 2 : isMultiSeasonScope ? 10 : 5;
  const minBatAvgDismissals = isSmallSample ? 1 : isMultiSeasonScope ? 4 : 2;
  const minBatSrBalls = isSmallSample ? 12 : isMultiSeasonScope ? 120 : 60;
  const minBowlWickets = isSmallSample ? 2 : isMultiSeasonScope ? 10 : 5;
  const minEconBalls = isSmallSample ? 12 : isMultiSeasonScope ? 120 : 60;

  const leaderboards = {
    RUNS: buildLeaderboardTable({
      metric: "RUNS",
      title: "Most runs",
      sortDirection: "DESC",
      minDenominator: 1,
      denominatorField: "battingInnings",
      summary: "At least 1 batting innings and 1 run scored in the active filter scope.",
      secondaryRule: "Tie-break: fewer innings, then player ID.",
      denominatorDefinition: "Total runs = sum of bat runs across qualifying innings.",
      nullPolicy: "Players who have not batted are excluded.",
      tieRule: "Shared competition rank (1, 1, 3) when runs and innings tie.",
      candidates: players
        .filter((p) => p.battingInnings >= 1 && p.runs > 0)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: true,
          primaryValueX100: p.runs,
          secondaryTieRankValue: 1_000_000 - p.battingInnings,
          primaryDisplay: String(p.runs),
          secondaryDisplay: `${p.battingInnings} inn · SR ${p.strikeRateX100 === null ? "–" : formatX100(p.strikeRateX100)}`,
          denominatorCount: p.battingInnings,
          denominatorLabel: `${p.battingInnings} innings`,
          contributingFixtureIds: p.contributingMatches
            .filter((m) => m.runsScored !== null)
            .map((m) => m.fixtureId),
        })),
    }),
    BATTING_AVERAGE: buildLeaderboardTable({
      metric: "BATTING_AVERAGE",
      title: "Batting average",
      sortDirection: "DESC",
      minDenominator: minBatAvgDismissals,
      denominatorField: "dismissals",
      summary: `Minimum ${minBatAvgInnings} innings and ${minBatAvgDismissals} dismissal${minBatAvgDismissals === 1 ? "" : "s"} in scope.`,
      secondaryRule: "Higher total runs breaks identical averages.",
      denominatorDefinition: "Batting average = runs / dismissals (not-outs do not increment denominator).",
      nullPolicy: "0 dismissals yields null (–) and is excluded rather than Infinity.",
      tieRule: "Competition rank; identical average and runs share rank.",
      candidates: players
        .filter((p) => p.battingInnings >= 1)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified:
            p.battingInnings >= minBatAvgInnings &&
            p.dismissals >= minBatAvgDismissals &&
            p.battingAverageX100 !== null,
          primaryValueX100: p.battingAverageX100 ?? 0,
          secondaryTieRankValue: p.runs,
          primaryDisplay: p.battingAverageX100 === null ? "–" : formatX100(p.battingAverageX100),
          secondaryDisplay: `${p.runs} runs / ${p.dismissals} dis · ${p.battingInnings} inn`,
          denominatorCount: p.dismissals,
          denominatorLabel: `${p.dismissals} dismissals`,
          contributingFixtureIds: p.contributingMatches
            .filter((m) => m.runsScored !== null)
            .map((m) => m.fixtureId),
        })),
    }),
    BATTING_STRIKE_RATE: buildLeaderboardTable({
      metric: "BATTING_STRIKE_RATE",
      title: "Batting strike rate",
      sortDirection: "DESC",
      minDenominator: minBatSrBalls,
      denominatorField: "ballsFaced",
      summary: `Minimum ${minBatSrBalls} legal/credited balls faced in scope.`,
      secondaryRule: "Higher total runs breaks identical strike rates.",
      denominatorDefinition: "Strike rate = (runs / ballsFaced) × 100.",
      nullPolicy: "0 balls faced yields null (–) and is excluded.",
      tieRule: "Competition rank; identical strike rate and runs share rank.",
      candidates: players
        .filter((p) => p.ballsFaced >= 1)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: p.ballsFaced >= minBatSrBalls && p.strikeRateX100 !== null,
          primaryValueX100: p.strikeRateX100 ?? 0,
          secondaryTieRankValue: p.runs,
          primaryDisplay: p.strikeRateX100 === null ? "–" : formatX100(p.strikeRateX100),
          secondaryDisplay: `${p.runs} runs (${p.ballsFaced} balls)`,
          denominatorCount: p.ballsFaced,
          denominatorLabel: `${p.ballsFaced} balls`,
          contributingFixtureIds: p.contributingMatches
            .filter((m) => m.runsScored !== null)
            .map((m) => m.fixtureId),
        })),
    }),
    HIGH_SCORE: buildLeaderboardTable({
      metric: "HIGH_SCORE",
      title: "Highest innings score",
      sortDirection: "DESC",
      minDenominator: 1,
      denominatorField: "battingInnings",
      summary: "At least 1 batting innings in scope.",
      secondaryRule: "Not-out innings rank ahead of dismissed innings on identical run totals.",
      denominatorDefinition: "Single-innings maximum runs scored.",
      nullPolicy: "Players who have not batted are excluded.",
      tieRule: "Competition rank on (runs, notOut).",
      candidates: players
        .filter((p) => p.battingInnings >= 1)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: true,
          primaryValueX100: p.highScoreRuns,
          secondaryTieRankValue: p.highScoreNotOut ? 1 : 0,
          primaryDisplay: `${p.highScoreRuns}${p.highScoreNotOut ? "*" : ""}`,
          secondaryDisplay: `${p.battingInnings} inn · ${p.runs} career runs`,
          denominatorCount: p.battingInnings,
          denominatorLabel: `${p.battingInnings} innings`,
          contributingFixtureIds: p.highScoreFixtureId ? [p.highScoreFixtureId] : [],
        }))
        .filter((c) => c.contributingFixtureIds.length > 0),
    }),
    SIXES: buildLeaderboardTable({
      metric: "SIXES",
      title: "Most sixes",
      sortDirection: "DESC",
      minDenominator: 1,
      denominatorField: "sixes",
      summary: "At least 1 six hit in scope.",
      secondaryRule: "Fewer balls faced breaks ties.",
      denominatorDefinition: "Total sixes hit across qualifying batting innings.",
      nullPolicy: "0 sixes excluded from leaderboard.",
      tieRule: "Competition rank on (sixes, ballsFaced).",
      candidates: players
        .filter((p) => p.sixes >= 1)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: true,
          primaryValueX100: p.sixes,
          secondaryTieRankValue: 1_000_000 - p.ballsFaced,
          primaryDisplay: String(p.sixes),
          secondaryDisplay: `${p.fours} fours · ${p.runs} runs`,
          denominatorCount: p.ballsFaced,
          denominatorLabel: `${p.ballsFaced} balls`,
          contributingFixtureIds: p.contributingMatches
            .filter((m) => (m.sixes ?? 0) > 0)
            .map((m) => m.fixtureId),
        })),
    }),
    WICKETS: buildLeaderboardTable({
      metric: "WICKETS",
      title: "Most wickets",
      sortDirection: "DESC",
      minDenominator: 1,
      denominatorField: "bowlingWickets",
      summary: "At least 1 wicket taken in scope.",
      secondaryRule: "Fewer runs conceded breaks identical wicket counts.",
      denominatorDefinition: "Total bowler-credited wickets across qualifying innings.",
      nullPolicy: "0 wickets excluded.",
      tieRule: "Competition rank on (wickets, runsConceded).",
      candidates: players
        .filter((p) => p.bowlingWickets >= 1)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: true,
          primaryValueX100: p.bowlingWickets,
          secondaryTieRankValue: 1_000_000 - p.bowlingRunsConceded,
          primaryDisplay: String(p.bowlingWickets),
          secondaryDisplay: `${formatOvers(p.bowlingLegalBalls)} ov · Econ ${p.economyX100 === null ? "–" : formatX100(p.economyX100)}`,
          denominatorCount: p.bowlingLegalBalls,
          denominatorLabel: `${formatOvers(p.bowlingLegalBalls)} overs`,
          contributingFixtureIds: p.contributingMatches
            .filter((m) => (m.bowlingWickets ?? 0) > 0)
            .map((m) => m.fixtureId),
        })),
    }),
    BOWLING_AVERAGE: buildLeaderboardTable({
      metric: "BOWLING_AVERAGE",
      title: "Bowling average",
      sortDirection: "ASC",
      minDenominator: minBowlWickets,
      denominatorField: "bowlingWickets",
      summary: `Minimum ${minBowlWickets} wickets taken in scope (lower is better).`,
      secondaryRule: "More wickets taken breaks identical averages.",
      denominatorDefinition: "Bowling average = runsConceded / wickets.",
      nullPolicy: "0 wickets yields null (–) and is excluded.",
      tieRule: "Competition rank; identical average and wickets share rank.",
      candidates: players
        .filter((p) => p.bowlingInnings >= 1)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: p.bowlingWickets >= minBowlWickets && p.bowlingAverageX100 !== null,
          primaryValueX100: p.bowlingAverageX100 ?? 0,
          secondaryTieRankValue: 1_000_000 - p.bowlingWickets,
          primaryDisplay:
            p.bowlingAverageX100 === null ? "–" : formatX100(p.bowlingAverageX100),
          secondaryDisplay: `${p.bowlingWickets} wkts · ${p.bowlingRunsConceded} runs`,
          denominatorCount: p.bowlingWickets,
          denominatorLabel: `${p.bowlingWickets} wickets`,
          contributingFixtureIds: p.contributingMatches
            .filter((m) => m.bowledLegalBalls !== null)
            .map((m) => m.fixtureId),
        })),
    }),
    ECONOMY: buildLeaderboardTable({
      metric: "ECONOMY",
      title: "Bowling economy",
      sortDirection: "ASC",
      minDenominator: minEconBalls,
      denominatorField: "bowlingLegalBalls",
      summary: `Minimum ${formatOvers(minEconBalls)} overs (${minEconBalls} legal balls) bowled in scope (lower is better).`,
      secondaryRule: "More legal balls bowled breaks identical economy rates.",
      denominatorDefinition: "Economy = runsConceded / (legalBalls / 6).",
      nullPolicy: "0 legal balls yields null (–) and is excluded.",
      tieRule: "Competition rank; identical economy and legal balls share rank.",
      candidates: players
        .filter((p) => p.bowlingLegalBalls >= 1)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: p.bowlingLegalBalls >= minEconBalls && p.economyX100 !== null,
          primaryValueX100: p.economyX100 ?? 0,
          secondaryTieRankValue: 1_000_000 - p.bowlingLegalBalls,
          primaryDisplay: p.economyX100 === null ? "–" : formatX100(p.economyX100),
          secondaryDisplay: `${formatOvers(p.bowlingLegalBalls)} ov · ${p.bowlingWickets} wkts`,
          denominatorCount: p.bowlingLegalBalls,
          denominatorLabel: `${formatOvers(p.bowlingLegalBalls)} overs`,
          contributingFixtureIds: p.contributingMatches
            .filter((m) => m.bowledLegalBalls !== null)
            .map((m) => m.fixtureId),
        })),
    }),
    BOWLING_STRIKE_RATE: buildLeaderboardTable({
      metric: "BOWLING_STRIKE_RATE",
      title: "Bowling strike rate",
      sortDirection: "ASC",
      minDenominator: minBowlWickets,
      denominatorField: "bowlingWickets",
      summary: `Minimum ${minBowlWickets} wickets taken in scope (balls per wicket, lower is better).`,
      secondaryRule: "More wickets taken breaks identical bowling strike rates.",
      denominatorDefinition: "Bowling strike rate = legalBalls / wickets.",
      nullPolicy: "0 wickets yields null (–) and is excluded.",
      tieRule: "Competition rank; identical strike rate and wickets share rank.",
      candidates: players
        .filter((p) => p.bowlingInnings >= 1)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: p.bowlingWickets >= minBowlWickets && p.bowlingStrikeRateX100 !== null,
          primaryValueX100: p.bowlingStrikeRateX100 ?? 0,
          secondaryTieRankValue: 1_000_000 - p.bowlingWickets,
          primaryDisplay:
            p.bowlingStrikeRateX100 === null ? "–" : formatX100(p.bowlingStrikeRateX100),
          secondaryDisplay: `${p.bowlingWickets} wkts (${formatOvers(p.bowlingLegalBalls)} ov)`,
          denominatorCount: p.bowlingWickets,
          denominatorLabel: `${p.bowlingWickets} wickets`,
          contributingFixtureIds: p.contributingMatches
            .filter((m) => m.bowledLegalBalls !== null)
            .map((m) => m.fixtureId),
        })),
    }),
    BEST_BOWLING: buildLeaderboardTable({
      metric: "BEST_BOWLING",
      title: "Best bowling in an innings",
      sortDirection: "DESC",
      minDenominator: 1,
      denominatorField: "bowlingWickets",
      summary: "At least 1 wicket in a single innings in scope.",
      secondaryRule: "Fewer runs conceded ranks ahead on identical wicket hauls.",
      denominatorDefinition: "Single-innings best wickets/runs spell.",
      nullPolicy: "0-wicket bowlers are excluded.",
      tieRule: "Competition rank on (wickets, runsConceded).",
      candidates: players
        .filter((p) => p.bestBowlingWickets >= 1 && p.bestBowlingRuns !== null)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: true,
          primaryValueX100: p.bestBowlingWickets,
          secondaryTieRankValue: 1_000_000 - (p.bestBowlingRuns ?? 0),
          primaryDisplay: `${p.bestBowlingWickets}/${p.bestBowlingRuns}`,
          secondaryDisplay: `${p.bowlingInnings} bowling inn · ${p.bowlingWickets} career wkts`,
          denominatorCount: p.bowlingInnings,
          denominatorLabel: `${p.bowlingInnings} bowling inn`,
          contributingFixtureIds: p.bestBowlingFixtureId ? [p.bestBowlingFixtureId] : [],
        }))
        .filter((c) => c.contributingFixtureIds.length > 0),
    }),
    FIELDING_DISMISSALS: buildLeaderboardTable({
      metric: "FIELDING_DISMISSALS",
      title: "Most fielding dismissals",
      sortDirection: "DESC",
      minDenominator: 1,
      denominatorField: "totalFieldingDismissals",
      summary: "At least 1 catch, stumping, or run-out credited from archived match events.",
      secondaryRule: "More catches break identical dismissal totals.",
      denominatorDefinition: "Total fielding dismissals = catches + stumpings + run-outs across archived matches.",
      nullPolicy: "Matches without ball-by-ball archives are excluded from fielding totals.",
      tieRule: "Competition rank on (totalFieldingDismissals, catches).",
      candidates: players
        .filter((p) => p.totalFieldingDismissals >= 1)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: true,
          primaryValueX100: p.totalFieldingDismissals,
          secondaryTieRankValue: p.catches,
          primaryDisplay: String(p.totalFieldingDismissals),
          secondaryDisplay: `${p.catches} ct · ${p.stumpings} st · ${p.runOuts} ro (${p.fieldingMatchesArchived} arch)`,
          denominatorCount: p.fieldingMatchesArchived,
          denominatorLabel: `${p.fieldingMatchesArchived} archived matches`,
          contributingFixtureIds: p.contributingMatches
            .filter((m) => (m.catches ?? 0) + (m.stumpings ?? 0) + (m.runOuts ?? 0) > 0)
            .map((m) => m.fixtureId),
        })),
    }),
    CATCHES: buildLeaderboardTable({
      metric: "CATCHES",
      title: "Most catches",
      sortDirection: "DESC",
      minDenominator: 1,
      denominatorField: "catches",
      summary: "At least 1 catch credited from archived match events.",
      secondaryRule: "Fewer archived matches breaks identical catch totals.",
      denominatorDefinition: "Total catches across ball-by-ball archived matches.",
      nullPolicy: "Matches without ball-by-ball archives do not contribute catch counts.",
      tieRule: "Competition rank on (catches, archivedMatches).",
      candidates: players
        .filter((p) => p.catches >= 1)
        .map((p) => ({
          playerId: p.playerId,
          teamId: p.currentTeamId,
          status: p.status,
          qualified: true,
          primaryValueX100: p.catches,
          secondaryTieRankValue: 1_000_000 - p.fieldingMatchesArchived,
          primaryDisplay: String(p.catches),
          secondaryDisplay: `${p.fieldingMatchesArchived} archived matches · best ${p.bestMatchCatches}`,
          denominatorCount: p.fieldingMatchesArchived,
          denominatorLabel: `${p.fieldingMatchesArchived} archived matches`,
          contributingFixtureIds: p.contributingMatches
            .filter((m) => (m.catches ?? 0) > 0)
            .map((m) => m.fixtureId),
        })),
    }),
  };

  const groundIds = [...acc.groundIds].sort();
  const totalSourceMatches = orderedFacts.length;
  const venuesCoverage =
    totalSourceMatches === 0
      ? groundIds.length > 0
        ? "ALL_RESOLVED"
        : "UNAVAILABLE"
      : acc.unknownGroundCount === 0
        ? "ALL_RESOLVED"
        : groundIds.length > 0
          ? "PARTIAL"
          : "UNAVAILABLE";
  const fieldingCoverage =
    totalSourceMatches === 0
      ? "UNAVAILABLE"
      : acc.archivedMatchCount === totalSourceMatches
        ? "ALL_ARCHIVED"
        : acc.archivedMatchCount > 0
          ? "PARTIAL_ARCHIVES"
          : "UNAVAILABLE";

  const filterSupport: HistoricalFilterSupport = {
    formats: ["T20"],
    unsupportedFormatsNote:
      "Career schedules currently run T20 league competitions only; ODI and Red-ball remain exhibition formats and are excluded from career filters.",
    competitions: [
      {
        competitionId: acc.competitionId,
        label: acc.competitionLabel,
        format: "T20",
      },
    ],
    seasons: orderedSeasons,
    opponents: [...acc.teamIds].sort(),
    teams: [...acc.teamIds].sort(),
    venues: {
      available: venuesCoverage !== "UNAVAILABLE",
      coverage: venuesCoverage,
      groundIds,
      note:
        venuesCoverage === "ALL_RESOLVED"
          ? `All ${totalSourceMatches} completed matches resolved to ground venues.`
          : venuesCoverage === "PARTIAL"
            ? `Resolved venues for ${totalSourceMatches - acc.unknownGroundCount} of ${totalSourceMatches} completed matches.`
            : "Venue resolution is available once matches or schedules are loaded.",
    },
    battingPosition: {
      available: true,
      bands: ["ALL", "OPENER", "TOP_ORDER", "MIDDLE_ORDER", "LOWER_ORDER"],
      note: "Batting-position filters isolate innings batted at that slot (1–11); bowling & fielding reflect those same qualifying matches.",
    },
    fielding: {
      available: fieldingCoverage !== "UNAVAILABLE",
      archiveCoverageCount: acc.archivedMatchCount,
      totalMatchesCount: totalSourceMatches,
      coverage: fieldingCoverage,
      note:
        fieldingCoverage === "ALL_ARCHIVED"
          ? `Fielding dismissals verified across all ${totalSourceMatches} archived ball-by-ball matches.`
          : fieldingCoverage === "PARTIAL_ARCHIVES"
            ? `Fielding credits verified for ${acc.archivedMatchCount} of ${totalSourceMatches} matches with ball-by-ball event archives.`
            : "Ball-by-ball match event archives are required for fielding catches, stumpings, and run-outs.",
    },
  };

  const core = {
    projectionVersion: HISTORICAL_STATS_PROJECTION_VERSION,
    sourceClass: "CAREER" as const,
    separationNotice: HISTORICAL_SEPARATION_NOTICE,
    filterQuery: query,
    filterSupport,
    totalSourceMatches,
    filteredMatchesCount: filteredFacts.length,
    players,
    leaderboards,
    teamStandings,
  };
  const projectionDigest = fnv1a128Hex(canonicalStringify(core));

  return HistoricalStatisticsProjectionSchema.parse({
    ...core,
    projectionDigest,
  });
}

export function projectHistoricalStatistics(
  source: HistoricalCareerStatsSource,
  query: Partial<HistoricalFilterQuery> = {},
): HistoricalStatisticsProjection {
  const { accumulator } = buildHistoricalMatchFactsFromCareer(source);
  return finalizeHistoricalStatisticsProjection(accumulator, query);
}

export function buildHistoricalStatsSourceFromPersistentWorld(input: {
  world: AnyPersistentWorldState;
  archives?: readonly AnyCareerMatchEventArchive[] | ReadonlyMap<string, AnyCareerMatchEventArchive>;
  digests?: ReadonlyMap<string, CareerMatchDigest>;
  homeGroundIds?: Readonly<Record<string, string>>;
  teamAffiliationByPlayerId?: Readonly<Record<string, string>>;
  activeTeamIds?: readonly string[];
}): HistoricalCareerStatsSource {
  const { world } = input;
  const activeGroundMap = new Map<string, string>();
  for (const fixture of world.currentSeason.schedule.fixtures) {
    activeGroundMap.set(fixture.fixtureId, fixture.groundId);
  }
  const seasons: HistoricalSeasonInput[] = [
    ...world.completedSeasons.map((s) => ({
      seasonNumber: s.seasonNumber,
      calendarYear: s.calendarYear,
      phase: "COMPLETE" as const,
      completedMatches: s.completedMatches,
    })),
    {
      seasonNumber: world.currentSeasonNumber,
      calendarYear: world.currentCalendarYear,
      phase: world.currentSeason.phase,
      completedMatches: world.currentSeason.completedMatches,
      groundByFixtureId: activeGroundMap,
    },
  ];
  const retiredPlayers =
    "lifecycle" in world ? world.lifecycle.retiredPlayers : undefined;
  const teamAffiliationByPlayerId: Record<string, string> = {
    ...(input.teamAffiliationByPlayerId ?? {}),
  };
  if ("lifecycle" in world && !input.teamAffiliationByPlayerId) {
    for (const t of world.lifecycle.activeWorld.teams) {
      for (const pid of t.squadIds) teamAffiliationByPlayerId[pid] = t.teamId;
    }
  }
  const activeTeamIds =
    input.activeTeamIds ??
    ("lifecycle" in world
      ? world.lifecycle.activeWorld.teams.map((t) => t.teamId)
      : world.currentSeason.schedule.teamIds);

  return {
    worldId: world.worldIdentity.worldId,
    seasons,
    ...(input.homeGroundIds ? { homeGroundIds: input.homeGroundIds } : {}),
    ...(input.archives ? { archivesByFixtureId: input.archives } : {}),
    ...(input.digests ? { digestsByFixtureId: input.digests } : {}),
    ...(retiredPlayers ? { retiredPlayers } : {}),
    activeTeamIds,
    teamAffiliationByPlayerId,
  };
}

export function buildHistoricalStatsSourceFromSingleSeason(input: {
  season: T20SeasonState;
  worldId: string;
  calendarYear?: number;
  archives?: readonly AnyCareerMatchEventArchive[] | ReadonlyMap<string, AnyCareerMatchEventArchive>;
  digests?: ReadonlyMap<string, CareerMatchDigest>;
  homeGroundIds?: Readonly<Record<string, string>>;
  teamAffiliationByPlayerId?: Readonly<Record<string, string>>;
}): HistoricalCareerStatsSource {
  const { season } = input;
  const groundMap = new Map<string, string>();
  for (const fixture of season.schedule.fixtures) {
    groundMap.set(fixture.fixtureId, fixture.groundId);
  }
  const parsedYear =
    input.calendarYear ??
    (Number.parseInt(season.schedule.startDate.slice(0, 4), 10) || 2027);
  return {
    worldId: input.worldId,
    seasons: [
      {
        seasonNumber: 1,
        calendarYear: parsedYear,
        phase: season.phase,
        completedMatches: season.completedMatches,
        groundByFixtureId: groundMap,
      },
    ],
    ...(input.homeGroundIds ? { homeGroundIds: input.homeGroundIds } : {}),
    ...(input.archives ? { archivesByFixtureId: input.archives } : {}),
    ...(input.digests ? { digestsByFixtureId: input.digests } : {}),
    activeTeamIds: season.schedule.teamIds,
    ...(input.teamAffiliationByPlayerId
      ? { teamAffiliationByPlayerId: input.teamAffiliationByPlayerId }
      : {}),
  };
}
