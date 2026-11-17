import {
  SCENARIO_CHALLENGE_SCHEMA_ID,
  ScenarioChallengeSchema,
  type ScenarioChallenge,
} from "@lcxxvi/contracts";

/**
 * Stage 12 curated scenario pack. Every team, ground and score is from the frozen fictional world
 * (`fictional-eight-01`). Each checkpoint is the engine's own output for the stated seed: the worker plays the match to
 * it with the fixture autopilot and refuses to start if the state differs. `tests/unit/scenario-mode-stage12.test.ts`
 * replays every challenge against the engines, so a briefing can never describe a state the engine did not produce.
 *
 * The last four (owner decision 12a, 17 November 2026) start from matches the engine's own autopilot finishes tied; a
 * tie at the end goes to a super over, but only an outright win completes the challenge.
 *
 * Not included: a red-ball "survive day five" challenge. Under the current synthetic model every autopilot five-day match
 * in the seed search finished by day three, so no fixed seed reaches a day-five draw position.
 */
const SCENARIOS: readonly ScenarioChallenge[] = [
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "t20-death-overs-chase",
    title: "Death-overs chase",
    format: "T20",
    difficulty: "HARD",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-scenario-t20-2",
    matchId: "human-t20",
    teamIds: ["team-03", "team-06"],
    groundId: "ground-03",
    playerTeamId: "team-03",
    objective: "WIN",
    objectiveSummary: "Score 23 from the last 24 balls with 5 wickets in hand.",
    briefing:
      "Northlight Ridge are 68 for 5 after 16 overs, chasing 91 against Silver Fen at Northlight Park. You captain the chase: pick your batters and their intent, and see it home.",
    checkpoint: { inningsIndex: 1, legalBalls: 96, revision: 105, battingTeamId: "team-03", runs: 68, wickets: 5, targetToWin: 91 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "t20-tail-end-chase",
    title: "Tail-end chase",
    format: "T20",
    difficulty: "ELITE",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-scenario-t20-12",
    matchId: "human-t20",
    teamIds: ["team-03", "team-06"],
    groundId: "ground-03",
    playerTeamId: "team-06",
    objective: "WIN",
    objectiveSummary: "Score 46 from the last 30 balls with 3 wickets in hand.",
    briefing:
      "Silver Fen have collapsed to 36 for 7 after 15 overs, chasing 82 against Northlight Ridge. Three wickets remain. Find 46 runs before the overs or the batters run out.",
    checkpoint: { inningsIndex: 1, legalBalls: 90, revision: 102, battingTeamId: "team-06", runs: 36, wickets: 7, targetToWin: 82 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "t20-defend-55",
    title: "Hold the line",
    format: "T20",
    difficulty: "STANDARD",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-scenario-t20-11",
    matchId: "human-t20",
    teamIds: ["team-03", "team-06"],
    groundId: "ground-03",
    playerTeamId: "team-03",
    objective: "WIN",
    objectiveSummary: "Stop Silver Fen scoring 55 from the last 30 balls.",
    briefing:
      "Silver Fen are 49 for 4 after 15 overs, chasing 104. You lead Northlight Ridge in the field: choose bowlers, plans and fields for the last five overs.",
    checkpoint: { inningsIndex: 1, legalBalls: 90, revision: 98, battingTeamId: "team-06", runs: 49, wickets: 4, targetToWin: 104 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "t20-defend-19",
    title: "Nineteen to defend",
    format: "T20",
    difficulty: "ELITE",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-scenario-t20-1",
    matchId: "human-t20",
    teamIds: ["team-03", "team-06"],
    groundId: "ground-03",
    playerTeamId: "team-03",
    objective: "WIN",
    objectiveSummary: "Stop Silver Fen scoring 19 from the last 30 balls.",
    briefing:
      "Silver Fen are 52 for 4 after 15 overs, chasing 71. Northlight Ridge need six wickets, or to keep the runs below 19, in the last five overs.",
    checkpoint: { inningsIndex: 1, legalBalls: 90, revision: 99, battingTeamId: "team-06", runs: 52, wickets: 4, targetToWin: 71 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "odi-tail-rescue",
    title: "Lower-order rescue",
    format: "ODI",
    difficulty: "HARD",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-scenario-odi-8",
    matchId: "human-odi",
    teamIds: ["team-02", "team-05"],
    groundId: "ground-02",
    playerTeamId: "team-02",
    objective: "WIN",
    objectiveSummary: "Score 32 more runs with 3 wickets in hand.",
    briefing:
      "Copper Vale are 59 for 7 after 17 overs, chasing 91 against Ember Plains at Copperfield. There is plenty of time and very little batting left. Nurse the tail to the target.",
    checkpoint: { inningsIndex: 1, legalBalls: 102, revision: 133, battingTeamId: "team-02", runs: 59, wickets: 7, targetToWin: 91 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "odi-last-ten",
    title: "Ten runs, two wickets",
    format: "ODI",
    difficulty: "ELITE",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-scenario-odi-2",
    matchId: "human-odi",
    teamIds: ["team-02", "team-05"],
    groundId: "ground-02",
    playerTeamId: "team-05",
    objective: "WIN",
    objectiveSummary: "Take 2 wickets before Copper Vale score 10.",
    briefing:
      "Copper Vale are 134 for 8 after 40 overs, chasing 144. Ember Plains have 60 balls to take the last two wickets before the final 10 runs come.",
    checkpoint: { inningsIndex: 1, legalBalls: 240, revision: 187, battingTeamId: "team-02", runs: 134, wickets: 8, targetToWin: 144 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "red-fourth-innings-chase",
    title: "Fourth-innings chase",
    format: "RED_BALL",
    difficulty: "HARD",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-scenario-red-4",
    matchId: "human-red5",
    teamIds: ["team-04", "team-07"],
    groundId: "ground-04",
    playerTeamId: "team-07",
    objective: "WIN",
    objectiveSummary: "Score 63 more in the fourth innings with 4 wickets in hand.",
    briefing:
      "Larchwood are 41 for 6 in the fourth innings, chasing 104 against Westmere Isles at Westmere Oval. Time is not the problem; wickets are.",
    checkpoint: { inningsIndex: 3, legalBalls: 114, revision: 293, battingTeamId: "team-07", runs: 41, wickets: 6, targetToWin: 104 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "red-fourth-innings-defence",
    title: "Bowl them out",
    format: "RED_BALL",
    difficulty: "HARD",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-scenario-red-5",
    matchId: "human-red5",
    teamIds: ["team-04", "team-07"],
    groundId: "ground-04",
    playerTeamId: "team-04",
    objective: "WIN",
    objectiveSummary: "Take 7 wickets before Larchwood score 63.",
    briefing:
      "Larchwood are 28 for 3 in the fourth innings, chasing 91 at Westmere Oval. Westmere Isles must bowl them out to win.",
    checkpoint: { inningsIndex: 3, legalBalls: 84, revision: 301, battingTeamId: "team-07", runs: 28, wickets: 3, targetToWin: 91 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "t20-super-over-decider",
    title: "Level at the death",
    format: "T20",
    difficulty: "HARD",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-tie-469",
    matchId: "human-t20",
    teamIds: ["team-03", "team-06"],
    groundId: "ground-03",
    playerTeamId: "team-06",
    objective: "WIN",
    objectiveSummary: "Score 12 from the last 12 balls with 2 wickets in hand.",
    briefing:
      "Silver Fen are 71 for 8 after 18 overs, chasing 83 against Northlight Ridge. Left to the engine, this match finishes level. Finish it level and it goes to a super over; only an outright win completes the challenge.",
    checkpoint: { inningsIndex: 1, legalBalls: 108, revision: 109, battingTeamId: "team-06", runs: 71, wickets: 8, targetToWin: 83 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "t20-six-to-defend",
    title: "Six to defend",
    format: "T20",
    difficulty: "ELITE",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-tie-555",
    matchId: "human-t20",
    teamIds: ["team-01", "team-02"],
    groundId: "ground-01",
    playerTeamId: "team-01",
    objective: "WIN",
    objectiveSummary: "Stop Copper Vale scoring 6 from the last 18 balls.",
    briefing:
      "Copper Vale are 70 for 5 after 17 overs, chasing 76 at Aster Quay. Left to the engine, this match ends in a tie. Aster Harbour need five wickets, or to keep the last six runs out, to win outright.",
    checkpoint: { inningsIndex: 1, legalBalls: 102, revision: 98, battingTeamId: "team-02", runs: 70, wickets: 5, targetToWin: 76 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "odi-cup-final-defence",
    title: "Cup final: three wickets",
    format: "ODI",
    difficulty: "HARD",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-odi-tie-8",
    matchId: "human-odi",
    teamIds: ["team-01", "team-02"],
    groundId: "ground-01",
    playerTeamId: "team-01",
    objective: "WIN",
    objectiveSummary: "Take 3 wickets before Copper Vale score 10.",
    briefing:
      "A one-day cup final at Aster Quay. Copper Vale are 65 for 7 after 22 overs, chasing 75. Left to the engine, this final ends in a tie. Aster Harbour need three wickets before the last ten runs come.",
    checkpoint: { inningsIndex: 1, legalBalls: 132, revision: 125, battingTeamId: "team-02", runs: 65, wickets: 7, targetToWin: 75 },
  },
  {
    schemaId: SCENARIO_CHALLENGE_SCHEMA_ID,
    scenarioId: "odi-cup-final-chase",
    title: "Cup final: the tail's turn",
    format: "ODI",
    difficulty: "HARD",
    sourceType: "FICTIONAL_CURATED",
    seed: "lc-odi-tie-95",
    matchId: "human-odi",
    teamIds: ["team-05", "team-08"],
    groundId: "ground-05",
    playerTeamId: "team-08",
    objective: "WIN",
    objectiveSummary: "Score 21 more with 3 wickets in hand.",
    briefing:
      "A one-day cup final at Ember Meadow. Moonstone Bay are 45 for 7 after 11 overs, chasing 66 against Ember Plains. Left to the engine, this final ends in a tie. Find 21 runs before the last three wickets fall.",
    checkpoint: { inningsIndex: 1, legalBalls: 66, revision: 106, battingTeamId: "team-08", runs: 45, wickets: 7, targetToWin: 66 },
  },
];

export const SCENARIO_PACK: readonly ScenarioChallenge[] = Object.freeze(
  SCENARIOS.map((scenario) => Object.freeze(ScenarioChallengeSchema.parse(scenario))),
);

export function scenarioById(scenarioId: string): ScenarioChallenge | null {
  return SCENARIO_PACK.find((scenario) => scenario.scenarioId === scenarioId) ?? null;
}
