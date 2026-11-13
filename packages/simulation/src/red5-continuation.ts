import {
  executeRed5Command,
  red5FixtureAutopilotStep,
  type Red5Session,
} from "./red-ball-match.js";
import type { FrozenRed5Setup } from "./world-setup.js";

export const RED5_CONTINUATION_DOMAIN_VERSION = "LC_RED5_CONTINUATION_V1" as const;

export interface Red5ContinuationOutcome {
  readonly completed: boolean;
  readonly winnerTeamId: string | null;
  readonly isDraw: boolean;
  readonly isTie: boolean;
  readonly wonByInnings: boolean;
  readonly evaluatingTeamLeadRuns: number;
}

/**
 * Clones a live Red5Session onto an independent planning seed so continuation
 * rollouts never mutate live state, never advance live attempt ordinals, and
 * never peek at future live random draws.
 */
export function cloneRed5SessionForPlanning(
  liveSession: Readonly<Red5Session>,
  branchTag: string,
  rolloutIndex: number,
): Red5Session {
  const cloned = structuredClone(liveSession) as Red5Session;
  const planningSeed = `${RED5_CONTINUATION_DOMAIN_VERSION}:${liveSession.setup.seed}:rev${liveSession.revision}:${branchTag}:r${rolloutIndex}`;
  const clonedSetup: FrozenRed5Setup = {
    ...cloned.setup,
    seed: planningSeed,
  };
  Object.freeze(clonedSetup);
  return {
    ...cloned,
    setup: clonedSetup,
  };
}

function computeTeamLead(session: Red5Session, teamId: string): number {
  const ownRuns = session.core.innings
    .filter(inn => inn.innings.battingTeamId === teamId)
    .reduce((sum, inn) => sum + inn.innings.runs, 0);
  const oppRuns = session.core.innings
    .filter(inn => inn.innings.battingTeamId !== teamId)
    .reduce((sum, inn) => sum + inn.innings.runs, 0);
  return ownRuns - oppRuns;
}

function summariseContinuation(
  session: Red5Session,
  evaluatingTeamId: string,
): Red5ContinuationOutcome {
  const res = session.core.result;
  if (session.core.phase !== "COMPLETE" || !res) {
    return {
      completed: false,
      winnerTeamId: null,
      isDraw: false,
      isTie: false,
      wonByInnings: false,
      evaluatingTeamLeadRuns: computeTeamLead(session, evaluatingTeamId),
    };
  }
  return {
    completed: true,
    winnerTeamId: res.kind === "WIN" ? res.winnerTeamId : null,
    isDraw: res.kind === "DRAW",
    isTie: res.kind === "TIE",
    wonByInnings: res.kind === "WIN" && res.marginType === "INNINGS",
    evaluatingTeamLeadRuns: computeTeamLead(session, evaluatingTeamId),
  };
}

export function simulateRed5DeclarationContinuation(params: {
  readonly liveSession: Readonly<Red5Session>;
  readonly action: "DECLARE_NOW" | "BAT_ON";
  readonly rolloutIndex: number;
  readonly maxCommands: number;
  readonly continueOversBeforeReview: number;
}): Red5ContinuationOutcome {
  const startInningsIndex = params.liveSession.core.activeInningsIndex;
  const activeLedger = params.liveSession.core.innings[startInningsIndex];
  if (!activeLedger || params.liveSession.core.phase !== "READY" || startInningsIndex >= 3) {
    throw new Error("LC_RED5_DECLARATION_EVAL_INVALID_STATE");
  }
  const battingTeamId = activeLedger.innings.battingTeamId;
  const startLegalBalls = activeLedger.innings.legalBalls;
  let sim = cloneRed5SessionForPlanning(params.liveSession, `DECL_${params.action}`, params.rolloutIndex);
  let steps = 0;

  if (params.action === "DECLARE_NOW") {
    sim = executeRed5Command(sim, {
      commandId: `plan-decl-${sim.revision + 1}`,
      expectedRevision: sim.revision,
      actorId: `AI:${battingTeamId}`,
      kind: "DECLARE",
      payload: { teamId: battingTeamId },
    }).session;
    steps++;
  }

  while (sim.core.phase !== "COMPLETE" && steps < params.maxCommands) {
    if (
      params.action === "BAT_ON" &&
      sim.core.phase === "READY" &&
      sim.core.activeInningsIndex === startInningsIndex
    ) {
      const cur = sim.core.innings[startInningsIndex]!;
      if (cur.innings.legalBalls - startLegalBalls >= params.continueOversBeforeReview * 6) {
        sim = executeRed5Command(sim, {
          commandId: `plan-baton-decl-${sim.revision + 1}`,
          expectedRevision: sim.revision,
          actorId: `AI:${battingTeamId}`,
          kind: "DECLARE",
          payload: { teamId: battingTeamId },
        }).session;
        steps++;
        continue;
      }
    }
    sim = executeRed5Command(sim, red5FixtureAutopilotStep(sim)).session;
    steps++;
  }

  return summariseContinuation(sim, battingTeamId);
}

export function simulateRed5FollowOnContinuation(params: {
  readonly liveSession: Readonly<Red5Session>;
  readonly action: "ENFORCE" | "BAT_AGAIN";
  readonly rolloutIndex: number;
  readonly maxCommands: number;
}): Red5ContinuationOutcome {
  if (params.liveSession.core.phase !== "AWAITING_FOLLOW_ON" || !params.liveSession.core.battingFirstId) {
    throw new Error("LC_RED5_FOLLOW_ON_EVAL_INVALID_STATE");
  }
  const evaluatingTeamId = params.liveSession.core.battingFirstId;
  let sim = cloneRed5SessionForPlanning(params.liveSession, `FO_${params.action}`, params.rolloutIndex);
  sim = executeRed5Command(sim, {
    commandId: `plan-fo-${sim.revision + 1}`,
    expectedRevision: sim.revision,
    actorId: `AI:${evaluatingTeamId}`,
    kind: "CHOOSE_FOLLOW_ON",
    payload: { teamId: evaluatingTeamId, enforce: params.action === "ENFORCE" },
  }).session;

  let steps = 1;
  while (sim.core.phase !== "COMPLETE" && steps < params.maxCommands) {
    // In BAT_AGAIN rollouts, declare the 3rd innings once a commanding 360+ lead is reached on Day 4+ so rollouts resolve realistically.
    if (
      params.action === "BAT_AGAIN" &&
      sim.core.phase === "READY" &&
      sim.core.activeInningsIndex === 2 &&
      sim.core.clock.day >= 4 &&
      computeTeamLead(sim, evaluatingTeamId) >= 360
    ) {
      sim = executeRed5Command(sim, {
        commandId: `plan-fo-decl-${sim.revision + 1}`,
        expectedRevision: sim.revision,
        actorId: `AI:${evaluatingTeamId}`,
        kind: "DECLARE",
        payload: { teamId: evaluatingTeamId },
      }).session;
      steps++;
      continue;
    }
    sim = executeRed5Command(sim, red5FixtureAutopilotStep(sim)).session;
    steps++;
  }

  return summariseContinuation(sim, evaluatingTeamId);
}
