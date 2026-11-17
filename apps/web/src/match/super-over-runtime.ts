import type { SuperOverCommand, T20SuperOverRecord } from "@lcxxvi/contracts";
import {
  createT20SuperOver,
  eligibleSuperOverBatters,
  eligibleSuperOverBowlers,
  executeSuperOverCommand,
  isTiedT20Match,
  summariseSuperOver,
  superOverAutopilotCommand,
  superOverPendingTeam,
  superOverRecord,
  verifySuperOverRecord,
  SUPER_OVER_BATTERS,
  type T20Session,
  type T20SuperOverState,
} from "@lcxxvi/simulation";
import type { SuperOverView } from "./protocol.js";

/**
 * Stage 14 super overs in the match worker: which matches qualify, the view the page shows, and applying one action
 * to the stored record. Storage is passed in so this stays testable without IndexedDB.
 */

export type SuperOverStore = {
  load(gameId: string): Promise<T20SuperOverRecord | null>;
  save(record: T20SuperOverRecord, expectedCommands: number): Promise<T20SuperOverRecord>;
};

/** Exhibitions only (owner decision 2a), standard T20 setups only, and only a completed tie. */
export function superOverEligible(session: unknown, careerBound: boolean): session is T20Session {
  const s = session as T20Session | null;
  return (
    !careerBound &&
    !!s &&
    s.setup?.format === "T20" &&
    (s.setup as { setupVersion?: string }).setupVersion === "LC_T20_SETUP_V1" &&
    isTiedT20Match(s)
  );
}

function ballText(event: T20SuperOverState["deliveries"][number]): string {
  if (event.dismissal) return "W";
  const extras = event.extras.wides + event.extras.noBalls + event.extras.byes + event.extras.legByes + event.extras.penalties;
  const total = event.batRuns + extras;
  if (event.extras.wides) return `${total}wd`;
  if (event.extras.noBalls) return `${total}nb`;
  return String(total);
}

export function superOverView(session: T20Session, state: T20SuperOverState | null): SuperOverView {
  const names = Object.fromEntries(session.setup.teams.flatMap((t) => t.xi.map((p) => [p.playerId, p.name])));
  for (const team of session.setup.teams) names[team.teamId] = team.name;
  if (!state)
    return {
      rulesId: "LC_T20_SUPER_OVER_01",
      started: false,
      phase: "NOT_STARTED",
      rounds: [],
      pending: null,
      choices: [],
      battersToName: SUPER_OVER_BATTERS,
      current: null,
      winnerTeamId: null,
      completionReason: null,
      names,
    };
  const pending = superOverPendingTeam(state);
  const choices = pending
    ? (pending.decision === "BATTERS"
        ? eligibleSuperOverBatters(session, state, pending.teamId)
        : eligibleSuperOverBowlers(session, state, pending.teamId)
      ).map((id) => ({ id, name: names[id] ?? id }))
    : [];
  const round = state.rounds[state.rounds.length - 1];
  const innings = round?.innings[round.innings.length - 1] ?? null;
  const ledger = innings?.ledger ?? null;
  const firstOrdinal = ledger ? ledger.nextDeliveryIndex - ledger.innings.deliveryAttempts : 0;
  const current = innings
    ? {
        battingTeamId: innings.battingTeamId,
        bowlingTeamId: innings.bowlingTeamId,
        strikerId: ledger ? (ledger.innings.strikerEnd === "NORTH" ? ledger.innings.northBatterId : ledger.innings.southBatterId) : null,
        nonStrikerId: ledger ? (ledger.innings.strikerEnd === "NORTH" ? ledger.innings.southBatterId : ledger.innings.northBatterId) : null,
        bowlerId: innings.bowlerId,
        runs: ledger?.innings.runs ?? 0,
        wickets: ledger?.innings.wickets ?? 0,
        legalBalls: ledger?.innings.legalBalls ?? 0,
        targetToWin: ledger?.innings.targetToWin ?? null,
        balls: ledger ? state.deliveries.filter((d) => d.deliveryIndex >= firstOrdinal).map(ballText) : [],
      }
    : null;
  return {
    rulesId: "LC_T20_SUPER_OVER_01",
    started: true,
    phase: state.phase,
    rounds: summariseSuperOver(state),
    pending,
    choices,
    battersToName: Math.min(SUPER_OVER_BATTERS, choices.length),
    current,
    winnerTeamId: state.winnerTeamId,
    completionReason: state.completionReason,
    names,
  };
}

export async function loadSuperOverState(session: T20Session, store: SuperOverStore): Promise<{ state: T20SuperOverState | null; commands: SuperOverCommand[] }> {
  const record = await store.load(String(session.setup.gameId));
  if (!record) return { state: null, commands: [] };
  return { state: verifySuperOverRecord(session, record), commands: [...record.commands] };
}

export type SuperOverAction =
  | { kind: "START" }
  | { kind: "COMMAND"; command: SuperOverCommand }
  | { kind: "AI"; teamId: string };

/** Applies one action and stores the result. Returns the new state (unchanged when the action is a no-op). */
export async function applySuperOverAction(session: T20Session, store: SuperOverStore, action: SuperOverAction): Promise<T20SuperOverState> {
  const { state: loaded, commands } = await loadSuperOverState(session, store);
  if (action.kind === "START") {
    if (loaded) return loaded;
    const state = createT20SuperOver(session);
    await store.save(superOverRecord(state, []), 0);
    return state;
  }
  if (!loaded) throw new Error("Start the super over first.");
  let command: SuperOverCommand | null = null;
  if (action.kind === "COMMAND") command = action.command;
  else {
    const pending = superOverPendingTeam(loaded);
    if (pending?.teamId === action.teamId) command = superOverAutopilotCommand(session, loaded);
  }
  if (!command) return loaded;
  const state = executeSuperOverCommand(session, loaded, command);
  await store.save(superOverRecord(state, [...commands, command]), commands.length);
  return state;
}
