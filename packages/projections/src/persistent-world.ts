import {
  ActivePersistentSeasonStateSchema,
  CompletedSeasonRecordSchema,
  PERSISTENT_CAREER_PROJECTION_VERSION,
  PersistentCareerProjectionCoreSchema,
  T20SeasonMatchCompletionSchema,
  type ActivePersistentSeasonState,
  type CompletedSeasonRecord,
  type PersistentCareerPlayerStats,
  type PersistentCareerProjectionCore,
  type PersistentCareerTeamHistoryRow,
  type SeasonLeaderboardEntry,
  type SeasonLeaderboards,
  type SeasonRollOfHonourEntry,
  type T20SeasonMatchCompletion,
} from "@lcxxvi/contracts";

function assertPersistentProjection(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`LC_PERSISTENT_CAREER_PROJECTION_${code}`);
}

function safeNumber(value: bigint, code: string): number {
  assertPersistentProjection(
    value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER),
    code,
  );
  return Number(value);
}

function roundPositiveRatio(numerator: bigint, denominator: bigint): number {
  assertPersistentProjection(denominator > 0n && numerator >= 0n, "INVALID_POSITIVE_RATIO");
  return safeNumber((numerator * 2n + denominator) / (denominator * 2n), "RATIO_OVERFLOW");
}

type MutableCareerPlayerStats = Omit<
  PersistentCareerPlayerStats,
  | "battingAverageX100"
  | "strikeRateX100"
  | "bowlingAverageX100"
  | "economyX100"
  | "bowlingStrikeRateX100"
>;

function stripDerivedPlayer(stat: PersistentCareerPlayerStats): MutableCareerPlayerStats {
  const {
    battingAverageX100,
    strikeRateX100,
    bowlingAverageX100,
    economyX100,
    bowlingStrikeRateX100,
    ...raw
  } = stat;
  void battingAverageX100;
  void strikeRateX100;
  void bowlingAverageX100;
  void economyX100;
  void bowlingStrikeRateX100;
  return { ...raw };
}

function deriveCareerPlayer(raw: MutableCareerPlayerStats): PersistentCareerPlayerStats {
  return {
    ...raw,
    battingAverageX100:
      raw.dismissals === 0
        ? null
        : roundPositiveRatio(BigInt(raw.runs) * 100n, BigInt(raw.dismissals)),
    strikeRateX100:
      raw.ballsFaced === 0
        ? null
        : roundPositiveRatio(BigInt(raw.runs) * 10000n, BigInt(raw.ballsFaced)),
    bowlingAverageX100:
      raw.bowlingWickets === 0
        ? null
        : roundPositiveRatio(BigInt(raw.bowlingRunsConceded) * 100n, BigInt(raw.bowlingWickets)),
    economyX100:
      raw.bowlingLegalBalls === 0
        ? null
        : roundPositiveRatio(BigInt(raw.bowlingRunsConceded) * 600n, BigInt(raw.bowlingLegalBalls)),
    bowlingStrikeRateX100:
      raw.bowlingWickets === 0
        ? null
        : roundPositiveRatio(BigInt(raw.bowlingLegalBalls) * 100n, BigInt(raw.bowlingWickets)),
  };
}

function emptyCareerPlayer(playerId: string, teamId: string): MutableCareerPlayerStats {
  return {
    playerId,
    teamId,
    seasonsPlayed: 0,
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
    bowlingInnings: 0,
    bowlingRunsConceded: 0,
    bowlingLegalBalls: 0,
    bowlingWickets: 0,
    maidens: 0,
    bestBowlingWickets: 0,
    bestBowlingRuns: null,
  };
}

function isBetterHighScore(
  runs: number,
  notOut: boolean,
  currentRuns: number,
  currentNotOut: boolean,
  hasBattedBefore: boolean,
): boolean {
  if (!hasBattedBefore) return true;
  if (runs !== currentRuns) return runs > currentRuns;
  return notOut && !currentNotOut;
}

function isBetterBowlingFigures(
  wickets: number,
  runsConceded: number,
  bestWickets: number,
  bestRuns: number | null,
): boolean {
  if (bestRuns === null) return true;
  if (wickets !== bestWickets) return wickets > bestWickets;
  return runsConceded < bestRuns;
}

function applyCompletionToPlayerMap(
  players: Map<string, MutableCareerPlayerStats>,
  seasonsSeenByPlayer: Map<string, Set<string>>,
  completion: T20SeasonMatchCompletion,
): void {
  const selected = new Map<string, string>();
  for (const team of completion.selectedTeams) {
    for (const playerId of team.playerIds) {
      assertPersistentProjection(!selected.has(playerId), `PLAYER_SELECTED_TWICE:${playerId}`);
      selected.set(playerId, team.teamId);
      const existing = players.get(playerId);
      if (existing) {
        assertPersistentProjection(existing.teamId === team.teamId, `PLAYER_TEAM_MISMATCH:${playerId}`);
      } else {
        players.set(playerId, emptyCareerPlayer(playerId, team.teamId));
      }
      let seenSeasons = seasonsSeenByPlayer.get(playerId);
      if (!seenSeasons) {
        seenSeasons = new Set<string>();
        seasonsSeenByPlayer.set(playerId, seenSeasons);
      }
      if (!seenSeasons.has(completion.seasonId)) {
        seenSeasons.add(completion.seasonId);
        players.get(playerId)!.seasonsPlayed += 1;
      }
      players.get(playerId)!.matches += 1;
    }
  }
  for (const innings of completion.scorecard.innings) {
    for (const [playerId, line] of Object.entries(innings.batting)) {
      assertPersistentProjection(
        selected.get(playerId) === innings.battingTeamId,
        `BATTING_PLAYER_NOT_SELECTED:${playerId}`,
      );
      const stat = players.get(playerId)!;
      const battedThisInnings = line.ballsFaced > 0 || line.dismissed || line.runs > 0;
      if (battedThisInnings) {
        const hadPreviousInnings = stat.battingInnings > 0;
        const notOut = !line.dismissed;
        stat.battingInnings += 1;
        if (notOut) stat.notOuts += 1;
        if (line.runs === 0 && line.dismissed) stat.ducks += 1;
        if (line.runs >= 100) stat.hundreds += 1;
        else if (line.runs >= 50) stat.fifties += 1;
        if (
          isBetterHighScore(
            line.runs,
            notOut,
            stat.highScoreRuns,
            stat.highScoreNotOut,
            hadPreviousInnings,
          )
        ) {
          stat.highScoreRuns = line.runs;
          stat.highScoreNotOut = notOut;
        }
      }
      stat.runs += line.runs;
      stat.dismissals += line.dismissed ? 1 : 0;
      stat.ballsFaced += line.ballsFaced;
      stat.fours += line.fours;
      stat.sixes += line.sixes;
    }
    for (const [playerId, line] of Object.entries(innings.bowling)) {
      assertPersistentProjection(
        selected.get(playerId) === innings.bowlingTeamId,
        `BOWLING_PLAYER_NOT_SELECTED:${playerId}`,
      );
      const stat = players.get(playerId)!;
      if (line.legalBalls > 0 || line.runsConceded > 0 || line.wickets > 0) {
        stat.bowlingInnings += 1;
        if (
          isBetterBowlingFigures(
            line.wickets,
            line.runsConceded,
            stat.bestBowlingWickets,
            stat.bestBowlingRuns,
          )
        ) {
          stat.bestBowlingWickets = line.wickets;
          stat.bestBowlingRuns = line.runsConceded;
        }
      }
      stat.bowlingRunsConceded += line.runsConceded;
      stat.bowlingLegalBalls += line.legalBalls;
      stat.bowlingWickets += line.wickets;
      stat.maidens += line.maidens;
    }
  }
}

function computeCareerLeaders(players: readonly PersistentCareerPlayerStats[]): SeasonLeaderboards {
  const top = (
    entries: Array<{ playerId: string; teamId: string; value: number }>,
  ): SeasonLeaderboardEntry[] =>
    entries
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId))
      .slice(0, 10);
  return {
    runs: top(players.map((p) => ({ playerId: p.playerId, teamId: p.teamId, value: p.runs }))),
    wickets: top(
      players.map((p) => ({ playerId: p.playerId, teamId: p.teamId, value: p.bowlingWickets })),
    ),
  };
}

function emptyTeamHistoryRow(teamId: string): PersistentCareerTeamHistoryRow {
  return {
    teamId,
    seasonsCompleted: 0,
    titles: 0,
    runnerUpFinishes: 0,
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
  };
}

function applyMatchToTeamHistory(
  teams: Map<string, PersistentCareerTeamHistoryRow>,
  completion: T20SeasonMatchCompletion,
): void {
  const home = teams.get(completion.homeTeamId);
  const away = teams.get(completion.awayTeamId);
  assertPersistentProjection(home && away, `UNKNOWN_TEAM:${completion.fixtureId}`);
  home.played += 1;
  away.played += 1;
  const result = completion.scorecard.result;
  if (result.kind === "WIN") {
    if (result.winnerTeamId === completion.homeTeamId) {
      home.wins += 1;
      home.points += 2;
      away.losses += 1;
    } else {
      assertPersistentProjection(
        result.winnerTeamId === completion.awayTeamId,
        `INVALID_WINNER:${completion.fixtureId}`,
      );
      away.wins += 1;
      away.points += 2;
      home.losses += 1;
    }
  } else if (result.kind === "TIE") {
    home.ties += 1;
    away.ties += 1;
    home.points += 1;
    away.points += 1;
  } else {
    home.noResults += 1;
    away.noResults += 1;
    home.points += 1;
    away.points += 1;
  }
  if (result.kind !== "NO_RESULT") {
    const homeInnings = completion.scorecard.innings.find(
      (inn) => inn.battingTeamId === completion.homeTeamId,
    );
    const awayInnings = completion.scorecard.innings.find(
      (inn) => inn.battingTeamId === completion.awayTeamId,
    );
    assertPersistentProjection(homeInnings && awayInnings, `INNINGS_TEAM_MISMATCH:${completion.fixtureId}`);
    const homeBalls = homeInnings.wickets >= 10 ? 120 : homeInnings.legalBalls;
    const awayBalls = awayInnings.wickets >= 10 ? 120 : awayInnings.legalBalls;
    if (homeBalls > 0 && awayBalls > 0) {
      home.runsFor += homeInnings.runs;
      home.ballsFor += homeBalls;
      home.runsAgainst += awayInnings.runs;
      home.ballsAgainst += awayBalls;
      away.runsFor += awayInnings.runs;
      away.ballsFor += awayBalls;
      away.runsAgainst += homeInnings.runs;
      away.ballsAgainst += homeBalls;
    }
  }
}

export function createEmptyPersistentCareerProjectionCore(input: {
  worldId: string;
  teamIds: readonly string[];
  activeSeasonNumber?: number;
}): PersistentCareerProjectionCore {
  const sortedTeams = [...input.teamIds].sort((a, b) => a.localeCompare(b));
  assertPersistentProjection(new Set(sortedTeams).size === 8, "TEAM_COUNT_MUST_BE_EIGHT");
  return PersistentCareerProjectionCoreSchema.parse({
    careerProjectionVersion: PERSISTENT_CAREER_PROJECTION_VERSION,
    worldId: input.worldId,
    completedSeasonCount: 0,
    activeSeasonNumber: input.activeSeasonNumber ?? 1,
    activeSeasonMatchesApplied: 0,
    totalMatchesApplied: 0,
    rollOfHonour: [],
    teamHistory: sortedTeams.map(emptyTeamHistoryRow),
    players: [],
    leaders: { runs: [], wickets: [] },
  });
}

export function rebuildPersistentCareerProjectionCore(input: {
  worldId: string;
  teamIds: readonly string[];
  completedSeasons: readonly unknown[];
  activeSeason: unknown;
}): PersistentCareerProjectionCore {
  const sortedTeams = [...input.teamIds].sort((a, b) => a.localeCompare(b));
  assertPersistentProjection(new Set(sortedTeams).size === 8, "TEAM_COUNT_MUST_BE_EIGHT");
  const completedSeasons: CompletedSeasonRecord[] = input.completedSeasons.map((item) =>
    CompletedSeasonRecordSchema.parse(item),
  );
  const activeSeason: ActivePersistentSeasonState = ActivePersistentSeasonStateSchema.parse(
    input.activeSeason,
  );

  const expectedActiveSeasonNumber = completedSeasons.length + 1;
  const seenSeasonIds = new Set<string>();
  const seenMatchIds = new Set<string>();
  const seenFixtureIds = new Set<string>();
  const seenSourceHashes = new Map<string, string>();

  const teamMap = new Map<string, PersistentCareerTeamHistoryRow>(
    sortedTeams.map((teamId) => [teamId, emptyTeamHistoryRow(teamId)]),
  );
  const playerMap = new Map<string, MutableCareerPlayerStats>();
  const seasonsSeenByPlayer = new Map<string, Set<string>>();
  const rollOfHonour: SeasonRollOfHonourEntry[] = [];

  for (const [index, season] of completedSeasons.entries()) {
    assertPersistentProjection(
      season.seasonNumber === index + 1,
      `NON_SEQUENTIAL_SEASON:${season.seasonNumber}`,
    );
    assertPersistentProjection(
      !seenSeasonIds.has(season.seasonId),
      `DUPLICATE_COMPLETED_SEASON_ID:${season.seasonId}`,
    );
    seenSeasonIds.add(season.seasonId);

    for (const row of teamMap.values()) row.seasonsCompleted += 1;
    const championRow = teamMap.get(season.championTeamId);
    const runnerUpRow = teamMap.get(season.runnerUpTeamId);
    assertPersistentProjection(
      championRow && runnerUpRow && season.championTeamId !== season.runnerUpTeamId,
      `INVALID_PODIUM:${season.seasonId}`,
    );
    championRow.titles += 1;
    runnerUpRow.runnerUpFinishes += 1;

    rollOfHonour.push({
      seasonNumber: season.seasonNumber,
      calendarYear: season.calendarYear,
      seasonId: season.seasonId,
      championTeamId: season.championTeamId,
      runnerUpTeamId: season.runnerUpTeamId,
      leadingRunScorer: season.leaders.runs[0] ?? null,
      leadingWicketTaker: season.leaders.wickets[0] ?? null,
      finalSeasonStateSha256: season.finalSeasonStateSha256,
    });

    const orderedCompletions = [...season.completedMatches].sort(
      (a, b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId),
    );
    for (const completion of orderedCompletions) {
      assertPersistentProjection(
        !seenMatchIds.has(completion.matchId) && !seenFixtureIds.has(completion.fixtureId),
        `DUPLICATE_HISTORICAL_MATCH:${completion.fixtureId}`,
      );
      assertPersistentProjection(
        !seenSourceHashes.has(completion.sourceCompletionSha256),
        `REUSED_COMPLETION_SOURCE:${completion.fixtureId}`,
      );
      seenMatchIds.add(completion.matchId);
      seenFixtureIds.add(completion.fixtureId);
      seenSourceHashes.set(completion.sourceCompletionSha256, completion.matchId);
      applyMatchToTeamHistory(teamMap, completion);
      applyCompletionToPlayerMap(playerMap, seasonsSeenByPlayer, completion);
    }
  }

  assertPersistentProjection(
    !seenSeasonIds.has(activeSeason.seasonId),
    `ACTIVE_SEASON_COLLIDES_WITH_HISTORY:${activeSeason.seasonId}`,
  );
  const activeCompletions = [...activeSeason.completedMatches].sort(
    (a, b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId),
  );
  for (const completion of activeCompletions) {
    assertPersistentProjection(
      !seenMatchIds.has(completion.matchId) && !seenFixtureIds.has(completion.fixtureId),
      `ACTIVE_MATCH_COLLIDES_WITH_HISTORY:${completion.fixtureId}`,
    );
    assertPersistentProjection(
      !seenSourceHashes.has(completion.sourceCompletionSha256),
      `ACTIVE_COMPLETION_SOURCE_REUSED:${completion.fixtureId}`,
    );
    seenMatchIds.add(completion.matchId);
    seenFixtureIds.add(completion.fixtureId);
    seenSourceHashes.set(completion.sourceCompletionSha256, completion.matchId);
    applyMatchToTeamHistory(teamMap, completion);
    applyCompletionToPlayerMap(playerMap, seasonsSeenByPlayer, completion);
  }

  const players = [...playerMap.values()]
    .map(deriveCareerPlayer)
    .sort((a, b) => a.playerId.localeCompare(b.playerId));

  return PersistentCareerProjectionCoreSchema.parse({
    careerProjectionVersion: PERSISTENT_CAREER_PROJECTION_VERSION,
    worldId: input.worldId,
    completedSeasonCount: completedSeasons.length,
    activeSeasonNumber: expectedActiveSeasonNumber,
    activeSeasonMatchesApplied: activeCompletions.length,
    totalMatchesApplied: seenMatchIds.size,
    rollOfHonour,
    teamHistory: sortedTeams.map((teamId) => teamMap.get(teamId)!),
    players,
    leaders: computeCareerLeaders(players),
  });
}

export function applyCompletionToPersistentCareerProjectionCore(input: {
  previous: unknown;
  completion: unknown;
  alreadySeenSeasonForPlayers: ReadonlySet<string>;
}): PersistentCareerProjectionCore {
  const previous = PersistentCareerProjectionCoreSchema.parse(input.previous);
  const completion = T20SeasonMatchCompletionSchema.parse(input.completion);
  const teamMap = new Map<string, PersistentCareerTeamHistoryRow>(
    previous.teamHistory.map((row) => [row.teamId, { ...row }]),
  );
  const playerMap = new Map<string, MutableCareerPlayerStats>(
    previous.players.map((p) => [p.playerId, stripDerivedPlayer(p)]),
  );
  const seasonsSeenByPlayer = new Map<string, Set<string>>();
  for (const p of previous.players) {
    const set = new Set<string>();
    if (input.alreadySeenSeasonForPlayers.has(p.playerId)) {
      set.add(completion.seasonId);
    }
    seasonsSeenByPlayer.set(p.playerId, set);
  }
  applyMatchToTeamHistory(teamMap, completion);
  applyCompletionToPlayerMap(playerMap, seasonsSeenByPlayer, completion);
  const players = [...playerMap.values()]
    .map(deriveCareerPlayer)
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
  return PersistentCareerProjectionCoreSchema.parse({
    ...previous,
    activeSeasonMatchesApplied: previous.activeSeasonMatchesApplied + 1,
    totalMatchesApplied: previous.totalMatchesApplied + 1,
    teamHistory: previous.teamHistory.map((row) => teamMap.get(row.teamId)!),
    players,
    leaders: computeCareerLeaders(players),
  });
}
