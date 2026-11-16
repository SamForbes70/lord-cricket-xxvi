import {
  AWARDS_LEDGER_VERSION,
  AWARDS_MODEL_VERSION,
  AWARDS_PROVENANCE_NOTICE,
  CareerAwardsLedgerSchema,
  MatchAwardRecordSchema,
  SeasonAwardsSummarySchema,
  canonicalJson,
  type AwardFormat,
  type CareerAwardsLedger,
  type CareerMatchAwardLedgerEntry,
  type MatchAwardCandidate,
  type MatchAwardRecord,
  type ODIScorecard,
  type PlayerLifecycleState,
  type Red5Scorecard,
  type SeasonAwardCategory,
  type SeasonAwardEntry,
  type SeasonAwardsSummary,
  type T20Scorecard,
  type T20SeasonMatchCompletion,
} from "@lcxxvi/contracts";
import { pureSha256Hex } from "./audio-cues.js";
import type { AnyCareerMatchEventArchive, AnyPersistentWorldState } from "./historical-stats.js";

export const MATCH_AWARD_FORMULA_SUMMARY =
  "Transparent Game Award: batting (runs, boundaries, milestones, not-out, format-par strike rate) + bowling (24 pts/wkt, 3w/5w hauls, maidens, format-par economy) + attributable fielding (catches 7, stumpings 9, run-outs 11) + modest winning-team bonus (5 pts; standout losing performances can still win)." as const;

export const SEASON_AWARD_FORMULA_SUMMARY =
  "Transparent Game Award: Player of the Season combines match-award impact points with Player of the Match bonuses (+15 pts each); Golden Bat, Golden Ball, Best Fielder, and Emerging Youth follow explicit qualification and tie-break rules." as const;

export type AnyMatchScorecard = T20Scorecard | ODIScorecard | Red5Scorecard;

export type AwardFieldingCounts = {
  catches: number;
  stumpings: number;
  runOuts: number;
};

export type AwardMatchEventLike = {
  readonly type: string;
  readonly payload?: unknown;
};

type PlayerMatchAccumulator = {
  playerId: string;
  teamId: string;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  batted: boolean;
  notOutWithRuns: boolean;
  wickets: number;
  runsConceded: number;
  legalBalls: number;
  maidens: number;
  bowled: boolean;
  catches: number;
  stumpings: number;
  runOuts: number;
};

const PAR_SR_X100: Record<AwardFormat, number> = {
  T20: 13000,
  ODI: 9200,
  RED_BALL: 5500,
};

const PAR_ECONOMY_X100: Record<AwardFormat, number> = {
  T20: 750,
  ODI: 520,
  RED_BALL: 320,
};

const MIN_ECON_BALLS: Record<AwardFormat, number> = {
  T20: 12,
  ODI: 24,
  RED_BALL: 30,
};

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function extractAttributableFieldingFromEvents(
  events: readonly AwardMatchEventLike[] | undefined,
  participantTeamByPlayerId: Readonly<Record<string, string>>,
): {
  byPlayer: Map<string, { teamId: string; catches: number; stumpings: number; runOuts: number }>;
  evaluated: boolean;
} {
  if (!events) {
    return { byPlayer: new Map(), evaluated: false };
  }
  const byPlayer = new Map<
    string,
    { teamId: string; catches: number; stumpings: number; runOuts: number }
  >();
  for (const envelope of events) {
    if (envelope.type !== "DELIVERY_RECORDED") continue;
    const payload = envelope.payload as
      | {
          event?: {
            bowlingTeamId?: string;
            dismissal?: {
              kind?: "BOWLED" | "LBW" | "CAUGHT" | "RUN_OUT" | "STUMPED" | "HIT_WICKET";
              fielderId?: string | null;
            } | null;
          };
        }
      | undefined;
    const ev = payload?.event;
    const dismissal = ev?.dismissal;
    if (!dismissal || !dismissal.fielderId) continue;
    const fid = dismissal.fielderId;
    const teamId = participantTeamByPlayerId[fid] ?? ev?.bowlingTeamId ?? "unknown";
    const cur = byPlayer.get(fid) ?? { teamId, catches: 0, stumpings: 0, runOuts: 0 };
    if (dismissal.kind === "CAUGHT") cur.catches += 1;
    else if (dismissal.kind === "STUMPED") cur.stumpings += 1;
    else if (dismissal.kind === "RUN_OUT") cur.runOuts += 1;
    byPlayer.set(fid, cur);
  }
  return { byPlayer, evaluated: true };
}

function computeBattingPointsX100(p: PlayerMatchAccumulator, format: AwardFormat): number {
  if (!p.batted) return 0;
  let pts = p.runs * 100;
  if (p.runs >= 150) pts += 5000;
  else if (p.runs >= 100) pts += 3500;
  else if (p.runs >= 50) pts += 1500;
  else if (p.runs >= 30) pts += 500;
  if (p.notOutWithRuns && p.runs >= 20) pts += 400;
  pts += p.sixes * 150 + p.fours * 50;
  if (p.ballsFaced >= 10 && p.runs >= 15) {
    const srX100 = Math.round((p.runs * 10000) / p.ballsFaced);
    const par = PAR_SR_X100[format];
    pts += clampInt(((srX100 - par) * Math.min(40, p.ballsFaced)) / 250, -600, 1400);
  }
  return pts;
}

function computeBowlingPointsX100(p: PlayerMatchAccumulator, format: AwardFormat): number {
  if (!p.bowled) return 0;
  let pts = p.wickets * 2400;
  if (p.wickets >= 5) pts += 3000;
  else if (p.wickets >= 3) pts += 1200;
  pts += p.maidens * 500;
  if (p.legalBalls >= MIN_ECON_BALLS[format]) {
    const econX100 = Math.round((p.runsConceded * 600) / p.legalBalls);
    const parEcon = PAR_ECONOMY_X100[format];
    const oversWhole = p.legalBalls / 6;
    pts += clampInt(((parEcon - econX100) * Math.min(8, oversWhole)) / 4, -900, 1600);
  }
  return pts;
}

function computeFieldingPointsX100(p: PlayerMatchAccumulator): number {
  return p.catches * 700 + p.stumpings * 900 + p.runOuts * 1100;
}

function formatPlayerSummary(p: PlayerMatchAccumulator): string {
  const parts: string[] = [];
  if (p.batted) {
    parts.push(`${p.runs}${p.notOutWithRuns ? "*" : ""} (${p.ballsFaced})`);
  }
  if (p.bowled) {
    parts.push(
      `${p.wickets}/${p.runsConceded} (${Math.floor(p.legalBalls / 6)}.${p.legalBalls % 6})`,
    );
  }
  const fieldTotal = p.catches + p.stumpings + p.runOuts;
  if (fieldTotal > 0) {
    const fParts: string[] = [];
    if (p.catches > 0) fParts.push(`${p.catches}c`);
    if (p.stumpings > 0) fParts.push(`${p.stumpings}st`);
    if (p.runOuts > 0) fParts.push(`${p.runOuts}ro`);
    parts.push(fParts.join(" "));
  }
  return parts.length > 0 ? parts.join(" · ") : "Selected XI";
}

function computeMatchAwardInternal(input: {
  format: AwardFormat;
  scorecard: AnyMatchScorecard;
  events?: readonly AwardMatchEventLike[];
  archive?: AnyCareerMatchEventArchive | null;
  fixtureId?: string | null;
  seasonNumber?: number | null;
  sourceCompletionSha256?: string | null;
  participantTeamByPlayerId?: Readonly<Record<string, string>>;
  playerNames?: Readonly<Record<string, string>>;
  teamNames?: Readonly<Record<string, string>>;
}): { record: MatchAwardRecord; allCandidates: MatchAwardCandidate[] } {
  const { format, scorecard } = input;
  const fixtureId = input.fixtureId ?? null;
  const seasonNumber = input.seasonNumber ?? null;
  const sourceCompletionSha256 = input.sourceCompletionSha256 ?? null;
  const events = input.events ?? input.archive?.events;
  const participantTeamByPlayerId: Record<string, string> = {
    ...(input.participantTeamByPlayerId ?? {}),
  };

  const byPlayer = new Map<string, PlayerMatchAccumulator>();
  const ensurePlayer = (playerId: string, teamId: string): PlayerMatchAccumulator => {
    let acc = byPlayer.get(playerId);
    if (!acc) {
      acc = {
        playerId,
        teamId,
        runs: 0,
        ballsFaced: 0,
        fours: 0,
        sixes: 0,
        batted: false,
        notOutWithRuns: false,
        wickets: 0,
        runsConceded: 0,
        legalBalls: 0,
        maidens: 0,
        bowled: false,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
      };
      byPlayer.set(playerId, acc);
    }
    participantTeamByPlayerId[playerId] = acc.teamId;
    return acc;
  };

  for (const innings of scorecard.innings) {
    for (const [playerId, line] of Object.entries(innings.batting)) {
      const acc = ensurePlayer(playerId, innings.battingTeamId);
      const batted = line.ballsFaced > 0 || line.dismissed || line.runs > 0;
      if (batted) {
        acc.batted = true;
        acc.runs += line.runs;
        acc.ballsFaced += line.ballsFaced;
        acc.fours += line.fours;
        acc.sixes += line.sixes;
        if (!line.dismissed && line.runs > 0) {
          acc.notOutWithRuns = true;
        }
      }
    }
    for (const [playerId, bowl] of Object.entries(innings.bowling)) {
      const acc = ensurePlayer(playerId, innings.bowlingTeamId);
      if (bowl.legalBalls > 0 || bowl.runsConceded > 0 || bowl.wickets > 0) {
        acc.bowled = true;
        acc.wickets += bowl.wickets;
        acc.runsConceded += bowl.runsConceded;
        acc.legalBalls += bowl.legalBalls;
        acc.maidens += bowl.maidens;
      }
    }
  }

  const fielding = extractAttributableFieldingFromEvents(events, participantTeamByPlayerId);
  for (const [playerId, counts] of fielding.byPlayer.entries()) {
    const acc = ensurePlayer(playerId, counts.teamId);
    acc.catches += counts.catches;
    acc.stumpings += counts.stumpings;
    acc.runOuts += counts.runOuts;
  }

  const fieldingSourceStatus =
    fielding.evaluated ? "ARCHIVE_EVENTS" : "SCORECARD_NOT_ATTRIBUTABLE";

  if (scorecard.result.kind === "NO_RESULT" || byPlayer.size === 0) {
    return {
      record: MatchAwardRecordSchema.parse({
      awardVersion: AWARDS_MODEL_VERSION,
      awardCategory: "PLAYER_OF_THE_MATCH",
      awardProvenance: "GAME_AWARD",
      format,
      matchId: scorecard.matchId,
      fixtureId,
      seasonNumber,
      sourceCompletionSha256,
      status: "NO_RESULT_NOT_AWARDED",
      winnerPlayerId: null,
      winnerTeamId: null,
      fromWinningTeam: null,
      fromLosingTeam: false,
      scoreTotalX100: null,
      components: null,
      fieldingSourceStatus,
      explanationText:
        "No Player of the Match awarded because the fixture finished as a no-result without a completed competitive outcome.",
      formulaSummary: MATCH_AWARD_FORMULA_SUMMARY,
      candidates: [],
    }),
      allCandidates: [] as MatchAwardCandidate[],
    };
  }

  const winningTeamId =
    scorecard.result.kind === "WIN" ? scorecard.result.winnerTeamId : null;
  const hasDecisiveWinner = scorecard.result.kind === "WIN" && winningTeamId !== null;

  const scored: MatchAwardCandidate[] = [...byPlayer.values()]
    .map((acc) => {
      const battingPointsX100 = computeBattingPointsX100(acc, format);
      const bowlingPointsX100 = computeBowlingPointsX100(acc, format);
      const fieldingPointsX100 = computeFieldingPointsX100(acc);
      const fromWinningTeam = winningTeamId !== null && acc.teamId === winningTeamId;
      const resultBonusX100 = fromWinningTeam ? 500 : 0;
      const totalPointsX100 =
        battingPointsX100 + bowlingPointsX100 + fieldingPointsX100 + resultBonusX100;
      return {
        playerId: acc.playerId,
        teamId: acc.teamId,
        battingPointsX100,
        bowlingPointsX100,
        fieldingPointsX100,
        resultBonusX100,
        totalPointsX100,
        fromWinningTeam,
        summaryLine: formatPlayerSummary(acc),
      };
    })
    .sort((a, b) => {
      if (b.totalPointsX100 !== a.totalPointsX100) return b.totalPointsX100 - a.totalPointsX100;
      const aRaw = a.battingPointsX100 + a.bowlingPointsX100 + a.fieldingPointsX100;
      const bRaw = b.battingPointsX100 + b.bowlingPointsX100 + b.fieldingPointsX100;
      if (bRaw !== aRaw) return bRaw - aRaw;
      if (a.fromWinningTeam !== b.fromWinningTeam) return a.fromWinningTeam ? -1 : 1;
      return a.playerId.localeCompare(b.playerId);
    });

  const winner = scored[0]!;
  const fromLosingTeam = hasDecisiveWinner && winner.teamId !== winningTeamId;
  const pName = input.playerNames?.[winner.playerId] ?? winner.playerId;
  const tName = input.teamNames?.[winner.teamId] ?? winner.teamId;
  const losingNote = fromLosingTeam
    ? " (standout performance from the losing side)"
    : "";
  const fieldingNote =
    fieldingSourceStatus === "SCORECARD_NOT_ATTRIBUTABLE"
      ? " Attributable fielding points unavailable because delivery event archive was not attached."
      : "";

  const record = MatchAwardRecordSchema.parse({
    awardVersion: AWARDS_MODEL_VERSION,
    awardCategory: "PLAYER_OF_THE_MATCH",
    awardProvenance: "GAME_AWARD",
    format,
    matchId: scorecard.matchId,
    fixtureId,
    seasonNumber,
    sourceCompletionSha256,
    status: "AWARDED",
    winnerPlayerId: winner.playerId,
    winnerTeamId: winner.teamId,
    fromWinningTeam: hasDecisiveWinner ? winner.fromWinningTeam : null,
    fromLosingTeam,
    scoreTotalX100: winner.totalPointsX100,
    components: {
      battingPointsX100: winner.battingPointsX100,
      bowlingPointsX100: winner.bowlingPointsX100,
      fieldingPointsX100: winner.fieldingPointsX100,
      resultBonusX100: winner.resultBonusX100,
    },
    fieldingSourceStatus,
    explanationText: `${pName} (${tName}${losingNote}) awarded Player of the Match with ${(winner.totalPointsX100 / 100).toFixed(2)} pts — ${winner.summaryLine}.${fieldingNote}`,
    formulaSummary: MATCH_AWARD_FORMULA_SUMMARY,
    candidates: scored.slice(0, 5),
  });
  return { record, allCandidates: scored };
}

export function computeMatchAward(input: {
  format: AwardFormat;
  scorecard: AnyMatchScorecard;
  events?: readonly AwardMatchEventLike[];
  archive?: AnyCareerMatchEventArchive | null;
  fixtureId?: string | null;
  seasonNumber?: number | null;
  sourceCompletionSha256?: string | null;
  participantTeamByPlayerId?: Readonly<Record<string, string>>;
  playerNames?: Readonly<Record<string, string>>;
  teamNames?: Readonly<Record<string, string>>;
}): MatchAwardRecord {
  return computeMatchAwardInternal(input).record;
}

export function computeMatchAwardFromCompletion(
  completion: T20SeasonMatchCompletion,
  options: {
    seasonNumber?: number | null;
    archive?: AnyCareerMatchEventArchive | null;
    playerNames?: Readonly<Record<string, string>>;
    teamNames?: Readonly<Record<string, string>>;
  } = {},
): MatchAwardRecord {
  const participantTeamByPlayerId: Record<string, string> = {};
  for (const sel of completion.selectedTeams) {
    for (const pid of sel.playerIds) participantTeamByPlayerId[pid] = sel.teamId;
  }
  return computeMatchAward({
    format: "T20",
    scorecard: completion.scorecard,
    archive: options.archive ?? null,
    fixtureId: completion.fixtureId,
    seasonNumber: options.seasonNumber ?? null,
    sourceCompletionSha256: completion.sourceCompletionSha256,
    participantTeamByPlayerId,
    ...(options.playerNames ? { playerNames: options.playerNames } : {}),
    ...(options.teamNames ? { teamNames: options.teamNames } : {}),
  });
}

type SeasonPlayerAggregate = {
  playerId: string;
  teamId: string;
  matches: number;
  runs: number;
  dismissals: number;
  ballsFaced: number;
  wickets: number;
  bowlingRunsConceded: number;
  bowlingLegalBalls: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  matchImpactTotalX100: number;
  potmWins: number;
};

export function computeSeasonAwards(input: {
  seasonNumber: number;
  calendarYear: number;
  competitionId?: "LC_T20_LEAGUE_01";
  sealedAtSeasonSha256?: string | null;
  completedMatches: readonly T20SeasonMatchCompletion[];
  matchAwards?: readonly MatchAwardRecord[];
  archivesByFixtureId?: ReadonlyMap<string, AnyCareerMatchEventArchive>;
  lifecycle?: PlayerLifecycleState | null;
  /** Extra players whose birth dates are known (base world, free agents); used only for youth eligibility. */
  knownPlayers?: readonly { playerId: string; birthDate: string }[];
  playerNames?: Readonly<Record<string, string>>;
  teamNames?: Readonly<Record<string, string>>;
}): SeasonAwardsSummary {
  const competitionId = input.competitionId ?? "LC_T20_LEAGUE_01";
  const matchAwardByFixture = new Map<string, MatchAwardRecord>();
  for (const a of input.matchAwards ?? []) {
    if (a.fixtureId) matchAwardByFixture.set(a.fixtureId, a);
  }

  const byPlayer = new Map<string, SeasonPlayerAggregate>();
  let evaluatedArchives = 0;

  for (const completion of input.completedMatches) {
    const archive = input.archivesByFixtureId?.get(completion.fixtureId) ?? null;
    if (archive) evaluatedArchives += 1;
    const matchAward =
      matchAwardByFixture.get(completion.fixtureId) ??
      computeMatchAwardFromCompletion(completion, {
        seasonNumber: input.seasonNumber,
        archive,
        ...(input.playerNames ? { playerNames: input.playerNames } : {}),
        ...(input.teamNames ? { teamNames: input.teamNames } : {}),
      });
    const participantTeamByPlayerId: Record<string, string> = {};
    const matchPlayers = new Set<string>();
    for (const sel of completion.selectedTeams) {
      for (const pid of sel.playerIds) {
        participantTeamByPlayerId[pid] = sel.teamId;
        matchPlayers.add(pid);
      }
    }
    const fielding = extractAttributableFieldingFromEvents(
      archive?.events,
      participantTeamByPlayerId,
    );

    const ensure = (playerId: string, teamId: string): SeasonPlayerAggregate => {
      let cur = byPlayer.get(playerId);
      if (!cur) {
        cur = {
          playerId,
          teamId,
          matches: 0,
          runs: 0,
          dismissals: 0,
          ballsFaced: 0,
          wickets: 0,
          bowlingRunsConceded: 0,
          bowlingLegalBalls: 0,
          catches: 0,
          stumpings: 0,
          runOuts: 0,
          matchImpactTotalX100: 0,
          potmWins: 0,
        };
        byPlayer.set(playerId, cur);
      }
      cur.teamId = teamId;
      return cur;
    };

    for (const pid of matchPlayers) {
      const acc = ensure(pid, participantTeamByPlayerId[pid]!);
      acc.matches += 1;
    }
    for (const innings of completion.scorecard.innings) {
      for (const [pid, line] of Object.entries(innings.batting)) {
        const acc = ensure(pid, innings.battingTeamId);
        acc.runs += line.runs;
        acc.ballsFaced += line.ballsFaced;
        if (line.dismissed) acc.dismissals += 1;
      }
      for (const [pid, bowl] of Object.entries(innings.bowling)) {
        const acc = ensure(pid, innings.bowlingTeamId);
        acc.wickets += bowl.wickets;
        acc.bowlingRunsConceded += bowl.runsConceded;
        acc.bowlingLegalBalls += bowl.legalBalls;
      }
    }
    for (const [pid, f] of fielding.byPlayer.entries()) {
      const acc = ensure(pid, f.teamId);
      acc.catches += f.catches;
      acc.stumpings += f.stumpings;
      acc.runOuts += f.runOuts;
    }

    const fullMatch = computeMatchAwardInternal({
      format: "T20",
      scorecard: completion.scorecard,
      archive,
      fixtureId: completion.fixtureId,
      seasonNumber: input.seasonNumber,
      sourceCompletionSha256: completion.sourceCompletionSha256,
      participantTeamByPlayerId,
      ...(input.playerNames ? { playerNames: input.playerNames } : {}),
      ...(input.teamNames ? { teamNames: input.teamNames } : {}),
    });
    const effectiveRecord =
      matchAward.status === "AWARDED" ? matchAward : fullMatch.record;
    if (effectiveRecord.status === "AWARDED" && effectiveRecord.winnerPlayerId) {
      const w = byPlayer.get(effectiveRecord.winnerPlayerId);
      if (w) w.potmWins += 1;
    }
    for (const cand of fullMatch.allCandidates) {
      const acc = byPlayer.get(cand.playerId);
      if (acc) {
        acc.matchImpactTotalX100 += cand.totalPointsX100;
      }
    }
  }

  const players = [...byPlayer.values()];
  const minMatchesMvp = input.completedMatches.length >= 28 ? 5 : 1;
  const minMatchesYouth = input.completedMatches.length >= 28 ? 4 : 1;
  const minFieldingDismissals = input.completedMatches.length >= 28 ? 3 : 1;

  const pName = (id: string) => input.playerNames?.[id] ?? id;
  const tName = (id: string) => input.teamNames?.[id] ?? id;

  const buildEntry = (
    category: SeasonAwardCategory,
    label: string,
    qualificationRule: string,
    formulaSummary: string,
    ranked: Array<{
      playerId: string;
      teamId: string;
      primaryX100: number;
      secondaryX100: number;
      tertiaryX100: number;
      headlineStat: string;
    }>,
    unavailableReasonIfEmpty: string,
  ): SeasonAwardEntry => {
    if (ranked.length === 0) {
      return {
        awardVersion: AWARDS_MODEL_VERSION,
        category,
        label,
        awardProvenance: "GAME_AWARD",
        status: "UNAVAILABLE",
        unavailableReason: unavailableReasonIfEmpty,
        qualificationRule,
        formulaSummary,
        winnerPlayerId: null,
        winnerTeamId: null,
        headlineStat: null,
        scoreX100: null,
        tieBroken: false,
        runnerUpPlayerId: null,
        explanationText: `${label} unavailable: ${unavailableReasonIfEmpty}`,
      };
    }
    const sorted = [...ranked].sort(
      (a, b) =>
        b.primaryX100 - a.primaryX100 ||
        b.secondaryX100 - a.secondaryX100 ||
        b.tertiaryX100 - a.tertiaryX100 ||
        a.playerId.localeCompare(b.playerId),
    );
    const top = sorted[0]!;
    const second = sorted[1] ?? null;
    const tieBroken = second !== null && second.primaryX100 === top.primaryX100;
    return {
      awardVersion: AWARDS_MODEL_VERSION,
      category,
      label,
      awardProvenance: "GAME_AWARD",
      status: "AWARDED",
      unavailableReason: null,
      qualificationRule,
      formulaSummary,
      winnerPlayerId: top.playerId,
      winnerTeamId: top.teamId,
      headlineStat: top.headlineStat,
      scoreX100: top.primaryX100,
      tieBroken,
      runnerUpPlayerId: second?.playerId ?? null,
      explanationText: `${pName(top.playerId)} (${tName(top.teamId)}) won ${label} — ${top.headlineStat}${tieBroken ? " (resolved on tie-break)" : ""}.`,
    };
  };

  // 1. Player of the Season (MVP)
  const mvpCandidates = players
    .filter((p) => p.matches >= minMatchesMvp)
    .map((p) => {
      const score =
        p.matchImpactTotalX100 +
        p.potmWins * 1500 +
        p.runs * 15 +
        p.wickets * 400 +
        (p.catches + p.stumpings + p.runOuts) * 150;
      return {
        playerId: p.playerId,
        teamId: p.teamId,
        primaryX100: score,
        secondaryX100: p.potmWins * 100,
        tertiaryX100: p.runs * 100 + p.wickets * 2000,
        headlineStat: `${(score / 100).toFixed(1)} MVP pts · ${p.potmWins} POTM · ${p.runs}r · ${p.wickets}w`,
      };
    });

  const mvpEntry = buildEntry(
    "PLAYER_OF_THE_SEASON",
    "Player of the Season",
    `Minimum ${minMatchesMvp} matches played`,
    "Cumulative match-award top-5 impact + 15 POTM bonus pts + season batting/bowling/fielding consistency.",
    mvpCandidates,
    "No player met the minimum match qualification threshold.",
  );

  // 2. Leading Run-Scorer
  const battingCandidates = players
    .filter((p) => p.runs > 0)
    .map((p) => {
      const avgX100 = p.dismissals > 0 ? Math.round((p.runs * 100) / p.dismissals) : p.runs * 100;
      const srX100 = p.ballsFaced > 0 ? Math.round((p.runs * 10000) / p.ballsFaced) : 0;
      return {
        playerId: p.playerId,
        teamId: p.teamId,
        primaryX100: p.runs * 100,
        secondaryX100: avgX100,
        tertiaryX100: srX100,
        headlineStat: `${p.runs} runs (SR ${(srX100 / 100).toFixed(1)})`,
      };
    });
  const batEntry = buildEntry(
    "LEADING_RUN_SCORER",
    "Leading Run-Scorer",
    "At least 1 run scored; ties broken by batting average then strike rate",
    "Total season T20 runs scored.",
    battingCandidates,
    "No runs scored in completed matches.",
  );

  // 3. Leading Wicket-Taker
  const bowlingCandidates = players
    .filter((p) => p.wickets > 0)
    .map((p) => {
      const econNegX100 =
        p.bowlingLegalBalls > 0
          ? -Math.round((p.bowlingRunsConceded * 600) / p.bowlingLegalBalls)
          : -999999;
      const avgNegX100 = -Math.round((p.bowlingRunsConceded * 100) / p.wickets);
      const econDisplay =
        p.bowlingLegalBalls > 0
          ? ((p.bowlingRunsConceded * 6) / p.bowlingLegalBalls).toFixed(2)
          : "–";
      return {
        playerId: p.playerId,
        teamId: p.teamId,
        primaryX100: p.wickets * 100,
        secondaryX100: econNegX100,
        tertiaryX100: avgNegX100,
        headlineStat: `${p.wickets} wkts (econ ${econDisplay})`,
      };
    });
  const bowlEntry = buildEntry(
    "LEADING_WICKET_TAKER",
    "Leading Wicket-Taker",
    "At least 1 wicket taken; ties broken by lower economy then lower bowling average",
    "Total season T20 wickets taken.",
    bowlingCandidates,
    "No wickets taken in completed matches.",
  );

  // 4. Best Fielder
  const fieldingCandidates =
    evaluatedArchives === 0
      ? []
      : players
          .filter((p) => p.catches + p.stumpings + p.runOuts >= minFieldingDismissals)
          .map((p) => {
            const score = p.catches * 1000 + p.stumpings * 1200 + p.runOuts * 1400;
            const total = p.catches + p.stumpings + p.runOuts;
            return {
              playerId: p.playerId,
              teamId: p.teamId,
              primaryX100: score,
              secondaryX100: total * 100,
              tertiaryX100: p.runOuts * 100,
              headlineStat: `${total} dismissals (${p.catches}c ${p.stumpings}st ${p.runOuts}ro)`,
            };
          });
  const fieldEntry = buildEntry(
    "BEST_FIELDER",
    "Best Fielder",
    `Minimum ${minFieldingDismissals} attributable dismissals from sealed match event archives`,
    "Weighted attributable fielding dismissals: catch 10, stumping 12, run-out 14.",
    fieldingCandidates,
    evaluatedArchives === 0
      ? "Sealed delivery event archives are required for attributable fielding awards."
      : `No fielder reached the minimum ${minFieldingDismissals} attributable dismissals.`,
  );

  // 5. Emerging / Youth Player
  // Eligibility uses only facts fixed for this season (birth date, promotion season, retirement season),
  // so the award is the same whenever the ledger is computed, including after rollovers and on import
  // (audit 16 Nov 2026, Phase 3). The current active world alone is not enough: released and retired
  // players have left it.
  const youthEligibleIds = new Set<string>();
  const ageByPlayerId = new Map<string, number>();
  if (input.lifecycle) {
    const birthDateById = new Map<string, string>();
    const remember = (player: { playerId: string; birthDate: string }) => {
      if (!birthDateById.has(player.playerId)) birthDateById.set(player.playerId, player.birthDate);
    };
    input.lifecycle.activeWorld.players.forEach(remember);
    input.lifecycle.retiredPlayers.forEach((r) => remember(r.player));
    input.lifecycle.youthAcademy.forEach((y) => remember(y.player));
    for (const pack of input.lifecycle.historicalRosterPacks) pack.world.players.forEach(remember);
    (input.knownPlayers ?? []).forEach(remember);
    const retiredAfter = new Map(
      input.lifecycle.retiredPlayers.map((r) => [r.playerId, r.retiredAfterSeasonNumber] as const),
    );
    const promotedIn = new Map(
      input.lifecycle.youthAcademy
        .filter((y) => y.promotedInSeasonNumber !== null)
        .map((y) => [y.player.playerId, y.promotedInSeasonNumber!] as const),
    );
    for (const p of players) {
      const birthDate = birthDateById.get(p.playerId);
      if (!birthDate) continue;
      const birthYear = Number.parseInt(birthDate.slice(0, 4), 10);
      const age = Number.isInteger(birthYear) && birthYear >= 1900
        ? Math.max(16, input.calendarYear - birthYear)
        : 99;
      ageByPlayerId.set(p.playerId, age);
      const retiredBefore = (retiredAfter.get(p.playerId) ?? Number.POSITIVE_INFINITY) < input.seasonNumber;
      if (!retiredBefore && (age <= 22 || promotedIn.get(p.playerId) === input.seasonNumber)) {
        youthEligibleIds.add(p.playerId);
      }
    }
  }
  const youthCandidates =
    !input.lifecycle || youthEligibleIds.size === 0
      ? []
      : players
          .filter((p) => youthEligibleIds.has(p.playerId) && p.matches >= minMatchesYouth)
          .map((p) => {
            const score =
              p.matchImpactTotalX100 + p.potmWins * 1500 + p.runs * 15 + p.wickets * 400;
            const ageVal = ageByPlayerId.get(p.playerId);
            return {
              playerId: p.playerId,
              teamId: p.teamId,
              primaryX100: score,
              secondaryX100: p.runs * 100 + p.wickets * 2000,
              tertiaryX100: p.matches * 100,
              headlineStat: `${ageVal !== undefined ? `Age ${ageVal} · ` : ""}${p.runs}r · ${p.wickets}w (${p.matches}m)`,
            };
          });
  const youthEntry = buildEntry(
    "EMERGING_YOUTH_PLAYER",
    "Emerging Youth Player",
    `Active players aged <= 22 or Youth Academy graduates with >= ${minMatchesYouth} matches`,
    "Season match-impact score among eligible emerging youth players.",
    youthCandidates,
    !input.lifecycle
      ? "Player age and academy pathway records require a Stage 3+ lifecycle career."
      : `No eligible youth player reached ${minMatchesYouth} matches this season.`,
  );

  return SeasonAwardsSummarySchema.parse({
    awardVersion: AWARDS_MODEL_VERSION,
    seasonNumber: input.seasonNumber,
    calendarYear: input.calendarYear,
    competitionId,
    sealedAtSeasonSha256: input.sealedAtSeasonSha256 ?? null,
    provenanceNotice: AWARDS_PROVENANCE_NOTICE,
    awards: [mvpEntry, batEntry, bowlEntry, fieldEntry, youthEntry],
  });
}

export function sealCareerAwardsLedger(
  raw: Omit<CareerAwardsLedger, "ledgerSha256">,
): CareerAwardsLedger {
  const sortedMatchAwards = [...raw.matchAwards].sort(
    (a, b) =>
      a.seasonNumber - b.seasonNumber ||
      a.award.fixtureId?.localeCompare(b.award.fixtureId ?? "") ||
      a.key.localeCompare(b.key),
  );
  const sortedSeasonAwards = [...raw.seasonAwards].sort(
    (a, b) => a.seasonNumber - b.seasonNumber,
  );
  const core = {
    ledgerVersion: AWARDS_LEDGER_VERSION,
    worldOrCareerId: raw.worldOrCareerId,
    matchAwards: sortedMatchAwards,
    seasonAwards: sortedSeasonAwards,
  };
  const ledgerSha256 = pureSha256Hex(canonicalJson(core));
  return CareerAwardsLedgerSchema.parse({
    ...core,
    ledgerSha256,
  });
}

export function createEmptyCareerAwardsLedger(worldOrCareerId: string): CareerAwardsLedger {
  return sealCareerAwardsLedger({
    ledgerVersion: AWARDS_LEDGER_VERSION,
    worldOrCareerId,
    matchAwards: [],
    seasonAwards: [],
  });
}

export function recordMatchAwardIdempotent(
  ledger: CareerAwardsLedger,
  entry: CareerMatchAwardLedgerEntry,
): { ledger: CareerAwardsLedger; changed: boolean } {
  const existing = ledger.matchAwards.find((item) => item.key === entry.key);
  if (existing) {
    if (existing.sourceCompletionSha256 !== entry.sourceCompletionSha256) {
      throw new Error(`CAREER_AWARD_CONFLICT:${entry.key}`);
    }
    return { ledger, changed: false };
  }
  return {
    ledger: sealCareerAwardsLedger({
      ledgerVersion: AWARDS_LEDGER_VERSION,
      worldOrCareerId: ledger.worldOrCareerId,
      matchAwards: [...ledger.matchAwards, entry],
      seasonAwards: ledger.seasonAwards,
    }),
    changed: true,
  };
}

export function recordSeasonAwardsIdempotent(
  ledger: CareerAwardsLedger,
  summary: SeasonAwardsSummary,
): { ledger: CareerAwardsLedger; changed: boolean } {
  const existing = ledger.seasonAwards.find(
    (item) => item.seasonNumber === summary.seasonNumber,
  );
  if (existing) {
    if (
      existing.sealedAtSeasonSha256 &&
      summary.sealedAtSeasonSha256 &&
      existing.sealedAtSeasonSha256 !== summary.sealedAtSeasonSha256
    ) {
      throw new Error(`CAREER_SEASON_AWARD_CONFLICT:S${summary.seasonNumber}`);
    }
    return { ledger, changed: false };
  }
  return {
    ledger: sealCareerAwardsLedger({
      ledgerVersion: AWARDS_LEDGER_VERSION,
      worldOrCareerId: ledger.worldOrCareerId,
      matchAwards: ledger.matchAwards,
      seasonAwards: [...ledger.seasonAwards, summary],
    }),
    changed: true,
  };
}

export function reconcileCareerAwardsLedger(input: {
  worldOrCareerId: string;
  existingLedger?: CareerAwardsLedger | null;
  persistentWorld?: AnyPersistentWorldState | null;
  singleSeason?: {
    seasonNumber: number;
    calendarYear: number;
    phase: "ACTIVE" | "COMPLETE";
    finalSeasonStateSha256?: string | null;
    completedMatches: readonly T20SeasonMatchCompletion[];
  } | null;
  archives?: readonly AnyCareerMatchEventArchive[] | ReadonlyMap<string, AnyCareerMatchEventArchive>;
  knownPlayers?: readonly { playerId: string; birthDate: string }[];
  playerNames?: Readonly<Record<string, string>>;
  teamNames?: Readonly<Record<string, string>>;
}): { ledger: CareerAwardsLedger; changed: boolean } {
  const archiveMap = new Map<string, AnyCareerMatchEventArchive>();
  if (input.archives instanceof Map) {
    for (const [k, v] of input.archives.entries()) archiveMap.set(k, v);
  } else if (Array.isArray(input.archives)) {
    for (const a of input.archives) archiveMap.set(a.fixtureId, a);
  }

  let ledger = input.existingLedger ?? createEmptyCareerAwardsLedger(input.worldOrCareerId);
  let changed = !input.existingLedger;
  const lifecycle =
    input.persistentWorld && "lifecycle" in input.persistentWorld
      ? input.persistentWorld.lifecycle
      : null;

  const seasonsToProcess: Array<{
    seasonNumber: number;
    calendarYear: number;
    phase: "ACTIVE" | "COMPLETE";
    sealedSha: string | null;
    completedMatches: readonly T20SeasonMatchCompletion[];
  }> = [];

  if (input.persistentWorld) {
    for (const s of input.persistentWorld.completedSeasons) {
      seasonsToProcess.push({
        seasonNumber: s.seasonNumber,
        calendarYear: s.calendarYear,
        phase: "COMPLETE",
        sealedSha: s.finalSeasonStateSha256,
        completedMatches: s.completedMatches,
      });
    }
    seasonsToProcess.push({
      seasonNumber: input.persistentWorld.currentSeasonNumber,
      calendarYear: input.persistentWorld.currentCalendarYear,
      phase: input.persistentWorld.currentSeason.phase,
      sealedSha:
        input.persistentWorld.currentSeason.phase === "COMPLETE"
          ? input.persistentWorld.currentSeason.stateSha256
          : null,
      completedMatches: input.persistentWorld.currentSeason.completedMatches,
    });
  } else if (input.singleSeason) {
    seasonsToProcess.push({
      seasonNumber: input.singleSeason.seasonNumber,
      calendarYear: input.singleSeason.calendarYear,
      phase: input.singleSeason.phase,
      sealedSha: input.singleSeason.finalSeasonStateSha256 ?? null,
      completedMatches: input.singleSeason.completedMatches,
    });
  }

  for (const season of seasonsToProcess) {
    const seasonMatchAwards: MatchAwardRecord[] = [];
    for (const completion of season.completedMatches) {
      const key = `${season.seasonNumber}:${completion.fixtureId}`;
      const existing = ledger.matchAwards.find((item) => item.key === key);
      if (existing) {
        seasonMatchAwards.push(existing.award);
        continue;
      }
      const archive = archiveMap.get(completion.fixtureId) ?? null;
      const award = computeMatchAwardFromCompletion(completion, {
        seasonNumber: season.seasonNumber,
        archive,
        ...(input.playerNames ? { playerNames: input.playerNames } : {}),
        ...(input.teamNames ? { teamNames: input.teamNames } : {}),
      });
      const res = recordMatchAwardIdempotent(ledger, {
        key,
        seasonNumber: season.seasonNumber,
        fixtureId: completion.fixtureId,
        matchId: completion.matchId,
        sourceCompletionSha256: completion.sourceCompletionSha256,
        award,
      });
      ledger = res.ledger;
      changed = changed || res.changed;
      seasonMatchAwards.push(award);
    }
    if (season.phase === "COMPLETE") {
      const existingSeason = ledger.seasonAwards.find(
        (s) => s.seasonNumber === season.seasonNumber,
      );
      if (!existingSeason) {
        const summary = computeSeasonAwards({
          seasonNumber: season.seasonNumber,
          calendarYear: season.calendarYear,
          sealedAtSeasonSha256: season.sealedSha,
          completedMatches: season.completedMatches,
          matchAwards: seasonMatchAwards,
          archivesByFixtureId: archiveMap,
          lifecycle,
          ...(input.knownPlayers ? { knownPlayers: input.knownPlayers } : {}),
          ...(input.playerNames ? { playerNames: input.playerNames } : {}),
          ...(input.teamNames ? { teamNames: input.teamNames } : {}),
        });
        const res = recordSeasonAwardsIdempotent(ledger, summary);
        ledger = res.ledger;
        changed = changed || res.changed;
      }
    }
  }

  return { ledger, changed };
}
