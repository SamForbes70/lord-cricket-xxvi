import { RainCommandSchema, RainMatchRecordSchema, type RainCommand, type RainMatchRecord } from "@lcxxvi/contracts";
import {
  buildRainSetup,
  createRainMatch,
  eligibleRainBatters,
  eligibleRainBowlers,
  executeRainCommand,
  inningsResources,
  parAtStoppage,
  rainAutopilotCommand,
  rainMatchRecord,
  rainPendingDecision,
  rainStateSha256,
  verifyRainMatchRecord,
  type RainMatchState,
  type RainSetup,
  type RainSetupChoices,
} from "@lcxxvi/simulation";
import { createMatchController } from "../match/controller.js";

/**
 * Stage 14 rain-affected exhibitions (owner decisions A1a and A2a, 18 November 2026): the page-facing runtime. It keeps
 * the engine state for the open match, checks every stored record by replaying it on the engine, and turns the state
 * into a view. The view never shows a stoppage before it happens.
 */

export type RainPlayerOption = { id: string; name: string; detail: string };
export type RainInningsView = {
  battingTeamId: string;
  battingName: string;
  score: string;
  overs: string;
  allocationOvers: string;
  target: number | null;
  batters: { id: string; name: string; runs: number; balls: number; onStrike: boolean }[];
  bowler: { id: string; name: string; figures: string } | null;
};
export type RainView = {
  gameId: string;
  format: "T20" | "ODI";
  phase: RainMatchState["phase"];
  teams: { id: string; name: string }[];
  tossWinnerName: string | null;
  innings: RainInningsView[];
  stoppages: string[];
  target: number | null;
  /** During a chase interrupted by rain: the par score at this moment. */
  parNow: number | null;
  pending: { teamId: string; teamName: string; decision: "TOSS" | "INNINGS" | "BATTER" | "BOWLER" } | null;
  options: RainPlayerOption[];
  lastBall: string | null;
  resultText: string | null;
};

export type RainOpenMatch = { record: RainMatchRecord; view: RainView };

const oversText = (balls: number) => `${Math.floor(balls / 6)}${balls % 6 ? `.${balls % 6}` : ""}`;

export function createRainRuntime(worldBytes: Uint8Array, manifest: unknown) {
  const catalog = createMatchController(worldBytes, manifest, () => "rain-catalog").currentResponse("ui-0").catalog;
  if (!catalog) throw new Error("RAIN_CATALOGUE_UNAVAILABLE");
  let open: { setup: RainSetup; state: RainMatchState; commands: RainCommand[] } | null = null;

  const teamName = (id: string) => catalog.teams.find((t) => t.id === id)?.name ?? id;
  const playerName = (setup: RainSetup, id: string) => setup.teams.flatMap((t) => t.xi).find((p) => p.playerId === id)?.name ?? id;

  function choicesFromRecord(record: RainMatchRecord): RainSetupChoices {
    return { format: record.rulesId === "LC_T20_RAIN_01" ? "T20" : "ODI", ...record };
  }

  function describeBall(setup: RainSetup, state: RainMatchState): string | null {
    const d = state.lastDelivery;
    if (!d) return null;
    const extras = Object.values(d.extras).reduce((a, b) => a + b, 0);
    const parts: string[] = [];
    if (d.dismissal) parts.push(`OUT: ${playerName(setup, d.dismissal.playerId)}`);
    if (d.batRuns) parts.push(`${d.batRuns} run${d.batRuns === 1 ? "" : "s"}`);
    if (d.extras.wides) parts.push(`${d.extras.wides} wide${d.extras.wides === 1 ? "" : "s"}`);
    if (d.extras.noBalls) parts.push("no-ball");
    if (d.extras.byes) parts.push(`${d.extras.byes} bye${d.extras.byes === 1 ? "" : "s"}`);
    if (d.extras.legByes) parts.push(`${d.extras.legByes} leg-bye${d.extras.legByes === 1 ? "" : "s"}`);
    if (!parts.length && !extras) parts.push("No run");
    return `${playerName(setup, d.bowlerId)} to ${playerName(setup, d.strikerId)}: ${parts.join(", ")}.`;
  }

  function resultText(state: RainMatchState): string | null {
    const r = state.result;
    if (!r) return null;
    const suffix = r.method === "RESOURCE_TABLE" ? " (rain rules)" : "";
    if (r.kind === "NO_RESULT") return "No result: rain ended play before the minimum overs.";
    if (r.kind === "TIE") return `Match tied${suffix}.`;
    return `${teamName(r.winnerTeamId!)} won by ${r.margin} ${r.marginType === "RUNS" ? (r.margin === 1 ? "run" : "runs") : r.margin === 1 ? "wicket" : "wickets"}${suffix}.`;
  }

  function view(setup: RainSetup, state: RainMatchState, record: RainMatchRecord): RainView {
    const innings: RainInningsView[] = state.innings.map((ledger, index) => {
      const i = ledger.innings;
      const onStrike = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
      return {
        battingTeamId: i.battingTeamId,
        battingName: teamName(i.battingTeamId),
        score: `${i.runs}/${i.wickets}`,
        overs: oversText(i.legalBalls),
        allocationOvers: oversText(state.allocations[index as 0 | 1]),
        target: index === 1 ? state.target : null,
        batters: [i.northBatterId, i.southBatterId]
          .filter((id): id is string => id !== null)
          .map((id) => ({ id, name: playerName(setup, id), runs: ledger.batting[id]!.runs, balls: ledger.batting[id]!.ballsFaced, onStrike: id === onStrike })),
        bowler: i.bowlerId
          ? { id: i.bowlerId, name: playerName(setup, i.bowlerId), figures: `${oversText(ledger.bowling[i.bowlerId]!.legalBalls)}-${ledger.bowling[i.bowlerId]!.runsConceded}-${ledger.bowling[i.bowlerId]!.wickets}` }
          : null,
      };
    });
    const stoppages = state.stoppages.map((s) => {
      const side = teamName(state.innings[s.inningsIndex]!.innings.battingTeamId);
      const at = `${side} ${s.runs}/${s.wickets} after ${oversText(s.legalBalls)} overs`;
      if (s.terminal) return `Rain stopped play for good with ${at}.`;
      const lost = `${oversText(s.ballsLost)} overs lost`;
      return s.inningsIndex === 0
        ? `Rain with ${at}: ${lost}. Each side now has ${oversText(s.allocations[0])} overs.`
        : `Rain with ${at}: ${lost}. ${side} now have ${oversText(s.allocations[1])} overs; revised target ${s.targetAfter}.`;
    });
    let parNow: number | null = null;
    const chase = state.innings[1];
    if (chase && state.phase !== "COMPLETE" && state.stoppages.length) {
      const list = (index: 0 | 1) =>
        state.stoppages.filter((s) => s.inningsIndex === index && !s.terminal).map((s) => ({ ballsBowled: s.legalBalls, wicketsLost: s.wickets, ballsLost: s.ballsLost }));
      parNow = parAtStoppage({
        format: setup.format,
        firstInningsRuns: state.innings[0]!.innings.runs,
        firstResources: inningsResources(setup.format, state.startAllocations[0], list(0)),
        secondResourcesAvailable: inningsResources(setup.format, state.startAllocations[1], list(1)),
        ballsLeft: state.allocations[1] - chase.innings.legalBalls,
        wicketsLost: chase.innings.wickets,
      });
    }
    const pending = rainPendingDecision(setup, state);
    let options: RainPlayerOption[] = [];
    if (pending?.decision === "BATTER") options = eligibleRainBatters(setup, state).map((id) => ({ id, name: playerName(setup, id), detail: "" }));
    if (pending?.decision === "BOWLER") {
      const l = state.innings[state.activeInningsIndex]!;
      options = eligibleRainBowlers(setup, state).map((id) => ({
        id,
        name: playerName(setup, id),
        detail: `${oversText(l.bowling[id]!.legalBalls)} overs, ${l.bowling[id]!.runsConceded} runs, ${l.bowling[id]!.wickets} wickets`,
      }));
    }
    return {
      gameId: record.gameId,
      format: setup.format,
      phase: state.phase,
      teams: setup.teams.map((t) => ({ id: t.teamId, name: teamName(t.teamId) })),
      tossWinnerName: state.tossWinnerId ? teamName(state.tossWinnerId) : null,
      innings,
      stoppages,
      target: state.target,
      parNow,
      pending: pending ? { ...pending, teamName: teamName(pending.teamId) } : null,
      options,
      lastBall: describeBall(setup, state),
      resultText: resultText(state),
    };
  }

  function current(): RainOpenMatch {
    if (!open) throw new Error("No rain match is open.");
    const record = rainMatchRecord(open.setup, open.state, open.commands);
    return { record, view: view(open.setup, open.state, record) };
  }

  /** Makes `record` the open match, replaying it on the engine unless it is already open at that exact state. */
  function ensure(raw: unknown): void {
    const record = RainMatchRecordSchema.parse(raw);
    if (open && open.setup.gameId === record.gameId && open.commands.length === record.commands.length && rainStateSha256(open.state) === record.stateSha256) return;
    const setup = buildRainSetup(choicesFromRecord(record), worldBytes, manifest);
    const state = verifyRainMatchRecord(setup, record);
    open = { setup, state, commands: [...record.commands] };
  }

  function apply(command: RainCommand): void {
    const o = open!;
    o.state = executeRainCommand(o.setup, o.state, RainCommandSchema.parse(command));
    o.commands.push(command);
  }

  return {
    teams: catalog.teams.map((t) => ({ id: t.id, name: t.name })),
    grounds: catalog.grounds.map((g) => ({ id: g.id, name: g.name })),
    start(input: { format: "T20" | "ODI"; gameId: string; matchId: string; seed: string; groundId: string; teamIds: [string, string] }): RainOpenMatch {
      const pick = (id: string) => {
        const team = catalog.teams.find((t) => t.id === id);
        if (!team) throw new Error("Unknown team.");
        return team.suggested;
      };
      if (input.teamIds[0] === input.teamIds[1]) throw new Error("Choose two different teams.");
      const setup = buildRainSetup({ ...input, selectedTeams: [pick(input.teamIds[0]), pick(input.teamIds[1])] }, worldBytes, manifest);
      open = { setup, state: createRainMatch(setup), commands: [] };
      return current();
    },
    open(record: unknown): RainOpenMatch {
      ensure(record);
      return current();
    },
    command(record: unknown, command: RainCommand): RainOpenMatch {
      ensure(record);
      apply(command);
      return current();
    },
    /** The AI captain makes every decision that is not the player's, stopping at the next ball or the player's decision. */
    aiDecisions(record: unknown, playerTeamId: string): RainOpenMatch {
      ensure(record);
      const o = open!;
      for (let guard = 0; guard < 50; guard++) {
        const pending = rainPendingDecision(o.setup, o.state);
        if (!pending || pending.teamId === playerTeamId) break;
        apply(rainAutopilotCommand(o.setup, o.state)!);
      }
      return current();
    },
    /** Both sides on the automatic captain until the match ends. */
    simulateToEnd(record: unknown): RainOpenMatch {
      ensure(record);
      const o = open!;
      for (let guard = 0; o.state.phase !== "COMPLETE" && guard < 4000; guard++) apply(rainAutopilotCommand(o.setup, o.state)!);
      return current();
    },
  };
}
