/** Optional human-v-AI decision boundary. Uses the accepted T20 command engine;
 * no random draws, no competing ball scorer, no hidden seed in the captain view.
 */
import { adviseT20Captain } from "@lcxxvi/ai";
import { fixtureAutopilotStep, type T20Session } from "@lcxxvi/simulation";
import type { T20Command } from "@lcxxvi/contracts";

export type DelegationCategory = "TOSS" | "INNINGS" | "BATTER" | "BOWLER" | "BATTING_PLAN" | "BOWLING_PLAN";

export function proposeOpponentT20Command(session: Readonly<T20Session>, teamId: string, categories?: readonly DelegationCategory[]): T20Command | null {
  const command = proposeT20Command(session, teamId);
  if (!command || !categories) return command;
  const category: Partial<Record<T20Command["kind"], DelegationCategory>> = {
    CALL_TOSS: "TOSS", CHOOSE_INNINGS: "INNINGS", SET_BATTER: "BATTER", SET_BOWLER: "BOWLER",
    SET_BATTING_PLAN: "BATTING_PLAN", SET_BOWLING_PLAN: "BOWLING_PLAN",
  };
  const selected = category[command.kind];
  return selected && categories.includes(selected) ? command : null;
}

function proposeT20Command(session: Readonly<T20Session>, teamId: string): T20Command | null {
  if (!session.setup.teams.some(t => t.teamId === teamId)) throw new Error("LC_T20_AI_UNKNOWN_TEAM");
  const phase = session.core.phase;
  if (phase === "COMPLETE" || phase === "SETUP") return null;
  const i = session.core.innings[session.core.activeInningsIndex]?.innings;
  const base = { commandId: `opponent-${String(session.revision + 1).padStart(6, "0")}`, expectedRevision: session.revision };
  const owned = (cmd: T20Command): T20Command => ({ ...cmd, ...base });
  if (phase === "TOSS" || phase === "AWAITING_INNINGS") {
    const decision = phase === "TOSS" ? session.setup.teams[0]!.teamId : session.core.tossWinnerId;
    if (teamId !== decision) return null;
    return owned(fixtureAutopilotStep(session as T20Session));
  }
  if (!i) return null;
  const batting = i.battingTeamId === teamId;
  const bowling = i.bowlingTeamId === teamId;
  const ledger = session.core.innings[session.core.activeInningsIndex]!;
  const bowlingTeam = session.setup.teams.find(t => t.teamId === i.bowlingTeamId)!;
  const bowlers = bowlingTeam.xi
    .filter(p => p.bowlingStyle && p.playerId !== bowlingTeam.keeperId && p.playerId !== i.previousOverBowlerId)
    .filter(p => ledger.bowling[p.playerId]!.legalBalls < 24)
    .map(p => ({ playerId:p.playerId, control:p.skills.T20.control, movement:p.skills.T20.movement,
      variation:p.skills.T20.variation, stamina:p.skills.T20.stamina, fatigueBp:session.core.fatigueBp[p.playerId] ?? 0,
      legalBallsBowled:ledger.bowling[p.playerId]!.legalBalls,
      quotaRemaining:24 - ledger.bowling[p.playerId]!.legalBalls }));
  const view = { inningsLegalBalls:i.legalBalls, inningsRuns:i.runs, wicketsLost:i.wickets,
    targetToWin:i.targetToWin, availableBatters:Math.max(0,10-i.wickets), bowlingCandidates:bowlers };
  const advice = adviseT20Captain(view);
  if (phase === "AWAITING_BATTER" && batting) return owned(fixtureAutopilotStep(session as T20Session));
  if (phase === "AWAITING_BOWLER" && bowling) {
    if (!advice.preferredBowlerId) return owned(fixtureAutopilotStep(session as T20Session));
    return { ...base, actorId:`AI:${teamId}`, kind:"SET_BOWLER",
      payload:{teamId,bowlerId:advice.preferredBowlerId} };
  }
  if (phase !== "READY") return null;
  if (batting) {
    const striker = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
    if (striker && (session.core.battingPlans[striker]?.aggression ?? 2) !== advice.aggression)
      return { ...base, actorId:`AI:${teamId}`, kind:"SET_BATTING_PLAN",
        payload:{ playerId:striker, aggression:advice.aggression, intent:"NORMAL" } };
  }
  if (bowling && session.core.bowlingPlan) {
    const current=session.core.bowlingPlan;
    if (current.effort !== advice.bowlingEffort || current.length !== advice.bowlingLength)
      return { ...base, actorId:`AI:${teamId}`, kind:"SET_BOWLING_PLAN",
        payload:{...current, length:advice.bowlingLength, effort:advice.bowlingEffort} };
  }
  // Human owns clock/ADVANCE, even when AI decisions are enabled. No automated ball execution.
  return null;
}
