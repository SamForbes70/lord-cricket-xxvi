import type { CustomCompetition, TournamentFixture, TournamentResult } from "@lcxxvi/contracts";
import {
  createT20SuperOver,
  executeODICommand,
  executeSuperOverCommand,
  executeT20Command,
  fixtureAutopilotStep,
  odiFixtureAutopilotStep,
  superOverAutopilotCommand,
  type ODISession,
  type T20Session,
} from "@lcxxvi/simulation";
import { createMatchController } from "../match/controller.js";
import { createODIMatchController } from "../match/controller-odi.js";
import { UI_VERSION, type Selection } from "../match/protocol.js";

/**
 * Stage 15: plays one tournament fixture on the authoritative engine. Each side fields the world's suggested XI; both
 * captains use the engines' fixture autopilot. The seed and match id are fixed per run and fixture, so a run replays
 * exactly. A tied semi-final or final goes to super overs (Stage 14 rules, autopilot choices).
 */
export function fixtureSeed(runSeed: string, fixtureId: string): string {
  return `${runSeed}:${fixtureId}`;
}

function overs(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function playTournamentFixture(input: {
  competition: CustomCompetition;
  fixture: TournamentFixture;
  runId: string;
  runSeed: string;
  worldBytes: Uint8Array;
  worldManifest: unknown;
  teamName: (teamId: string) => string;
}): TournamentResult {
  const { competition, fixture } = input;
  const seed = fixtureSeed(input.runSeed, fixture.fixtureId);
  const identity = () => ({ gameId: `tour-${input.runId}-m${fixture.matchNumber}`.slice(0, 128), matchId: `tour-m${fixture.matchNumber}` });
  const ctl =
    competition.format === "T20"
      ? createMatchController(input.worldBytes, input.worldManifest, () => seed, identity)
      : createODIMatchController(input.worldBytes, input.worldManifest, () => seed, identity);
  const catalog = ctl.currentResponse("ui-0").catalog;
  if (!catalog) throw new Error("TOURNAMENT_CATALOGUE_UNAVAILABLE");
  const pick = (teamId: string): Selection => {
    const team = catalog.teams.find((t) => t.id === teamId);
    if (!team) throw new Error("TOURNAMENT_TEAM_UNKNOWN");
    return team.suggested;
  };
  const started = ctl.handle({
    version: UI_VERSION,
    requestId: "ui-1",
    expectedRevision: 0,
    type: "START",
    format: competition.format,
    selections: [pick(fixture.homeTeamId), pick(fixture.awayTeamId)],
    groundId: fixture.groundId,
  });
  if (started.error) throw new Error(started.error);
  let session = ctl.snapshot() as T20Session | ODISession;
  while (session.core.phase !== "COMPLETE") {
    session =
      session.setup.format === "T20"
        ? executeT20Command(session as T20Session, fixtureAutopilotStep(session as T20Session)).session
        : executeODICommand(session as ODISession, odiFixtureAutopilotStep(session as ODISession)).session;
  }
  const result = session.core.result!;
  const inningsOf = (teamId: string) => session.core.innings.find((l) => l.innings.battingTeamId === teamId)!.innings;
  const home = inningsOf(fixture.homeTeamId);
  const away = inningsOf(fixture.awayTeamId);
  let superOverWinnerTeamId: string | null = null;
  if (result.kind === "TIE" && (fixture.stage === "SEMI_FINAL" || fixture.stage === "FINAL")) {
    let state = createT20SuperOver(session);
    while (state.phase !== "COMPLETE") state = executeSuperOverCommand(session, state, superOverAutopilotCommand(session, state)!);
    superOverWinnerTeamId = state.winnerTeamId;
  }
  const score = (teamId: string, i: { runs: number; wickets: number; legalBalls: number }) =>
    `${input.teamName(teamId)} ${i.runs}/${i.wickets} (${overs(i.legalBalls)})`;
  const margin =
    result.kind === "WIN"
      ? result.marginType === "WICKETS"
        ? `by ${result.marginWickets} wicket${result.marginWickets === 1 ? "" : "s"}`
        : `by ${result.marginRuns} run${result.marginRuns === 1 ? "" : "s"}`
      : "";
  const headline =
    result.kind === "WIN"
      ? `${input.teamName(result.winnerTeamId)} won ${margin}`
      : superOverWinnerTeamId
        ? `Tied; ${input.teamName(superOverWinnerTeamId)} won the super over`
        : "Tied";
  return {
    fixtureId: fixture.fixtureId,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    resultKind: result.kind === "WIN" ? "WIN" : "TIE",
    winnerTeamId: result.kind === "WIN" ? result.winnerTeamId : null,
    superOverWinnerTeamId,
    homeRuns: home.runs,
    homeWickets: home.wickets,
    homeLegalBalls: home.legalBalls,
    awayRuns: away.runs,
    awayWickets: away.wickets,
    awayLegalBalls: away.legalBalls,
    resultText: `${headline}. ${score(fixture.homeTeamId, home)}; ${score(fixture.awayTeamId, away)}.`.slice(0, 160),
    lastEventHash: session.lastEventHash,
  };
}
