import type { T20Command } from "@lcxxvi/contracts";
import {
  createT20Session, executeT20Command, fixtureAutopilotStep,
  type T20Session,
} from "@lcxxvi/simulation";
import type { FrozenT20Setup } from "@lcxxvi/simulation";
import { adviseT20Captain, type TacticalBowlerCandidate, type T20TacticalPublicView } from "@lcxxvi/ai";

/** Extract the smallest public T20 match view required by the policy. Never pass the session or seed to the policy. */
export function publicT20CaptainView(session: Readonly<T20Session>): T20TacticalPublicView | null {
  const ledger = session.core.innings[session.core.activeInningsIndex];
  if (!ledger) return null;
  const i = ledger.innings;
  const bowling = session.setup.teams.find(team => team.teamId === i.bowlingTeamId);
  if (!bowling) throw new Error("LC_AI_BOWLING_TEAM_MISSING");
  const candidates: TacticalBowlerCandidate[] = bowling.xi
    .filter(p => p.bowlingStyle !== null && p.playerId !== bowling.keeperId && p.playerId !== i.previousOverBowlerId)
    .filter(p => ledger.bowling[p.playerId]!.legalBalls < 24)
    .map(p => ({
      playerId: p.playerId,
      control: p.skills.T20.control,
      movement: p.skills.T20.movement,
      variation: p.skills.T20.variation,
      stamina: p.skills.T20.stamina,
      fatigueBp: session.core.fatigueBp[p.playerId] ?? 0,
      legalBallsBowled: ledger.bowling[p.playerId]!.legalBalls,
      quotaRemaining: 24 - ledger.bowling[p.playerId]!.legalBalls,
    }));
  return {
    inningsLegalBalls: i.legalBalls,
    inningsRuns: i.runs,
    wicketsLost: i.wickets,
    targetToWin: i.targetToWin,
    availableBatters: Math.max(0, 10 - i.wickets),
    bowlingCandidates: candidates,
  };
}

/** Additive V1 captain chooses only legal engine commands; accepted LC_T20_MATCH_V1 owns delivery sampling. */
export function tacticalT20Step(session: Readonly<T20Session>): T20Command {
  const fallback = fixtureAutopilotStep(session as T20Session);
  const view = publicT20CaptainView(session);
  if (!view) return fallback;
  const advice = adviseT20Captain(view);
  const base = { expectedRevision: session.revision, commandId: `tactical-${String(session.revision+1).padStart(6,"0")}` };
  const ledger = session.core.innings[session.core.activeInningsIndex]!;
  const i = ledger.innings;
  if (session.core.phase === "AWAITING_BOWLER" && advice.preferredBowlerId) {
    return { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "SET_BOWLER", payload: { teamId: i.bowlingTeamId, bowlerId: advice.preferredBowlerId } };
  }
  if (session.core.phase !== "READY") return fallback;
  const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  if (striker && (session.core.battingPlans[striker]?.aggression ?? 2) !== advice.aggression) {
    return { ...base, actorId: `AI:${i.battingTeamId}`, kind: "SET_BATTING_PLAN", payload: { playerId: striker, aggression: advice.aggression, intent: "NORMAL" } };
  }
  const current = session.core.bowlingPlan;
  if (current && (current.length !== advice.bowlingLength || current.effort !== advice.bowlingEffort)) {
    return { ...base, actorId: `AI:${i.bowlingTeamId}`, kind: "SET_BOWLING_PLAN", payload: { ...current, length: advice.bowlingLength, effort: advice.bowlingEffort } };
  }
  return fallback;
}

/** Fully autonomous tactical run, separate from frozen Pass12D fixture policy and its accepted regression corpus. */
export function runTacticalT20(setup: FrozenT20Setup, maxCommands = 900): T20Session {
  let session = createT20Session(setup);
  while (session.core.phase !== "COMPLETE") {
    if (session.revision >= maxCommands) throw new Error("LC_T20_AI_COMMAND_LIMIT");
    session = executeT20Command(session, tacticalT20Step(session)).session;
  }
  return session;
}
