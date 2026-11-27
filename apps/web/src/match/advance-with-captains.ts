/**
 * Directive 03, match integrity: one path for every way the player moves a match on.
 *
 * Before this module the computer captain (and any delegated choice) acted through the page: the page sent one
 * `AI_STEP` after each reply, so "Next delivery" and "Finish over" consulted it before every ball, while "Next
 * decision", "Finish innings", "Finish match" and "Next key moment" did not. The same match could give a different
 * result depending on the button pressed (docs/pavilion/UNIFIED_ADVANCE.md).
 *
 * Here the match worker plays the balls itself. Before every ball, and after the last one, it asks each computer seat
 * for its next command until none has one (the same order and the same proposal functions `AI_STEP` uses), then bowls
 * one delivery. Every engine command is still committed on its own through the worker's atomic save path, so the saved
 * command log has the same shape as before: AI commands with origin AI, deliveries as `ADVANCE` with actor SYSTEM.
 *
 * Pure: no IndexedDB, no worker globals. The worker supplies the port; the unit tests supply an in-memory one.
 */
import { delegationForTeam, redBallProfileForTeam, type DelegationJournal, type RedBallTacticalProfile } from "@lcxxvi/contracts";
import type { ODISession, Red5Session, T20Session } from "@lcxxvi/simulation";
import { proposeOpponentODICommand, proposeOpponentRed5Command, proposeOpponentT20Command } from "./ai-opponent.js";
import { ADVANCE_WITH_CAPTAINS_VERSION, type Request } from "./protocol.js";

export { ADVANCE_WITH_CAPTAINS_VERSION };

type AnySession = T20Session | ODISession | Red5Session;
export type EngineCommand = Extract<Request, { type: "COMMAND" }>["command"];
/** A command as a proposal or an advance supplies it: the port gives it its id and expected revision. */
export type UnplacedCommand = { [K in EngineCommand["kind"]]: Omit<Extract<EngineCommand, { kind: K }>, "commandId" | "expectedRevision"> }[EngineCommand["kind"]];

/** A side the computer acts for: the tactical captain's own side, or a side with delegated choices. */
export type CaptainSeat = { teamId: string; delegated: boolean };
export type CaptainFlags = { matchAware?: boolean | undefined; clubStyle?: boolean | undefined; redBallProfile?: RedBallTacticalProfile | undefined };

/** "DELIVERY": one ball. "OVER": to the end of the current over. Both stop earlier at a decision that is the player's. */
export type AdvanceScope = "DELIVERY" | "OVER";
export type AdvanceStop =
  | "BALL" // the one ball of a DELIVERY advance was bowled
  | "OVER" // the over ended
  | "INNINGS" // the innings ended (and the over with it)
  | "DECISION" // a choice is due that no computer seat makes
  | "COMPLETE"
  | "BLOCKED" // the engine cannot bowl (for example, the field is illegal for the new striker)
  | "STOPPED" // the player asked to stop
  | "LIMIT"
  | "ERROR";

export type AdvanceReport = {
  version: typeof ADVANCE_WITH_CAPTAINS_VERSION;
  scope: AdvanceScope;
  stop: AdvanceStop;
  balls: number;
  /** Engine commands committed by this request, including the computer's. */
  commands: number;
  captainCommands: number;
  /** The seats consulted, in order ("opponent:<team>" or "delegated:<team>"). */
  seats: string[];
  /**
   * For each ball bowled, the revision at which every seat had been asked and had nothing more to do, immediately
   * before that ball. Its length equals `balls` whenever there is at least one seat.
   */
  consultedBeforeBall: number[];
  /** The revision at which every seat was last asked and had nothing to do, if that is the final revision. */
  settledRevision: number | null;
};

/** The seats in the order the page has always asked them: the tactical captain first, then delegated sides. */
export function captainSeats(session: Readonly<AnySession>, aiTeamId: string | null, delegation: DelegationJournal): CaptainSeat[] {
  const teams = session.setup.teams.map(team => team.teamId);
  return [
    ...(aiTeamId && teams.includes(aiTeamId) ? [{ teamId: aiTeamId, delegated: false }] : []),
    ...teams.filter(teamId => teamId !== aiTeamId && delegationForTeam(delegation, teamId).length > 0).map(teamId => ({ teamId, delegated: true })),
  ];
}

/** The command without its id and expected revision, which the port assigns when it commits. */
export function unplace(command: EngineCommand): UnplacedCommand {
  const copy: Partial<EngineCommand> = { ...command };
  delete copy.commandId;
  delete copy.expectedRevision;
  return copy as UnplacedCommand;
}

export function seatKey(seat: CaptainSeat): string {
  return `${seat.delegated ? "delegated" : "opponent"}:${seat.teamId}`;
}

/** The one proposal `AI_STEP` makes for a seat; shared so both paths choose identically. */
export function proposeCaptainCommand(session: Readonly<AnySession>, seat: CaptainSeat, flags: CaptainFlags, delegation: DelegationJournal): EngineCommand | null {
  const delegatedCategories = seat.delegated ? delegationForTeam(delegation, seat.teamId) : undefined;
  const profile = flags.redBallProfile ?? redBallProfileForTeam(delegation, seat.teamId);
  return session.setup.format === "T20"
    ? proposeOpponentT20Command(session as T20Session, seat.teamId, delegatedCategories, !seat.delegated && flags.matchAware, !seat.delegated && flags.clubStyle)
    : session.setup.format === "ODI"
      ? proposeOpponentODICommand(session as ODISession, seat.teamId, delegatedCategories)
      : proposeOpponentRed5Command(session as Red5Session, seat.teamId, profile, delegatedCategories);
}

export interface AdvancePort {
  /** A snapshot of the authoritative match state. */
  session(): AnySession;
  /** The computer's proposal for a seat in this state, or null. */
  propose(session: AnySession, seat: CaptainSeat): EngineCommand | null;
  /**
   * Executes and durably commits one engine command, exactly as a single request would. `blocked` is true when the
   * engine could not bowl the next ball in the resulting state (the page's `advanceReason` while READY).
   */
  commit(origin: "AI" | "HUMAN", command: UnplacedCommand): Promise<{ error: string | null; blocked: boolean }>;
  /** True once the player has asked this advance to stop. Checked only after the first ball. */
  stopRequested(): boolean;
}

/** Engine commands one request may commit. A whole over with every plan changing is far below it. */
export const ADVANCE_COMMAND_LIMIT = 120;

function position(session: AnySession) {
  const inningsIndex = session.core.activeInningsIndex;
  const legalBalls = session.core.innings[inningsIndex]?.innings.legalBalls ?? 0;
  return { phase: session.core.phase as string, inningsIndex, over: Math.floor(legalBalls / 6), revision: session.revision };
}

export async function advanceWithCaptains(
  port: AdvancePort,
  scope: AdvanceScope,
  seats: readonly CaptainSeat[],
  initiallyBlocked: boolean,
  limit = ADVANCE_COMMAND_LIMIT,
): Promise<AdvanceReport> {
  const report: AdvanceReport = {
    version: ADVANCE_WITH_CAPTAINS_VERSION, scope, stop: "ERROR", balls: 0, commands: 0, captainCommands: 0,
    seats: seats.map(seatKey), consultedBeforeBall: [], settledRevision: null,
  };
  let blocked = initiallyBlocked;
  const first = port.session();
  const start = position(first);

  // Ask every seat, in order, until none has a command. After any command the first seat is asked again, which is
  // what the page's AI_STEP effect did: each committed step changed the revision and made every seat due again.
  let current: AnySession | null = first;
  async function settle(): Promise<{ stop: AdvanceStop | null; session: AnySession }> {
    for (;;) {
      const session = current ?? port.session();
      current = null;
      if (session.core.phase === "COMPLETE") return { stop: null, session };
      let acted = false;
      for (const seat of seats) {
        const command = port.propose(session, seat);
        if (!command) continue;
        if (report.commands >= limit) return { stop: "LIMIT", session };
        const result = await port.commit("AI", unplace(command));
        report.commands += 1;
        report.captainCommands += 1;
        if (result.error) return { stop: "ERROR", session };
        blocked = result.blocked;
        acted = true;
        break;
      }
      if (!acted) return { stop: null, session };
    }
  }

  // With no seat there is nobody to ask between balls, so an over is one engine command, as it always was: the
  // engine bowls the same balls (each ball's draws are keyed by its attempt ordinal) and saves one command, not six.
  if (seats.length === 0) {
    if (start.phase === "COMPLETE") report.stop = "COMPLETE";
    else if (start.phase !== "READY") report.stop = "DECISION";
    else if (blocked) report.stop = "BLOCKED";
    else {
      const result = await port.commit("HUMAN", { kind: "ADVANCE", payload: { scope }, actorId: "SYSTEM" } as UnplacedCommand);
      if (result.error) return report;
      report.commands = 1;
      const after = position(port.session());
      // The ball count is not needed without seats; report one advance.
      report.balls = after.revision > start.revision ? 1 : 0;
      report.stop = after.phase === "COMPLETE" ? "COMPLETE" : after.inningsIndex !== start.inningsIndex ? "INNINGS"
        : after.phase !== "READY" ? "DECISION" : scope === "DELIVERY" ? "BALL" : "OVER";
    }
    report.settledRevision = port.session().revision;
    return report;
  }

  for (;;) {
    const settled = await settle();
    if (settled.stop) { report.stop = settled.stop; return report; }
    const now = position(settled.session);
    const stop: AdvanceStop | null =
      now.phase === "COMPLETE" ? "COMPLETE"
        : report.balls > 0 && now.inningsIndex !== start.inningsIndex ? "INNINGS"
          : now.phase !== "READY" ? "DECISION"
            : report.balls > 0 && scope === "DELIVERY" ? "BALL"
              : report.balls > 0 && now.over !== start.over ? "OVER"
                : blocked ? "BLOCKED"
                  : report.balls > 0 && port.stopRequested() ? "STOPPED"
                    : report.commands >= limit ? "LIMIT"
                      : null;
    if (stop) {
      report.stop = stop;
      report.settledRevision = now.revision;
      return report;
    }
    report.consultedBeforeBall.push(now.revision);
    const result = await port.commit("HUMAN", { kind: "ADVANCE", payload: { scope: "DELIVERY" }, actorId: "SYSTEM" } as UnplacedCommand);
    report.commands += 1;
    if (result.error) return report;
    report.balls += 1;
    blocked = result.blocked;
  }
}
