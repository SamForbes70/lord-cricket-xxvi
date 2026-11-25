import type { ScenarioChallenge, ScenarioCheckpoint } from "@lcxxvi/contracts";
import {
  executeODICommand,
  executeRed5Command,
  executeT20Command,
  fixtureAutopilotStep,
  odiFixtureAutopilotStep,
  red5FixtureAutopilotStep,
  type ODISession,
  type Red5Session,
  type T20Session,
} from "@lcxxvi/simulation";
import { UI_VERSION, type Request, type Response, type Selection } from "./protocol.js";

/**
 * Stage 12 scenario start. Plays a fixed-seed match forward with the engine's own fixture autopilot (the same
 * deterministic step used for simulated career fixtures) until the challenge checkpoint, entirely in memory, then hands
 * the session back to the controller in one restore. The caller commits it once.
 */

type AnySession = T20Session | ODISession | Red5Session;
export type ScenarioController = {
  handle(request: Request): Response;
  snapshot(): AnySession | null;
  restore(raw: unknown): void;
  currentResponse(requestId: string, error?: string | null): Response;
};

/** Upper bound on autopilot commands before a checkpoint; a five-day match uses well under 1,000. */
export const SCENARIO_FAST_FORWARD_LIMIT = 4000;

type InningsView = { battingTeamId: string; legalBalls: number; runs: number; wickets: number; targetToWin: number | null };

function activeInnings(session: AnySession): InningsView | null {
  const ledger = session.core.innings[session.core.activeInningsIndex] as { innings: InningsView } | undefined;
  return ledger ? ledger.innings : null;
}

export function scenarioCheckpointReached(session: AnySession, checkpoint: Pick<ScenarioCheckpoint, "inningsIndex" | "legalBalls">): boolean {
  const innings = activeInnings(session);
  return (
    session.core.phase !== "COMPLETE" &&
    session.core.activeInningsIndex === checkpoint.inningsIndex &&
    innings !== null &&
    innings.legalBalls >= checkpoint.legalBalls
  );
}

/** The pinned description of a session at a checkpoint. */
export function describeScenarioCheckpoint(session: AnySession, inningsIndex: number, legalBalls: number): ScenarioCheckpoint {
  const innings = activeInnings(session);
  if (!innings) throw new Error("SCENARIO_CHECKPOINT_NO_INNINGS");
  return {
    inningsIndex,
    legalBalls,
    revision: session.revision,
    battingTeamId: innings.battingTeamId,
    runs: innings.runs,
    wickets: innings.wickets,
    targetToWin: innings.targetToWin ?? null,
  };
}

function autopilotStep(session: AnySession): AnySession {
  if (session.setup.format === "T20") {
    const s = session as T20Session;
    return executeT20Command(s, fixtureAutopilotStep(s)).session;
  }
  if (session.setup.format === "ODI") {
    const s = session as ODISession;
    return executeODICommand(s, odiFixtureAutopilotStep(s)).session;
  }
  const s = session as Red5Session;
  return executeRed5Command(s, red5FixtureAutopilotStep(s)).session;
}

/** Plays a started session forward to the checkpoint. Throws if the match ends first or the limit is hit. */
export function playToScenarioCheckpoint(start: AnySession, checkpoint: Pick<ScenarioCheckpoint, "inningsIndex" | "legalBalls">): AnySession {
  let session = start;
  for (let steps = 0; !scenarioCheckpointReached(session, checkpoint); steps += 1) {
    if (session.core.phase === "COMPLETE") throw new Error("SCENARIO_CHECKPOINT_UNREACHED");
    if (steps >= SCENARIO_FAST_FORWARD_LIMIT) throw new Error("SCENARIO_FAST_FORWARD_LIMIT");
    session = autopilotStep(session);
  }
  return session;
}

/**
 * The eleven a curated scenario side fields. The scenario pack pins each challenge's checkpoint (score, batters at the
 * crease, overs left), and those were produced with the suggested eleven of the time: the keeper, the first six
 * bowling-capable players, then squad order. Pavilion P04 stage A changed the suggested eleven for new matches, so the
 * pack keeps its own rule here and its curated situations do not move. A new pack version may adopt the new eleven.
 */
export function scenarioPackEleven(team: { id: string; players: readonly { id: string; role: string; canBowl: boolean }[] }): Selection {
  const keeper = team.players.find((p) => p.role === "KEEPER");
  if (!keeper) throw new Error("SCENARIO_TEAM_HAS_NO_KEEPER");
  const bowlers = team.players.filter((p) => p.id !== keeper.id && p.canBowl).slice(0, 6);
  const xi = [keeper, ...bowlers, ...team.players.filter((p) => p !== keeper && !bowlers.includes(p))].slice(0, 11);
  return { teamId: team.id, playerIds: xi.map((p) => p.id), captainId: keeper.id, keeperId: keeper.id };
}

/**
 * Starts `challenge` on a controller that has no session and was created with `() => challenge.seed`.
 * Returns the controller's response at the checkpoint; the controller then holds the checkpoint session.
 */
export function startScenarioOnController(controller: ScenarioController, challenge: ScenarioChallenge, requestId: string): Response {
  if (controller.snapshot()) throw new Error("SCENARIO_CONTROLLER_BUSY");
  const catalog = controller.currentResponse(requestId).catalog;
  if (!catalog) throw new Error("SCENARIO_CATALOGUE_UNAVAILABLE");
  const pick = (teamId: string): Selection => {
    const team = catalog.teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new Error("SCENARIO_TEAM_UNKNOWN");
    return scenarioPackEleven(team);
  };
  const selections: [Selection, Selection] = [pick(challenge.teamIds[0]), pick(challenge.teamIds[1])];
  const started = controller.handle({
    version: UI_VERSION,
    requestId,
    expectedRevision: 0,
    type: "START",
    format: challenge.format,
    selections,
    groundId: challenge.groundId,
  });
  if (started.error) throw new Error(started.error);
  const session = controller.snapshot();
  if (!session) throw new Error("SCENARIO_START_FAILED");
  const reached = playToScenarioCheckpoint(session, challenge.checkpoint);
  const described = describeScenarioCheckpoint(reached, challenge.checkpoint.inningsIndex, challenge.checkpoint.legalBalls);
  if (JSON.stringify(described) !== JSON.stringify(challenge.checkpoint)) throw new Error("SCENARIO_CHECKPOINT_MISMATCH");
  controller.restore(reached);
  return controller.currentResponse(requestId);
}

/** The match result as the engines record it, reduced to what a scenario objective needs. */
export type ScenarioMatchResult = {
  kind: "WIN" | "TIE" | "DRAW" | "NO_RESULT";
  winnerTeamId: string | null;
  marginType: "RUNS" | "WICKETS" | "INNINGS" | null;
  marginRuns: number | null;
  marginWickets: number | null;
};

export function scenarioResultOf(session: AnySession): ScenarioMatchResult | null {
  const result = session.core.result as ScenarioMatchResult | null;
  if (session.core.phase !== "COMPLETE" || !result) return null;
  return {
    kind: result.kind,
    winnerTeamId: result.winnerTeamId ?? null,
    marginType: result.marginType ?? null,
    marginRuns: result.marginRuns ?? null,
    marginWickets: result.marginWickets ?? null,
  };
}
