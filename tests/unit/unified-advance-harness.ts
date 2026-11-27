import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { canonicalJson, type DelegationJournal } from "@lcxxvi/contracts";
import {
  fixtureAutopilotStep, odiFixtureAutopilotStep, red5FixtureAutopilotStep,
  type ODISession, type Red5Session, type T20Session,
} from "@lcxxvi/simulation";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { createODIMatchController } from "../../apps/web/src/match/controller-odi.js";
import { createRed5MatchController } from "../../apps/web/src/match/controller-red5.js";
import {
  advanceWithCaptains, captainSeats, proposeCaptainCommand, unplace,
  type AdvancePort, type AdvanceReport, type AdvanceScope, type CaptainFlags, type CaptainSeat, type UnplacedCommand,
} from "../../apps/web/src/match/advance-with-captains.js";
import { UI_VERSION, type Request } from "../../apps/web/src/match/protocol.js";

/**
 * Directive 03, match integrity (docs/pavilion/UNIFIED_ADVANCE.md). One seed, fixed teams and fixed decision policies,
 * played through every advancement mode the match screen offers, must give the same match: the same events in the same
 * order with the same state hashes, and the same scorecard. The page's modes differ only in which scope they send the
 * worker ("DELIVERY" for "Next delivery", "Next key moment" and passages; "OVER" for "Finish over" and for each step of
 * "Next decision", "Finish innings" and "Finish match") and in where the page stops sending, so each mode is played here
 * by sending those scopes to the same worker logic the match worker runs.
 *
 * Shared by unified-advance.test.ts and unified-advance-red-ball.test.ts (split so the two can run in parallel).
 */
const world = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));

type Format = "T20" | "ODI" | "RED_BALL";
type AnySession = T20Session | ODISession | Red5Session;
type Controller = ReturnType<typeof createMatchController> | ReturnType<typeof createODIMatchController> | ReturnType<typeof createRed5MatchController>;
type Command = Extract<Request, { type: "COMMAND" }>["command"];

/** How the player moves the match on. Each mode maps onto the scopes the page sends. */
export type Mode =
  | { kind: "scope"; scopes: (n: number) => AdvanceScope } // Next delivery, Finish over, batches, or a mix
  | { kind: "old-batch" }; // before Directive 03: ADVANCE { OVER } per command; the computer acts only at its own decisions

export type Setup = { format: Format; seed: string; computer: "first" | "second" | null; delegate?: { side: "first" | "second"; categories: DelegationJournal["changes"][number]["categories"] }; flags?: CaptainFlags };

function controllerFor(format: Format, seed: string): Controller {
  const identity = () => ({ gameId: `game-${seed}`, matchId: `match-${seed}` });
  if (format === "ODI") return createODIMatchController(world, manifest, () => seed, identity);
  if (format === "RED_BALL") return createRed5MatchController(world, manifest, () => seed, identity);
  return createMatchController(world, manifest, () => seed, identity);
}

/** The player's own decisions: a fixed policy (the fixture autopilot's choice), sent as the player's command. */
function playerCommand(session: AnySession): Command {
  const command = session.setup.format === "T20" ? fixtureAutopilotStep(session as T20Session)
    : session.setup.format === "ODI" ? odiFixtureAutopilotStep(session as ODISession)
      : red5FixtureAutopilotStep(session as Red5Session);
  return { ...command, actorId: command.actorId.startsWith("AI:") ? `USER:${command.actorId.slice(3)}` : command.actorId } as Command;
}

export async function play(setup: Setup, mode: Mode) {
  const c = controllerFor(setup.format, setup.seed);
  let serial = 0;
  const boot = c.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: 0, type: "BOOT" });
  const teams = boot.catalog!.teams;
  const started = c.handle({
    version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: 0, type: "START", format: setup.format,
    selections: [teams[0]!.suggested, teams[1]!.suggested], groundId: boot.catalog!.grounds[0]!.id,
  });
  expect(started.error).toBeNull();
  const ids = [teams[0]!.id, teams[1]!.id];
  const aiTeamId = setup.computer === "first" ? ids[0]! : setup.computer === "second" ? ids[1]! : null;
  const delegation: DelegationJournal = { version: "LC_DELEGATION_JOURNAL_V1", changes: setup.delegate
    ? [{ commandId: "ui-delegate", expectedRevision: 0, matchRevision: 1, teamId: setup.delegate.side === "first" ? ids[0]! : ids[1]!, categories: setup.delegate.categories }]
    : [] };
  const flags = setup.flags ?? { matchAware: false, clubStyle: false };
  const session = () => c.snapshot() as AnySession;
  const seats: CaptainSeat[] = captainSeats(session(), aiTeamId, delegation);
  let revision = started.revision;
  const send = (origin: "AI" | "HUMAN", unplaced: UnplacedCommand) => {
    const id = `ui-${++serial}`;
    const r = c.handle({ version: UI_VERSION, type: "COMMAND", origin, requestId: id, expectedRevision: revision,
      command: { ...unplaced, commandId: id, expectedRevision: revision } as Command });
    revision = r.revision;
    return { error: r.error, blocked: Boolean(r.view && r.view.phase === "READY" && r.view.advanceReason) };
  };
  const port: AdvancePort = {
    session,
    propose: (s, seat) => proposeCaptainCommand(s, seat, flags, delegation),
    stopRequested: () => false,
    // Yield to the event loop now and then, as the worker's IndexedDB commits do, so Vitest's RPC keeps running.
    commit: async (origin, unplaced) => {
      if (serial % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      return send(origin, unplaced);
    },
  };
  /** The page's AI_STEP effect: one proposal per request, the first seat with a command, until none has one. */
  const pageAiSteps = () => {
    for (let guard = 0; guard < 200; guard += 1) {
      if (!seats.length) return;
      const s = session();
      const proposal = seats.map(candidate => proposeCaptainCommand(s, candidate, flags, delegation)).find(Boolean);
      if (!proposal) return;
      expect(send("AI", unplace(proposal)).error).toBeNull();
    }
    throw new Error("AI steps did not settle");
  };
  const decider = (s: AnySession) => {
    const command = playerCommand(s);
    return command.actorId.startsWith("USER:") ? command.actorId.slice(5) : null;
  };
  const reports: AdvanceReport[] = [];
  let n = 0;
  for (let step = 0; step < 20_000; step += 1) {
    if (step % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    const s = session();
    if (s.core.phase === "COMPLETE") break;
    if (mode.kind === "scope") {
      pageAiSteps(); // a no-op after every advance: the worker has already asked every seat
      const now = session();
      if (now.core.phase === "COMPLETE") break;
      if (now.core.phase === "READY") {
        const view = c.currentResponse("probe").view!;
        const report = await advanceWithCaptains(port, mode.scopes(n++), seats, Boolean(view.advanceReason));
        expect(report.stop).not.toBe("ERROR");
        expect(report.stop).not.toBe("LIMIT");
        expect(report.stop).not.toBe("BLOCKED");
        if (seats.length) expect(report.consultedBeforeBall).toHaveLength(report.balls);
        // The worker asked every seat after the last ball, so the page has nothing left to ask.
        expect(report.settledRevision).toBe(session().revision);
        reports.push(report);
      } else {
        expect(send("HUMAN", unplace(playerCommand(now))).error).toBeNull();
      }
    } else {
      if (s.core.phase === "READY") {
        expect(send("HUMAN", { kind: "ADVANCE", payload: { scope: "OVER" }, actorId: "SYSTEM" } as UnplacedCommand).error).toBeNull();
      } else if (aiTeamId && decider(s) === aiTeamId) pageAiSteps();
      else expect(send("HUMAN", unplace(playerCommand(s))).error).toBeNull();
    }
  }
  const final = session();
  expect(final.core.phase).toBe("COMPLETE");
  const events = final.events.map(event => `${event.type}|${canonicalJson(event.payload)}|${event.stateHash}`);
  const view = c.currentResponse("final").view!;
  return {
    events,
    deliveries: final.events.filter(event => event.type === "DELIVERY_RECORDED").length,
    captainCommands: final.commands.filter(command => command.actorId.startsWith("AI:")).length,
    commands: final.commands.length,
    scorecard: canonicalJson(view.scorecard),
    result: view.resultText,
    reports,
  };
}

export const delivery: Mode = { kind: "scope", scopes: () => "DELIVERY" };
export const over: Mode = { kind: "scope", scopes: () => "OVER" };
// The player switches between buttons: a fixed irregular pattern of single deliveries and overs.
export const mixed: Mode = { kind: "scope", scopes: n => ([0, 1, 1, 0, 1, 0, 0, 1, 1, 1][n % 10] ? "OVER" : "DELIVERY") };

export function expectSameMatch(a: Awaited<ReturnType<typeof play>>, b: Awaited<ReturnType<typeof play>>) {
  expect(b.events.length).toBe(a.events.length);
  expect(b.events).toEqual(a.events);
  expect(b.scorecard).toBe(a.scorecard);
  expect(b.result).toBe(a.result);
}

