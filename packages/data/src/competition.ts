import { T20LeagueCompetitionManifestSchema } from "@lcxxvi/contracts";

export const T20_LEAGUE_COMPETITION = T20LeagueCompetitionManifestSchema.parse({
  competitionVersion: "LC_T20_LEAGUE_COMPETITION_V1",
  competitionId: "LC_T20_LEAGUE_01",
  format: "T20",
  worldPackId: "fictional-eight-01",
  worldCanonicalSha256: "f4cbe33f4a2ea41385143cc03ab6d64e94a356f8af75e30483a68de87bdca252",
  teamIds: ["team-01", "team-02", "team-03", "team-04", "team-05", "team-06", "team-07", "team-08"],
  groundIds: ["ground-01", "ground-02", "ground-03", "ground-04", "ground-05", "ground-06", "ground-07", "ground-08"],
  homeGroundIds: {
    "team-01": "ground-01", "team-02": "ground-02", "team-03": "ground-03", "team-04": "ground-04",
    "team-05": "ground-05", "team-06": "ground-06", "team-07": "ground-07", "team-08": "ground-08",
  },
  teamCount: 8,
  rounds: 14,
  matchesPerRound: 4,
  totalFixtures: 56,
  roundSpacingDays: 3,
  playoffs: false,
  points: { win: 2, tie: 1, noResult: 1, loss: 0 },
  tableOrder: ["POINTS", "WINS", "NET_RUN_RATE", "HEAD_TO_HEAD_POINTS", "TEAM_ID"],
  rainAdjustedNrr: false,
  schedulerAlgorithm: "CIRCLE_REVERSE_VENUES_V1",
});
