import type { Action } from "./protocol.js";

/**
 * Own-side tactical controls. In a match where the computer captain runs one side (career and other managed matches,
 * quick matches, exhibitions with a computer opponent, scenarios), the person at this screen sets batting plans,
 * bowling plans and the field only for the side they manage. The computer captain sets the other side's plans.
 *
 * This is an input-layer rule only. The engine, the match worker and the controller keep accepting such commands, so a
 * saved match or replay that already holds one (made before this rule) rehydrates exactly as before.
 * With no computer side ("Manual control of both teams") the person runs both sides and every control stays enabled.
 */

/** The accessible explanation shown beside a control the person cannot use. */
export const OPPOSITION_CAPTAIN_NOTE = "Set by the opposition captain";

/** Whether the person at this screen may set plans for the given side. */
export function personControlsSide(aiTeamId: string | null | undefined, teamId: string | null | undefined): boolean {
  return !aiTeamId || !teamId || teamId !== aiTeamId;
}

type InningsSides = { battingTeamId: string; bowlingTeamId: string } | null | undefined;

const PLAN_KINDS = new Set<Action["kind"]>(["SET_BATTING_PLAN", "SET_BOWLING_PLAN", "SET_FIELD"]);

/** The side a plan or field command acts for, resolved the same way the match screen and controller resolve it. */
export function planCommandSide(action: Action, innings: InningsSides): string | undefined {
  if ("teamId" in action.payload && typeof action.payload.teamId === "string") return action.payload.teamId;
  return action.kind === "SET_BATTING_PLAN" ? innings?.battingTeamId : innings?.bowlingTeamId;
}

/**
 * False only for a batting plan, bowling plan or field command for the side the computer captain runs. The match
 * screen refuses to send such a command; every other command is unaffected.
 */
export function mayIssuePlanCommand(action: Action, innings: InningsSides, aiTeamId: string | null | undefined): boolean {
  if (!PLAN_KINDS.has(action.kind)) return true;
  return personControlsSide(aiTeamId, planCommandSide(action, innings));
}

/** Which plan controls the person may use in the current innings: the batting side's, the bowling side's, or both. */
export function ownSideControls(innings: InningsSides, aiTeamId: string | null | undefined): {
  batting: boolean;
  bowling: boolean;
} {
  return {
    batting: personControlsSide(aiTeamId, innings?.battingTeamId),
    bowling: personControlsSide(aiTeamId, innings?.bowlingTeamId),
  };
}
