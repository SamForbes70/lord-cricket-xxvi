import { describe, expect, test } from "vitest";
import type { AppliedSeasonMatch, T20SeasonMatchCompletion } from "@lcxxvi/contracts";
import { PLAYER_IDENTITY_V3_RULES, projectSeasonReview, SEASON_REVIEW_V1_RULES, SEASON_REVIEW_V1_VERSION, type SeasonReviewInput } from "@lcxxvi/projections";

type Scorecard = T20SeasonMatchCompletion["scorecard"];
type Innings = Scorecard["innings"][number];
type Bat = Innings["batting"][string];
type Bowl = Innings["bowling"][string];
const H = "a".repeat(64);
const TEAMS = ["t1", "t2", "t3", "t4"];
const NAMES: Record<string, string> = { t1: "Aster Harbour", t2: "Copper Vale", t3: "Silver Fen", t4: "Larchwood" };
const teamName = (id: string) => NAMES[id] ?? id;
/** Names without digits, so the fact check sees only the numbers the sentences state. */
const playerName = (id: string) => `Player ${id.toUpperCase().replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]!)}`;
const noExtras = { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 };
const eleven = (teamId: string) => Array.from({ length: 11 }, (_, i) => `${teamId}p${i + 1}`);

interface Side {
  team: string;
  runs: number;
  wickets: number;
  balls?: number;
  batting?: Record<string, Partial<Bat>>;
  bowling?: Record<string, Partial<Bowl>>;
  /** Scores at the fall of each wicket. */
  fall?: number[];
}

function innings(bat: Side, bowlTeam: string): Innings {
  const batting: Innings["batting"] = {};
  for (const [id, line] of Object.entries(bat.batting ?? {})) batting[id] = { runs: 0, ballsFaced: 0, fours: 0, sixes: 0, dismissed: true, ...line };
  const bowling: Innings["bowling"] = {};
  return {
    battingTeamId: bat.team, bowlingTeamId: bowlTeam, runs: bat.runs, wickets: bat.wickets, legalBalls: bat.balls ?? 120,
    overs: "20", extras: noExtras, batting, bowling,
    fallOfWickets: (bat.fall ?? []).map((runs, i) => ({ playerId: `${bat.team}x${i}`, runs, legalBalls: i * 6, sequence: i + 1 })),
    targetToWin: null,
  };
}

function game(round: number, ordinal: number, first: Side, second: Side, season = "s1"): { completion: T20SeasonMatchCompletion; applied: AppliedSeasonMatch } {
  const a = innings(first, second.team);
  const b = innings(second, first.team);
  // The bowling lines belong to the side that bowled: `first.bowling` is what `first` bowled in the second innings.
  for (const [id, line] of Object.entries(first.bowling ?? {})) b.bowling[id] = { runsConceded: 0, legalBalls: 24, wickets: 0, maidens: 0, ...line };
  for (const [id, line] of Object.entries(second.bowling ?? {})) a.bowling[id] = { runsConceded: 0, legalBalls: 24, wickets: 0, maidens: 0, ...line };
  let result: Scorecard["result"];
  let winner: string | null = null;
  if (a.runs > b.runs) {
    winner = first.team;
    result = { kind: "WIN", winnerTeamId: first.team, marginType: "RUNS", marginRuns: a.runs - b.runs, marginWickets: null, completionReason: "x" };
  } else if (b.runs > a.runs) {
    winner = second.team;
    result = { kind: "WIN", winnerTeamId: second.team, marginType: "WICKETS", marginRuns: null, marginWickets: 10 - b.wickets, completionReason: "x" } as Scorecard["result"];
  } else {
    result = { kind: "TIE", completionReason: "x" } as unknown as Scorecard["result"];
  }
  const fixtureId = `${season}-f${ordinal}`;
  const completion: T20SeasonMatchCompletion = {
    completionVersion: "LC_T20_SEASON_MATCH_COMPLETION_V1", seasonId: season, scheduleSha256: H, fixtureId, matchId: `m-${fixtureId}`,
    fixtureOrdinal: ordinal, roundNumber: round, matchDayDate: "2027-03-01", homeTeamId: first.team, awayTeamId: second.team,
    source: "OFFSCREEN", sourceCompletionSha256: H, scorecardSha256: H,
    selectedTeams: [
      { teamId: first.team, playerIds: eleven(first.team), captainId: `${first.team}p1`, keeperId: `${first.team}p2` },
      { teamId: second.team, playerIds: eleven(second.team), captainId: `${second.team}p1`, keeperId: `${second.team}p2` },
    ] as T20SeasonMatchCompletion["selectedTeams"],
    scorecard: { matchId: `m-${fixtureId}`, innings: [a, b], result } as Scorecard,
  };
  const applied: AppliedSeasonMatch = {
    fixtureId, matchId: completion.matchId, fixtureOrdinal: ordinal, roundNumber: round, homeTeamId: first.team, awayTeamId: second.team,
    sourceCompletionSha256: H, resultKind: winner ? "WIN" : "TIE", winnerTeamId: winner,
    homePoints: winner === first.team ? 2 : winner ? 0 : 1, awayPoints: winner === second.team ? 2 : winner ? 0 : 1,
    nrrEligible: true, homeRuns: a.runs, homeBalls: a.legalBalls, awayRuns: b.runs, awayBalls: b.legalBalls,
  };
  return { completion, applied };
}

/** A five-round season of four clubs. t1 is the focus club. */
function season(): ReturnType<typeof game>[] {
  return [
    // Round 1: t1 beat t2 by 40 runs; t1p1 makes 60; t3 beat t4.
    game(1, 0, { team: "t1", runs: 180, wickets: 5, batting: { t1p1: { runs: 60, ballsFaced: 40 } }, bowling: { t1p9: { runsConceded: 20, wickets: 3 } } },
      { team: "t2", runs: 140, wickets: 9, fall: [10, 30, 32, 35, 40, 44, 90, 100, 120] }),
    game(1, 1, { team: "t3", runs: 150, wickets: 6 }, { team: "t4", runs: 120, wickets: 10 }),
    // Round 2: t1 chase down t3's 130 with 30 balls to spare, losing 2 wickets; t2 beat t4.
    game(2, 2, { team: "t3", runs: 130, wickets: 8 }, { team: "t1", runs: 131, wickets: 2, balls: 90, batting: { t1p1: { runs: 45, ballsFaced: 30, dismissed: false } } }),
    game(2, 3, { team: "t2", runs: 200, wickets: 3, batting: { t2p3: { runs: 101, ballsFaced: 55, dismissed: false } } }, { team: "t4", runs: 150, wickets: 7, bowling: { t4p8: { runsConceded: 50, wickets: 1 } } }),
    // Round 3: t1 beat t4 by 5 runs; t2 beat t3.
    game(3, 4, { team: "t1", runs: 155, wickets: 7, bowling: { t1p9: { runsConceded: 30, wickets: 2 }, t1p10: { runsConceded: 18, wickets: 1 } } }, { team: "t4", runs: 150, wickets: 8 }),
    game(3, 5, { team: "t2", runs: 170, wickets: 4 }, { team: "t3", runs: 100, wickets: 10 }),
    // Round 4: t2 beat t1 by 60 runs; t1 collapse 4 for 12; t3 and t4 tie.
    game(4, 6, { team: "t2", runs: 190, wickets: 4 }, { team: "t1", runs: 130, wickets: 10, fall: [50, 52, 60, 61, 62, 100, 110, 120, 125, 130], batting: { t1p1: { runs: 2, ballsFaced: 4 } }, bowling: { t1p9: { runsConceded: 40, wickets: 0 } } }),
    game(4, 7, { team: "t3", runs: 140, wickets: 6 }, { team: "t4", runs: 140, wickets: 8 }),
    // Round 5: t1 tie with t3 is not here; t1 lose to t4 chasing down 120 with 6 balls left.
    game(5, 8, { team: "t1", runs: 120, wickets: 8, bowling: { t1p9: { runsConceded: 25, wickets: 1 }, t1p10: { runsConceded: 30, wickets: 0 } } }, { team: "t4", runs: 121, wickets: 4, balls: 114 }),
    game(5, 9, { team: "t2", runs: 160, wickets: 6 }, { team: "t3", runs: 150, wickets: 9 }),
  ];
}

function input(overrides: Partial<SeasonReviewInput> = {}): SeasonReviewInput {
  const games = season();
  return {
    seasonNumber: 2,
    completedMatches: games.map((g) => g.completion),
    appliedMatches: games.map((g) => g.applied),
    teamIds: TEAMS,
    focusTeamId: "t1",
    teamName,
    playerName,
    ...overrides,
  };
}

const NUMBER = /\d+(?:\.\d+)?/g;
/** Every number in a sentence is one of its facts (or part of a score such as 62/5 listed whole). */
function expectNumbersAreFacts(text: string, facts: readonly { value: number | string }[]) {
  const listed = facts.flatMap((f) => String(f.value).match(NUMBER) ?? []);
  for (const n of text.match(NUMBER) ?? []) expect(listed, `${n} in "${text}"`).toContain(n);
}

describe("season review V1", () => {
  test("tells how the title was won and the focus club's journey from the applied results", () => {
    const review = projectSeasonReview(input());
    expect(review.version).toBe(SEASON_REVIEW_V1_VERSION);
    expect(review.matchesCompleted).toBe(10);
    // t2: 4 wins from 5 (8 points); t1: 3 wins (6 points).
    expect(review.titleRace).toMatchObject({ championTeamId: "t2", runnerUpTeamId: "t1" });
    expect(review.titleRace!.text).toBe("Copper Vale won the title with 8 points from 5 matches (4 won), 2 points clear of Aster Harbour. They were top from round 4 to the end.");
    expect(review.club!.finalPosition).toBe(2);
    expect(review.club!.positions.map((p) => p.position)).toEqual([1, 1, 1, 2, 2]);
    expect(review.club!.text).toBe("Aster Harbour finished 2nd with 3 won, 2 lost and 6 points. Their highest place was 1st, after round 1; their lowest was 2nd, after round 4.");
  });

  test("the club story is chosen by the fixed rules and told in round order", () => {
    const review = projectSeasonReview(input());
    const club = review.story.filter((s) => s.scope === "CLUB");
    expect(club.map((s) => s.kind)).toEqual([
      "BIGGEST_WIN_RUNS", "WIN_STREAK", "COLLAPSE_INFLICTED", "BIGGEST_WIN_CHASE", "HEAVIEST_DEFEAT_RUNS", "COLLAPSE_SUFFERED", "HEAVIEST_DEFEAT_CHASE",
    ]);
    const text = (kind: string) => review.story.find((s) => s.kind === kind)!.text;
    expect(text("BIGGEST_WIN_RUNS")).toBe("Beat Copper Vale by 40 runs in round 1.");
    expect(text("BIGGEST_WIN_CHASE")).toBe("Beat Silver Fen by 8 wickets with 30 balls to spare in round 2.");
    expect(text("HEAVIEST_DEFEAT_RUNS")).toBe("Lost to Copper Vale by 60 runs in round 4.");
    expect(text("HEAVIEST_DEFEAT_CHASE")).toBe("Larchwood chased down their total with 6 balls to spare and 6 wickets in hand in round 5.");
    expect(text("WIN_STREAK")).toBe("Won 3 league matches in a row, from round 1 to round 3.");
    // Counted from the score at the wicket before the first of them: 50/1 to 62/5 is four wickets for 12.
    expect(text("COLLAPSE_SUFFERED")).toBe("Aster Harbour lost 4 wickets for 12 runs, from 50/1 to 62/5, in round 4 against Copper Vale.");
    expect(text("COLLAPSE_INFLICTED")).toBe("Copper Vale lost 4 wickets for 14 runs, from 30/2 to 44/6, in round 1 against Aster Harbour.");
    expect(review.story.some((s) => s.kind === "LOSING_STREAK")).toBe(false);
  });

  test("league records of the season, and against earlier seasons", () => {
    const first = projectSeasonReview(input());
    const text = (r: typeof first, kind: string) => r.story.find((s) => s.kind === kind)!.text;
    expect(text(first, "HIGHEST_TEAM_TOTAL")).toBe("Copper Vale made 200/3 against Larchwood in round 2.");
    expect(text(first, "HIGHEST_SCORE")).toBe("Player TCPD (Copper Vale) made 101 not out from 55 balls against Larchwood in round 2.");
    expect(text(first, "BEST_BOWLING")).toBe("Player TBPJ (Aster Harbour) took 3/20 against Copper Vale in round 1.");

    const prior = game(1, 0, { team: "t3", runs: 200, wickets: 9, batting: { t3p1: { runs: 120, ballsFaced: 60 } } }, { team: "t4", runs: 100, wickets: 10, bowling: { t4p9: { runsConceded: 10, wickets: 3 } } }, "s0");
    const later = projectSeasonReview(input({ priorSeasons: [{ seasonNumber: 1, completedMatches: [prior.completion] }] }));
    expect(text(later, "HIGHEST_TEAM_TOTAL")).toBe("Copper Vale made 200/3 against Larchwood in round 2. It equals the league record, 200/9 by Silver Fen in Season 1.");
    expect(text(later, "HIGHEST_SCORE")).not.toMatch(/record/);
    expect(text(later, "BEST_BOWLING")).not.toMatch(/record/);
    const beaten = game(1, 0, { team: "t3", runs: 150, wickets: 9 }, { team: "t4", runs: 100, wickets: 10, bowling: { t4p9: { runsConceded: 25, wickets: 3 } } }, "s0");
    const record = projectSeasonReview(input({ priorSeasons: [{ seasonNumber: 1, completedMatches: [beaten.completion] }] }));
    expect(text(record, "HIGHEST_TEAM_TOTAL")).toBe("Copper Vale made 200/3 against Larchwood in round 2. A league record: the best before was 150/9 by Silver Fen in Season 1.");
    expect(text(record, "BEST_BOWLING")).toMatch(/A league record: the best before was 3\/25 by Player TEPJ in Season 1\.$/);
  });

  test("awards by documented rules, with qualification", () => {
    const review = projectSeasonReview(input());
    const award = (id: string) => review.awards.find((a) => a.id === id)!;
    // t1p9 bowled 24 balls in four matches (96 balls): under the league's 120-ball minimum; nobody bowled 120.
    expect(award("LEAGUE_BEST_ECONOMY")).toMatchObject({ playerId: null, value: "No bowler reached 20 overs." });
    expect(award("CLUB_TOP_RUN_SCORER")).toMatchObject({ playerId: "t1p1", value: "107 runs in 3 innings, best 60" });
    expect(award("CLUB_TOP_WICKET_TAKER")).toMatchObject({ playerId: "t1p9", value: "6 wickets, best 3/20" });
    // t1p9: 115 runs from 96 balls = 7.19; t1p10: 48 from 48 balls is under 60.
    expect(award("CLUB_BEST_ECONOMY")).toMatchObject({ playerId: "t1p9", value: "7.19 an over (16 overs, 6 wickets)" });
    // t1p9: 6 wickets x 20 = 120 points, beating t1p1's 107 runs.
    expect(award("CLUB_PLAYER_OF_SEASON")).toMatchObject({ playerId: "t1p9", value: "120 points (0 runs, 6 wickets)" });
    expect(SEASON_REVIEW_V1_RULES.leagueEconomyMinBalls).toBe(120);
  });

  test("squad lines and league milestones by the V3 marks", () => {
    const prior = game(1, 0, { team: "t1", runs: 160, wickets: 5, batting: { t1p1: { runs: 45, ballsFaced: 30 } }, bowling: { t1p10: { runsConceded: 20, wickets: 1 } } }, { team: "t3", runs: 100, wickets: 10 }, "s0");
    // t1p9 was not in that eleven.
    prior.completion.selectedTeams[0].playerIds[8] = "t1p99";
    const review = projectSeasonReview(input({ priorSeasons: [{ seasonNumber: 1, completedMatches: [prior.completion] }] }));
    const line = (id: string) => review.squad.find((p) => p.playerId === id)!;
    expect(review.squad).toHaveLength(11);
    expect(line("t1p1")).toMatchObject({ matches: 5, innings: 3, notOuts: 1, runs: 107, ballsFaced: 74, highScore: { runs: 60, notOut: false }, fifties: 1 });
    // 45 before + 107 = 152: passes 100 (V3 mark); a fifty before? No, 45: so this is the first league fifty.
    expect(line("t1p1").milestones.map((m) => m.text)).toEqual(["Passed 100 league runs (152 in all).", "First league fifty (best 60)."]);
    // t1p9: no league match before this season; 6 wickets: first wicket, but 10 not reached.
    expect(line("t1p9").milestones.map((m) => m.text)).toEqual(["First league season.", "First league wicket."]);
    // t1p10 played before and had a wicket: nothing new.
    expect(line("t1p10").milestones).toEqual([]);
    expect(PLAYER_IDENTITY_V3_RULES.runsMarks).toContain(100);
  });

  test("development at the rollover that opened this season, and the bridge to the next one", () => {
    const review = projectSeasonReview(input({
      lastRollover: {
        fromSeasonNumber: 1, toSeasonNumber: 2,
        developedPlayers: [
          { playerId: "t1p1", teamId: "t1", deltas: { battingDelta: 3, bowlingDelta: 0, fieldingDelta: 1, keepingDelta: 0, staminaDelta: -1 } },
          { playerId: "t1p2", teamId: "t1", deltas: { battingDelta: -2, bowlingDelta: 0, fieldingDelta: 0, keepingDelta: 0, staminaDelta: 0 } },
          { playerId: "t1p3", teamId: "t1", deltas: { battingDelta: 0, bowlingDelta: 0, fieldingDelta: 0, keepingDelta: 0, staminaDelta: 2 } },
          { playerId: "t2p1", teamId: "t2", deltas: { battingDelta: 5, bowlingDelta: 0, fieldingDelta: 0, keepingDelta: 0, staminaDelta: 0 } },
        ],
      },
      ahead: {
        contracts: [
          { playerId: "t1p4", teamId: "t1", expiresAfterSeasonNumber: 2 },
          { playerId: "t1p5", teamId: "t1", expiresAfterSeasonNumber: 3 },
          { playerId: "t2p4", teamId: "t2", expiresAfterSeasonNumber: 2 },
        ],
        academy: [
          { playerId: "y1", teamId: "t1", generatedInSeasonNumber: 2, promotedInSeasonNumber: null, queuedForPromotion: true },
          { playerId: "y2", teamId: "t1", generatedInSeasonNumber: 2, promotedInSeasonNumber: null, queuedForPromotion: false },
          { playerId: "y3", teamId: "t1", generatedInSeasonNumber: 1, promotedInSeasonNumber: 2, queuedForPromotion: false },
        ],
      },
    }));
    expect(review.development!.improved.map((d) => [d.playerId, d.text])).toEqual([["t1p1", "batting +3, fielding +1, stamina -1."]]);
    expect(review.development!.declined.map((d) => d.playerId)).toEqual(["t1p2"]);
    expect(review.development!.unchanged).toBe(1);
    expect(review.ahead!.contractsEnding).toEqual(["t1p4"]);
    expect(review.ahead!.sentences.map((s) => s.text)).toEqual([
      "1 contract at your club ends with this season: Player TBPE. A contract not renewed by the close ends then, and the player joins the free-agent pool.",
      "Your academy holds 2 prospects from this season's intake. Queued for promotion at the close: Player YB.",
      "Closing the season starts Season 3: players age and develop, and the board sets Season 3's objective from each club's best eleven after those changes.",
    ]);
    // A rollover that did not open this season is not shown.
    expect(projectSeasonReview(input({ lastRollover: { fromSeasonNumber: 0, toSeasonNumber: 1, developedPlayers: [] } })).development).toBeNull();
    expect(projectSeasonReview(input()).ahead).toBeNull();
  });

  test("no focus club: league parts only", () => {
    const review = projectSeasonReview(input({ focusTeamId: null }));
    expect(review.club).toBeNull();
    expect(review.story.every((s) => s.scope === "LEAGUE")).toBe(true);
    expect(review.awards.map((a) => a.id)).toEqual(["LEAGUE_BEST_ECONOMY"]);
    expect(review.squad).toEqual([]);
  });

  test("deterministic, independent of input order, every number a listed fact, and no dashes or causal words", () => {
    const prior = game(1, 0, { team: "t1", runs: 160, wickets: 5, batting: { t1p1: { runs: 45, ballsFaced: 30 } } }, { team: "t3", runs: 100, wickets: 10 }, "s0");
    const base = input({ priorSeasons: [{ seasonNumber: 1, completedMatches: [prior.completion] }] });
    const a = projectSeasonReview(base);
    const b = projectSeasonReview({ ...base, completedMatches: [...base.completedMatches].reverse(), appliedMatches: [...base.appliedMatches].reverse() });
    expect(b).toEqual(a);
    const sentences = [
      a.titleRace!, a.club!, ...a.story,
      ...a.awards.map((x) => ({ text: x.value, facts: x.facts })),
      ...a.squad.flatMap((p) => p.milestones),
    ];
    for (const s of sentences) {
      expectNumbersAreFacts(s.text, s.facts);
      expect(s.text).not.toMatch(/[\u2013\u2014]/);
      expect(s.text).not.toMatch(/\b(because|caused|thanks to|due to|should|will)\b/i);
    }
  });
});
