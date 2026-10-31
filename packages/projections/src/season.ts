import {
  OffscreenFixtureOutcomeSchema,
  RosterOffscreenFixtureOutcomeSchema, RosterSeasonScheduleSchema, RosterSeasonMatchCompletionSchema, RosterSeasonProjectionSchema,
  type RosterSeasonProjection, type RosterSeasonMatchCompletion,
  SeasonScheduleSchema,
  T20LeagueCompetitionManifestSchema,
  T20SeasonMatchCompletionSchema,
  T20SeasonProjectionStateSchema,
  type AppliedSeasonMatch,
  type OffscreenFixtureOutcome,
  type SeasonPlayerStats,
  type SeasonSchedule,
  type SeasonTeamTableRow,
  type T20LeagueCompetitionManifest,
  type T20SeasonMatchCompletion,
  type T20SeasonProjectionState,
} from "@lcxxvi/contracts";

function assertProjection(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`LC_T20_SEASON_PROJECTION_${code}`);
}

function safeNumber(value: bigint, code: string): number {
  assertProjection(value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER), code);
  return Number(value);
}

function roundPositiveRatio(numerator: bigint, denominator: bigint): number {
  assertProjection(denominator > 0n && numerator >= 0n, "INVALID_POSITIVE_RATIO");
  return safeNumber((numerator * 2n + denominator) / (denominator * 2n), "RATIO_OVERFLOW");
}

function roundSignedRatio(numerator: bigint, denominator: bigint): number {
  assertProjection(denominator > 0n, "INVALID_SIGNED_RATIO");
  if (numerator === 0n) return 0;
  const sign = numerator < 0n ? -1n : 1n;
  const abs = numerator < 0n ? -numerator : numerator;
  return safeNumber(sign * ((abs * 2n + denominator) / (denominator * 2n)), "SIGNED_RATIO_OVERFLOW");
}

function nrrFraction(row: Pick<SeasonTeamTableRow, "nrrNumerator" | "nrrDenominator">): readonly [bigint, bigint] {
  return row.nrrDenominator === null
    ? [0n, 1n]
    : [BigInt(row.nrrNumerator), BigInt(row.nrrDenominator)];
}

function compareNrr(a: SeasonTeamTableRow, b: SeasonTeamTableRow): number {
  const [an, ad] = nrrFraction(a), [bn, bd] = nrrFraction(b);
  const left = an * bd, right = bn * ad;
  return left === right ? 0 : left > right ? -1 : 1;
}

function equalNrr(a: SeasonTeamTableRow, b: SeasonTeamTableRow): boolean {
  const [an, ad] = nrrFraction(a), [bn, bd] = nrrFraction(b);
  return an * bd === bn * ad;
}

function recomputeTable(
  competition: Pick<T20LeagueCompetitionManifest, "teamIds" | "points">,
  appliedMatches: readonly AppliedSeasonMatch[],
): SeasonTeamTableRow[] {
  const rows = new Map<string, SeasonTeamTableRow>();
  for (const teamId of competition.teamIds) {
    rows.set(teamId, {
      rank: 1,
      teamId,
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
      nrrNumerator: 0,
      nrrDenominator: null,
      nrrX1000: null,
      headToHeadPoints: 0,
    });
  }
  for (const match of appliedMatches) {
    const home = rows.get(match.homeTeamId), away = rows.get(match.awayTeamId);
    assertProjection(home && away, `UNKNOWN_TABLE_TEAM:${match.fixtureId}`);
    home.played += 1;
    away.played += 1;
    home.points += match.homePoints;
    away.points += match.awayPoints;
    if (match.resultKind === "WIN") {
      if (match.winnerTeamId === match.homeTeamId) {
        home.wins += 1; away.losses += 1;
      } else {
        assertProjection(match.winnerTeamId === match.awayTeamId, `INVALID_WINNER:${match.fixtureId}`);
        away.wins += 1; home.losses += 1;
      }
    } else if (match.resultKind === "TIE") {
      home.ties += 1; away.ties += 1;
    } else {
      home.noResults += 1; away.noResults += 1;
    }
    if (match.nrrEligible) {
      home.runsFor += match.homeRuns;
      home.ballsFor += match.homeBalls;
      home.runsAgainst += match.awayRuns;
      home.ballsAgainst += match.awayBalls;
      away.runsFor += match.awayRuns;
      away.ballsFor += match.awayBalls;
      away.runsAgainst += match.homeRuns;
      away.ballsAgainst += match.homeBalls;
    }
  }
  for (const row of rows.values()) {
    if (row.ballsFor > 0 && row.ballsAgainst > 0) {
      const numerator = 6n * (
        BigInt(row.runsFor) * BigInt(row.ballsAgainst) -
        BigInt(row.runsAgainst) * BigInt(row.ballsFor)
      );
      const denominator = BigInt(row.ballsFor) * BigInt(row.ballsAgainst);
      row.nrrNumerator = safeNumber(numerator, `NRR_NUMERATOR_OVERFLOW:${row.teamId}`);
      row.nrrDenominator = safeNumber(denominator, `NRR_DENOMINATOR_OVERFLOW:${row.teamId}`);
      row.nrrX1000 = roundSignedRatio(numerator * 1000n, denominator);
    }
  }
  const base = [...rows.values()].sort((a, b) =>
    b.points - a.points || b.wins - a.wins || compareNrr(a, b) || a.teamId.localeCompare(b.teamId));
  const ranked: SeasonTeamTableRow[] = [];
  for (let start = 0; start < base.length;) {
    let end = start + 1;
    while (end < base.length && base[end]!.points === base[start]!.points &&
      base[end]!.wins === base[start]!.wins && equalNrr(base[end]!, base[start]!)) end += 1;
    const group = base.slice(start, end);
    const groupIds = new Set(group.map((row) => row.teamId));
    const h2h = new Map(group.map((row) => [row.teamId, 0]));
    if (group.length > 1) {
      for (const match of appliedMatches) {
        if (groupIds.has(match.homeTeamId) && groupIds.has(match.awayTeamId)) {
          h2h.set(match.homeTeamId, h2h.get(match.homeTeamId)! + match.homePoints);
          h2h.set(match.awayTeamId, h2h.get(match.awayTeamId)! + match.awayPoints);
        }
      }
    }
    for (const row of group) row.headToHeadPoints = h2h.get(row.teamId) ?? 0;
    group.sort((a, b) => b.headToHeadPoints - a.headToHeadPoints || a.teamId.localeCompare(b.teamId));
    ranked.push(...group);
    start = end;
  }
  return ranked.map((row, index) => ({ ...row, rank: index + 1 }));
}

type MutablePlayerStats = Omit<SeasonPlayerStats,
  "battingAverageX100" | "strikeRateX100" | "bowlingAverageX100" | "economyX100" | "bowlingStrikeRateX100">;

function rawPlayer(stat: SeasonPlayerStats): MutablePlayerStats {
  const { battingAverageX100, strikeRateX100, bowlingAverageX100, economyX100, bowlingStrikeRateX100, ...raw } = stat;
  void battingAverageX100; void strikeRateX100; void bowlingAverageX100; void economyX100; void bowlingStrikeRateX100;
  return { ...raw };
}

function derivePlayer(raw: MutablePlayerStats): SeasonPlayerStats {
  return {
    ...raw,
    battingAverageX100: raw.dismissals === 0 ? null : roundPositiveRatio(BigInt(raw.runs) * 100n, BigInt(raw.dismissals)),
    strikeRateX100: raw.ballsFaced === 0 ? null : roundPositiveRatio(BigInt(raw.runs) * 10000n, BigInt(raw.ballsFaced)),
    bowlingAverageX100: raw.bowlingWickets === 0 ? null : roundPositiveRatio(BigInt(raw.bowlingRunsConceded) * 100n, BigInt(raw.bowlingWickets)),
    economyX100: raw.bowlingLegalBalls === 0 ? null : roundPositiveRatio(BigInt(raw.bowlingRunsConceded) * 600n, BigInt(raw.bowlingLegalBalls)),
    bowlingStrikeRateX100: raw.bowlingWickets === 0 ? null : roundPositiveRatio(BigInt(raw.bowlingLegalBalls) * 100n, BigInt(raw.bowlingWickets)),
  };
}

function updatePlayers(previous: readonly SeasonPlayerStats[], completion: T20SeasonMatchCompletion): SeasonPlayerStats[] {
  const players = new Map(previous.map((stat) => [stat.playerId, rawPlayer(stat)]));
  const selected = new Map<string, string>();
  for (const team of completion.selectedTeams) {
    for (const playerId of team.playerIds) {
      assertProjection(!selected.has(playerId), `PLAYER_SELECTED_TWICE:${playerId}`);
      selected.set(playerId, team.teamId);
      const existing = players.get(playerId);
      if (existing) assertProjection(existing.teamId === team.teamId, `PLAYER_TEAM_CHANGED:${playerId}`);
      else players.set(playerId, {
        playerId, teamId: team.teamId, matches: 0, runs: 0, dismissals: 0, ballsFaced: 0, fours: 0, sixes: 0,
        bowlingRunsConceded: 0, bowlingLegalBalls: 0, bowlingWickets: 0, maidens: 0,
      });
    }
  }
  for (const team of completion.selectedTeams) {
    for (const playerId of team.playerIds) players.get(playerId)!.matches += 1;
  }
  for (const innings of completion.scorecard.innings) {
    for (const [playerId, line] of Object.entries(innings.batting)) {
      assertProjection(selected.get(playerId) === innings.battingTeamId, `BATTING_PLAYER_NOT_SELECTED:${playerId}`);
      const stat = players.get(playerId)!;
      stat.runs += line.runs;
      stat.dismissals += line.dismissed ? 1 : 0;
      stat.ballsFaced += line.ballsFaced;
      stat.fours += line.fours;
      stat.sixes += line.sixes;
    }
    for (const [playerId, line] of Object.entries(innings.bowling)) {
      assertProjection(selected.get(playerId) === innings.bowlingTeamId, `BOWLING_PLAYER_NOT_SELECTED:${playerId}`);
      const stat = players.get(playerId)!;
      stat.bowlingRunsConceded += line.runsConceded;
      stat.bowlingLegalBalls += line.legalBalls;
      stat.bowlingWickets += line.wickets;
      stat.maidens += line.maidens;
    }
  }
  return [...players.values()].map(derivePlayer).sort((a, b) => a.playerId.localeCompare(b.playerId));
}

function leaders(players: readonly SeasonPlayerStats[]) {
  const list = (field: "runs" | "bowlingWickets") => players
    .filter((player) => player[field] > 0)
    .sort((a, b) => b[field] - a[field] || a.playerId.localeCompare(b.playerId))
    .slice(0, 10)
    .map((player) => ({ playerId: player.playerId, teamId: player.teamId, value: player[field] }));
  return { runs: list("runs"), wickets: list("bowlingWickets") };
}

function cursor(applied: readonly AppliedSeasonMatch[]) {
  if (applied.length === 0) return { appliedCount: 0, highestAppliedFixtureOrdinal: null, missingFixtureOrdinals: [] };
  const ordinals = new Set(applied.map((match) => match.fixtureOrdinal));
  const highest = Math.max(...ordinals);
  const missing: number[] = [];
  for (let ordinal = 0; ordinal <= highest; ordinal += 1) if (!ordinals.has(ordinal)) missing.push(ordinal);
  return { appliedCount: applied.length, highestAppliedFixtureOrdinal: highest, missingFixtureOrdinals: missing };
}

function validateCompetitionSchedule(competitionRaw: unknown, scheduleRaw: unknown) {
  const competition = T20LeagueCompetitionManifestSchema.parse(competitionRaw);
  const schedule = SeasonScheduleSchema.parse(scheduleRaw);
  assertProjection(schedule.competitionId === competition.competitionId, "COMPETITION_ID_MISMATCH");
  assertProjection(JSON.stringify(schedule.teamIds) === JSON.stringify(competition.teamIds), "COMPETITION_TEAMS_MISMATCH");
  return { competition, schedule };
}

export function completionFromOffscreenOutcome(
  scheduleRaw: unknown,
  outcomeRaw: unknown,
): T20SeasonMatchCompletion {
  const schedule = SeasonScheduleSchema.parse(scheduleRaw);
  const outcome = OffscreenFixtureOutcomeSchema.parse(outcomeRaw) as OffscreenFixtureOutcome;
  const fixture = schedule.fixtures.find((entry) => entry.fixtureId === outcome.fixtureId);
  assertProjection(Boolean(fixture), `UNKNOWN_FIXTURE:${outcome.fixtureId}`);
  assertProjection(fixture!.matchId === outcome.matchId, "OUTCOME_MATCH_ID_MISMATCH");
  return T20SeasonMatchCompletionSchema.parse({
    completionVersion: "LC_T20_SEASON_MATCH_COMPLETION_V1",
    seasonId: schedule.seasonId,
    scheduleSha256: schedule.scheduleSha256,
    fixtureId: outcome.fixtureId,
    matchId: outcome.matchId,
    fixtureOrdinal: fixture!.ordinal,
    roundNumber: outcome.roundNumber,
    matchDayDate: outcome.matchDayDate,
    homeTeamId: outcome.homeTeamId,
    awayTeamId: outcome.awayTeamId,
    source: "OFFSCREEN",
    sourceCompletionSha256: outcome.outcomeSha256,
    selectedTeams: outcome.selectedTeams,
    scorecard: outcome.scorecard,
    scorecardSha256: outcome.scorecardSha256,
  });
}

function validateCompletionBinding(schedule: SeasonSchedule, completion: T20SeasonMatchCompletion): void {
  assertProjection(completion.seasonId === schedule.seasonId, "COMPLETION_SEASON_MISMATCH");
  assertProjection(completion.scheduleSha256 === schedule.scheduleSha256, "COMPLETION_SCHEDULE_MISMATCH");
  const fixture = schedule.fixtures.find((entry) => entry.fixtureId === completion.fixtureId);
  assertProjection(Boolean(fixture), `UNKNOWN_FIXTURE:${completion.fixtureId}`);
  assertProjection(fixture!.matchId === completion.matchId, "COMPLETION_MATCH_ID_MISMATCH");
  assertProjection(fixture!.ordinal === completion.fixtureOrdinal, "COMPLETION_ORDINAL_MISMATCH");
  assertProjection(fixture!.roundNumber === completion.roundNumber, "COMPLETION_ROUND_MISMATCH");
  assertProjection(fixture!.matchDayDate === completion.matchDayDate, "COMPLETION_DATE_MISMATCH");
  assertProjection(fixture!.homeTeamId === completion.homeTeamId && fixture!.awayTeamId === completion.awayTeamId, "COMPLETION_TEAM_MISMATCH");
  assertProjection(completion.scorecard.matchId === completion.matchId, "COMPLETION_SCORECARD_MATCH_ID");
  assertProjection(completion.selectedTeams[0].teamId === completion.homeTeamId && completion.selectedTeams[1].teamId === completion.awayTeamId, "COMPLETION_SELECTION_ORDER");
  const inningsTeams = new Set(completion.scorecard.innings.map((innings) => innings.battingTeamId));
  assertProjection(inningsTeams.size === 2 && inningsTeams.has(completion.homeTeamId) && inningsTeams.has(completion.awayTeamId), "COMPLETION_INNINGS_TEAMS");
  assertProjection(completion.scorecard.result.kind !== "DRAW", "T20_DRAW_UNSUPPORTED");
  if (completion.scorecard.result.kind === "WIN") {
    assertProjection([completion.homeTeamId, completion.awayTeamId].includes(completion.scorecard.result.winnerTeamId), "COMPLETION_WINNER");
  }
}

function appliedMatch(
  competition: Pick<T20LeagueCompetitionManifest, "points">,
  completion: T20SeasonMatchCompletion,
): AppliedSeasonMatch {
  const home = completion.scorecard.innings.find((innings) => innings.battingTeamId === completion.homeTeamId)!;
  const away = completion.scorecard.innings.find((innings) => innings.battingTeamId === completion.awayTeamId)!;
  const result = completion.scorecard.result;
  let homePoints = 0, awayPoints = 0;
  if (result.kind === "WIN") {
    if (result.winnerTeamId === completion.homeTeamId) homePoints = competition.points.win;
    else awayPoints = competition.points.win;
  } else if (result.kind === "TIE") {
    homePoints = competition.points.tie; awayPoints = competition.points.tie;
  } else if (result.kind === "NO_RESULT") {
    homePoints = competition.points.noResult; awayPoints = competition.points.noResult;
  } else assertProjection(false, "T20_DRAW_UNSUPPORTED");
  return {
    fixtureId: completion.fixtureId,
    matchId: completion.matchId,
    fixtureOrdinal: completion.fixtureOrdinal,
    roundNumber: completion.roundNumber,
    homeTeamId: completion.homeTeamId,
    awayTeamId: completion.awayTeamId,
    sourceCompletionSha256: completion.sourceCompletionSha256,
    resultKind: result.kind,
    winnerTeamId: result.winnerTeamId,
    homePoints,
    awayPoints,
    nrrEligible: result.kind !== "NO_RESULT",
    homeRuns: home.runs,
    homeBalls: home.wickets === 10 ? 120 : home.legalBalls,
    awayRuns: away.runs,
    awayBalls: away.wickets === 10 ? 120 : away.legalBalls,
  };
}

export function createT20SeasonProjection(input: {
  competition: unknown;
  schedule: unknown;
}): T20SeasonProjectionState {
  const { competition, schedule } = validateCompetitionSchedule(input.competition, input.schedule);
  return T20SeasonProjectionStateSchema.parse({
    projectionVersion: "LC_T20_SEASON_PROJECTION_V1",
    seasonId: schedule.seasonId,
    scheduleSha256: schedule.scheduleSha256,
    competitionId: competition.competitionId,
    revision: 0,
    cursor: { appliedCount: 0, highestAppliedFixtureOrdinal: null, missingFixtureOrdinals: [] },
    appliedMatches: [],
    table: recomputeTable(competition, []),
    players: [],
    leaders: { runs: [], wickets: [] },
  });
}

export function applyT20SeasonMatchCompletion(input: {
  state: unknown;
  competition: unknown;
  schedule: unknown;
  completion: unknown;
}): T20SeasonProjectionState {
  const state = T20SeasonProjectionStateSchema.parse(input.state);
  const { competition, schedule } = validateCompetitionSchedule(input.competition, input.schedule);
  const completion = T20SeasonMatchCompletionSchema.parse(input.completion);
  assertProjection(state.seasonId === schedule.seasonId && state.scheduleSha256 === schedule.scheduleSha256, "STATE_SCHEDULE_MISMATCH");
  assertProjection(state.competitionId === competition.competitionId, "STATE_COMPETITION_MISMATCH");
  validateCompletionBinding(schedule, completion);
  const previous = state.appliedMatches.find((match) => match.matchId === completion.matchId || match.fixtureId === completion.fixtureId);
  if (previous) {
    assertProjection(previous.matchId === completion.matchId && previous.fixtureId === completion.fixtureId &&
      previous.sourceCompletionSha256 === completion.sourceCompletionSha256, `CONFLICTING_COMPLETION:${completion.fixtureId}`);
    return state;
  }
  assertProjection(!state.appliedMatches.some((match) => match.sourceCompletionSha256 === completion.sourceCompletionSha256), "SOURCE_COMPLETION_REUSED");
  const nextApplied = [...state.appliedMatches, appliedMatch(competition, completion)]
    .sort((a, b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId));
  const players = updatePlayers(state.players, completion);
  return T20SeasonProjectionStateSchema.parse({
    ...state,
    revision: state.revision + 1,
    cursor: cursor(nextApplied),
    appliedMatches: nextApplied,
    table: recomputeTable(competition, nextApplied),
    players,
    leaders: leaders(players),
  });
}

export function validateT20SeasonProjection(input: {
  state: unknown;
  competition: unknown;
  schedule: unknown;
}): T20SeasonProjectionState {
  const state = T20SeasonProjectionStateSchema.parse(input.state);
  const { competition, schedule } = validateCompetitionSchedule(input.competition, input.schedule);
  assertProjection(state.seasonId === schedule.seasonId && state.scheduleSha256 === schedule.scheduleSha256, "STATE_SCHEDULE_MISMATCH");
  assertProjection(state.competitionId === competition.competitionId, "STATE_COMPETITION_MISMATCH");
  assertProjection(state.revision === state.appliedMatches.length, "STATE_REVISION_MISMATCH");
  assertProjection(JSON.stringify(state.cursor) === JSON.stringify(cursor(state.appliedMatches)), "STATE_CURSOR_MISMATCH");
  assertProjection(JSON.stringify(state.table) === JSON.stringify(recomputeTable(competition, state.appliedMatches)), "STATE_TABLE_MISMATCH");
  for (const player of state.players) {
    const expected = derivePlayer(rawPlayer(player));
    for (const key of [
      "battingAverageX100", "strikeRateX100", "bowlingAverageX100", "economyX100", "bowlingStrikeRateX100",
    ] as const) {
      assertProjection(player[key] === expected[key], `PLAYER_DERIVED_MISMATCH:${player.playerId}:${key}`);
    }
  }
  assertProjection(JSON.stringify(state.leaders) === JSON.stringify(leaders(state.players)), "STATE_LEADERS_MISMATCH");
  return state;
}

export function rosterCompletionFromOffscreen(scheduleRaw: unknown, outcomeRaw: unknown): RosterSeasonMatchCompletion {
  const schedule = RosterSeasonScheduleSchema.parse(scheduleRaw);
  const outcome = RosterOffscreenFixtureOutcomeSchema.parse(outcomeRaw);
  const fixture = schedule.fixtures.find(entry => entry.fixtureId === outcome.fixtureId);
  assertProjection(fixture && fixture.matchId === outcome.matchId && outcome.scheduleSha256 === schedule.scheduleSha256, "ROSTER_OUTCOME_FIXTURE_MISMATCH");
  return RosterSeasonMatchCompletionSchema.parse({ completionVersion: "LC_T20_ROSTER_SEASON_COMPLETION_V2", seasonId: schedule.request.seasonId,
    scheduleSha256: schedule.scheduleSha256, fixtureId: outcome.fixtureId, matchId: outcome.matchId, fixtureOrdinal: fixture.ordinal,
    roundNumber: outcome.roundNumber, matchDayDate: outcome.matchDayDate, homeTeamId: outcome.homeTeamId, awayTeamId: outcome.awayTeamId,
    source: "OFFSCREEN", sourceCompletionSha256: outcome.outcomeSha256, selectedTeams: outcome.selectedTeams,
    scorecard: outcome.scorecard, scorecardSha256: outcome.scorecardSha256 });
}
export function createRosterSeasonProjection(scheduleRaw: unknown): RosterSeasonProjection {
  const schedule = RosterSeasonScheduleSchema.parse(scheduleRaw);
  const competition = { teamIds: schedule.teamIds, points: { win: 2 as const, tie: 1 as const, noResult: 1 as const, loss: 0 as const } };
  return RosterSeasonProjectionSchema.parse({ projectionVersion: "LC_T20_ROSTER_SEASON_PROJECTION_V2", seasonId: schedule.request.seasonId,
    scheduleSha256: schedule.scheduleSha256, competitionId: "LC_T20_LEAGUE_01", revision: 0,
    cursor: cursor([]), appliedMatches: [], table: recomputeTable(competition, []), players: [], leaders: { runs: [], wickets: [] } });
}
export function validateRosterSeasonProjection(stateRaw: unknown, scheduleRaw: unknown): RosterSeasonProjection {
  const state = RosterSeasonProjectionSchema.parse(stateRaw);
  const schedule = RosterSeasonScheduleSchema.parse(scheduleRaw);
  const competition = { teamIds: schedule.teamIds, points: { win: 2 as const, tie: 1 as const, noResult: 1 as const, loss: 0 as const } };
  assertProjection(state.seasonId === schedule.request.seasonId && state.scheduleSha256 === schedule.scheduleSha256 &&
    state.revision === state.appliedMatches.length && JSON.stringify(state.cursor) === JSON.stringify(cursor(state.appliedMatches)) &&
    JSON.stringify(state.table) === JSON.stringify(recomputeTable(competition, state.appliedMatches)), "ROSTER_PROJECTION_STATE_MISMATCH");
  assertProjection(new Set(state.appliedMatches.map(match => match.fixtureId)).size === state.appliedMatches.length &&
    state.appliedMatches.every(match => { const fixture = schedule.fixtures.find(item => item.fixtureId === match.fixtureId); return fixture && fixture.matchId === match.matchId && fixture.ordinal === match.fixtureOrdinal && fixture.homeTeamId === match.homeTeamId && fixture.awayTeamId === match.awayTeamId; }), "ROSTER_PROJECTION_FIXTURE_MISMATCH");
  for (const player of state.players) {
    const expected = derivePlayer(rawPlayer(player));
    for (const key of ["battingAverageX100", "strikeRateX100", "bowlingAverageX100", "economyX100", "bowlingStrikeRateX100"] as const)
      assertProjection(player[key] === expected[key], `ROSTER_PLAYER_DERIVED_MISMATCH:${player.playerId}:${key}`);
  }
  assertProjection(JSON.stringify(state.leaders) === JSON.stringify(leaders(state.players)), "ROSTER_PROJECTION_LEADERS_MISMATCH");
  return state;
}
export function applyRosterSeasonCompletion(stateRaw: unknown, scheduleRaw: unknown, completionRaw: unknown): RosterSeasonProjection {
  const state = validateRosterSeasonProjection(stateRaw, scheduleRaw);
  const schedule = RosterSeasonScheduleSchema.parse(scheduleRaw);
  const completion = RosterSeasonMatchCompletionSchema.parse(completionRaw);
  assertProjection(state.seasonId === schedule.request.seasonId && state.scheduleSha256 === schedule.scheduleSha256, "ROSTER_STATE_SCHEDULE_MISMATCH");
  const fixture = schedule.fixtures.find(entry => entry.fixtureId === completion.fixtureId);
  assertProjection(fixture && completion.seasonId === schedule.request.seasonId && completion.scheduleSha256 === schedule.scheduleSha256 &&
    fixture.matchId === completion.matchId && fixture.ordinal === completion.fixtureOrdinal && fixture.roundNumber === completion.roundNumber &&
    fixture.matchDayDate === completion.matchDayDate && fixture.homeTeamId === completion.homeTeamId && fixture.awayTeamId === completion.awayTeamId,
    "ROSTER_COMPLETION_FIXTURE_MISMATCH");
  const baseline = T20SeasonMatchCompletionSchema.parse({ ...completion, completionVersion: "LC_T20_SEASON_MATCH_COMPLETION_V1" });
  const inningsTeams = new Set(baseline.scorecard.innings.map(innings => innings.battingTeamId));
  assertProjection(baseline.scorecard.matchId === baseline.matchId && baseline.selectedTeams[0].teamId === baseline.homeTeamId &&
    baseline.selectedTeams[1].teamId === baseline.awayTeamId && inningsTeams.size === 2 && inningsTeams.has(baseline.homeTeamId) &&
    inningsTeams.has(baseline.awayTeamId) && baseline.scorecard.result.kind !== "DRAW", "ROSTER_COMPLETION_SCORECARD_MISMATCH");
  if (baseline.scorecard.result.kind === "WIN") assertProjection([baseline.homeTeamId, baseline.awayTeamId].includes(baseline.scorecard.result.winnerTeamId), "ROSTER_COMPLETION_WINNER");
  const previous = state.appliedMatches.find(match => match.matchId === baseline.matchId || match.fixtureId === baseline.fixtureId);
  if (previous) {
    assertProjection(previous.matchId === baseline.matchId && previous.fixtureId === baseline.fixtureId && previous.sourceCompletionSha256 === baseline.sourceCompletionSha256, "ROSTER_COMPLETION_CONFLICT");
    return state;
  }
  assertProjection(!state.appliedMatches.some(match => match.sourceCompletionSha256 === baseline.sourceCompletionSha256), "ROSTER_COMPLETION_SOURCE_REUSED");
  const competition = { teamIds: schedule.teamIds, points: { win: 2 as const, tie: 1 as const, noResult: 1 as const, loss: 0 as const } };
  const appliedMatches = [...state.appliedMatches, appliedMatch(competition, baseline)].sort((a, b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId));
  const players = updatePlayers(state.players, baseline);
  return RosterSeasonProjectionSchema.parse({ ...state, revision: state.revision + 1, cursor: cursor(appliedMatches), appliedMatches,
    table: recomputeTable(competition, appliedMatches), players, leaders: leaders(players) });
}
