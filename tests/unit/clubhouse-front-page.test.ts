import { describe, expect, it } from "vitest";
import type { AppliedSeasonMatch, SeasonTeamTableRow } from "@lcxxvi/contracts";
import {
  CLUBHOUSE_FRONT_PAGE_RULES,
  clubFormGuide,
  clubStanding,
  ordinal,
  squadStrip,
  type SquadStripPlayer,
} from "../../apps/web/src/career/clubhouse-front-page.js";

const applied = (round: number, home: string, away: string, resultKind: AppliedSeasonMatch["resultKind"], winner: string | null): AppliedSeasonMatch => ({
  fixtureId: `fixture-${round}-${home}`,
  matchId: `match-${round}-${home}`,
  fixtureOrdinal: (round - 1) * 4,
  roundNumber: round,
  homeTeamId: home,
  awayTeamId: away,
  sourceCompletionSha256: "0".repeat(64),
  resultKind,
  winnerTeamId: winner,
  homePoints: 0,
  awayPoints: 0,
  nrrEligible: true,
  homeRuns: 0,
  homeBalls: 0,
  awayRuns: 0,
  awayBalls: 0,
});

const row = (teamId: string, rank: number, played: number, points: number, extra: Partial<SeasonTeamTableRow> = {}): SeasonTeamTableRow => ({
  rank, teamId, played, wins: 0, losses: 0, ties: 0, noResults: 0, points,
  runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrrNumerator: 0, nrrDenominator: null, nrrX1000: null, headToHeadPoints: 0,
  ...extra,
});

const player = (playerId: string, rating: number, patch: Partial<SquadStripPlayer> = {}): SquadStripPlayer => ({
  playerId, rating, unavailable: false, unavailableReason: null, fatigueBp: 0, formTrend: null, formText: "", formDiscipline: null,
  milestones: [], contractEnding: false, style: `Style of ${playerId}`, ...patch,
});

describe("CP07 Clubhouse front page: form guide", () => {
  it("is empty before the club has played", () => {
    expect(clubFormGuide([applied(1, "team-02", "team-03", "WIN", "team-02")], "team-01")).toEqual([]);
  });

  it("keeps the club's last five results, oldest first, from its own point of view", () => {
    const matches = [
      applied(6, "team-01", "team-07", "NO_RESULT", null),
      applied(1, "team-01", "team-02", "WIN", "team-01"),
      applied(2, "team-03", "team-01", "WIN", "team-03"),
      applied(3, "team-01", "team-04", "TIE", null),
      applied(4, "team-05", "team-01", "WIN", "team-01"),
      applied(5, "team-06", "team-08", "WIN", "team-06"),
      applied(7, "team-08", "team-01", "WIN", "team-08"),
    ];
    const guide = clubFormGuide(matches, "team-01");
    expect(guide.map((entry) => entry.outcome).join("")).toBe("LTWNL");
    expect(guide.map((entry) => entry.roundNumber)).toEqual([2, 3, 4, 6, 7]);
    expect(guide[0]).toMatchObject({ opponentTeamId: "team-03", home: false });
    expect(guide[1]).toMatchObject({ opponentTeamId: "team-04", home: true });
  });
});

describe("CP07 Clubhouse front page: standing", () => {
  it("gives no position before the club has played, even though every row starts at rank 1", () => {
    const table = ["team-01", "team-02", "team-03"].map((id) => row(id, 1, 0, 0));
    expect(clubStanding(table, "team-01")).toEqual({ kind: "NOT_STARTED", roundsToPlay: CLUBHOUSE_FRONT_PAGE_RULES.totalRounds });
  });

  it("reports rank, record, net run rate and the gap to the top once a match is applied", () => {
    const table = [
      row("team-02", 1, 2, 4, { wins: 2 }),
      row("team-01", 2, 2, 2, { wins: 1, losses: 1, nrrX1000: -2600 }),
      row("team-03", 3, 2, 0, { losses: 2 }),
    ];
    expect(clubStanding(table, "team-01")).toEqual({
      kind: "TABLE", rank: 2, teams: 3, played: 2, wins: 1, losses: 1, ties: 0, noResults: 0, points: 2,
      nrr: "-2.600", pointsOffTop: 2, roundsLeft: 12,
    });
    expect(clubStanding(table, "team-02")).toMatchObject({ rank: 1, pointsOffTop: 0, nrr: null });
    expect(clubStanding(table, "team-09")).toBeNull();
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 8, 11, 12, 13, 21].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "8th", "11th", "12th", "13th", "21st"]);
  });
});

describe("CP07 Clubhouse front page: squad strip", () => {
  it("shows the leading players by rating, with their style, when there is nothing to report", () => {
    const strip = squadStrip([player("p003", 60), player("p001", 70), player("p002", 70, { contractEnding: true })], 0, 2);
    expect(strip.developments).toBe(false);
    expect(strip.faces.map((face) => face.playerId)).toEqual(["p001", "p002"]);
    expect(strip.faces[1]!.notes).toEqual([
      { kind: "PROFILE", text: "Style of p002" },
      { kind: "CONTRACT", text: "Contract ends this season" },
    ]);
    expect(strip.contractsEnding).toBe(1);
  });

  it("reports no fatigue before the club's first match", () => {
    const strip = squadStrip([player("p001", 70, { fatigueBp: 9000 })], 0);
    expect(strip.tired).toBeNull();
    expect(strip.developments).toBe(false);
  });

  it("orders developments by urgency: unavailable, tired, milestone, form rising, form falling", () => {
    const tired = CLUBHOUSE_FRONT_PAGE_RULES.tiredFatigueBp;
    const strip = squadStrip([
      player("p001", 80, { formTrend: "DOWN", formText: "3, 0, 1", formDiscipline: "BATTING" }),
      player("p002", 50, { formTrend: "UP", formText: "2/18, 3/20, 4/12", formDiscipline: "BOWLING" }),
      player("p003", 60, { milestones: ["12 runs from 500 career runs"] }),
      player("p004", 55, { fatigueBp: tired }),
      player("p005", 40, { unavailable: true, unavailableReason: "Fictional pack entry" }),
      player("p006", 90, { fatigueBp: tired - 1, formTrend: "LEVEL" }),
    ], 3);
    expect(strip.developments).toBe(true);
    expect(strip.faces.map((face) => face.playerId)).toEqual(["p005", "p004", "p003", "p002", "p001"]);
    expect(strip.faces.map((face) => face.notes[0]!.text)).toEqual([
      "Unavailable: Fictional pack entry",
      `Tired, ${Math.round(tired / 100)}% fatigue`,
      "12 runs from 500 career runs",
      "Form rising: last spells 2/18, 3/20, 4/12",
      "Form falling: last innings 3, 0, 1",
    ]);
    expect(strip).toMatchObject({ unavailable: 1, tired: 1, contractsEnding: 0 });
  });

  it("never fills the strip with contract lines alone", () => {
    const strip = squadStrip([player("p001", 70, { contractEnding: true }), player("p002", 60, { contractEnding: true })], 2);
    expect(strip.developments).toBe(false);
    expect(strip.contractsEnding).toBe(2);
    expect(strip.faces.every((face) => face.notes[0]!.kind === "PROFILE")).toBe(true);
  });

  it("caps the strip at six faces by default", () => {
    const strip = squadStrip(Array.from({ length: 9 }, (_, i) => player(`p00${i}`, 50 + i, { milestones: ["Next match is appearance number 50"] })), 4);
    expect(strip.faces).toHaveLength(CLUBHOUSE_FRONT_PAGE_RULES.squadFaces);
    expect(strip.faces[0]!.playerId).toBe("p008");
  });
});
