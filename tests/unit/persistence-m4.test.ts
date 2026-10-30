import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson, WorldPackSchema } from "@lcxxvi/contracts";
import { createNewGameWorldCopy } from "../../apps/web/src/world/new-game-world.js";
import { rewriteZipEntryText } from "../helpers/rewrite-zip-entry.js";
import { createPortableArchive, readPortableArchive, type SaveSummary } from "@lcxxvi/persistence";
import { rehydrateT20Session } from "@lcxxvi/simulation";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { ARCHIVE_PINS, UI_VERSION, type Action } from "../../apps/web/src/match/protocol.js";

const worldBytes = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));

function sessionAfterPlay() {
  const controller = createMatchController(
    worldBytes,
    manifest,
    () => "pass09-persistence-seed",
    () => ({ gameId: "game-pass09", matchId: "match-pass09" }),
  );
  let serial = 0;
  let response = controller.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: 0, type: "BOOT" });
  const send = (body: object) => {
    response = controller.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: response.revision, ...body });
    expect(response.error).toBeNull();
    return response;
  };
  const teams = response.catalog!.teams;
  send({ type: "START", selections: [teams[0]!.suggested, teams[1]!.suggested], groundId: response.catalog!.grounds[0]!.id });
  const act = (action: Action) => {
    const view = response.view!;
    const innings = view.innings[view.activeIndex]?.innings;
    const teamId = "teamId" in action.payload ? action.payload.teamId : innings?.bowlingTeamId;
    return send({
      type: "COMMAND",
      origin: "HUMAN",
      command: {
        ...action,
        commandId: `ui-${serial + 1}`,
        expectedRevision: response.revision,
        actorId: action.kind === "ADVANCE" ? "SYSTEM" : `USER:${teamId}`,
      },
    });
  };
  for (let steps = 0; steps < 14; steps++) {
    const view = response.view!;
    if (view.phase === "TOSS") act({ kind: "CALL_TOSS", payload: { teamId: view.decisionTeamId!, call: "HEADS" } });
    else if (view.phase === "AWAITING_INNINGS") act({ kind: "CHOOSE_INNINGS", payload: { teamId: view.decisionTeamId!, choice: "BAT" } });
    else if (view.phase === "AWAITING_BATTER") act({ kind: "SET_BATTER", payload: { teamId: view.decisionTeamId!, playerId: view.candidates.find((p) => !p.reason)!.id } });
    else if (view.phase === "AWAITING_BOWLER") act({ kind: "SET_BOWLER", payload: { teamId: view.decisionTeamId!, bowlerId: view.candidates.find((p) => !p.reason)!.id } });
    else act({ kind: "ADVANCE", payload: { scope: "DELIVERY" } });
  }
  return controller.snapshot()!;
}

function summaryFor(session: ReturnType<typeof sessionAfterPlay>): SaveSummary {
  return {
    saveId: "auto:game-pass09",
    kind: "AUTO",
    title: `${session.setup.teams[0].name} v ${session.setup.teams[1].name}`,
    matchGameId: session.setup.gameId,
    matchId: session.setup.matchId,
    teams: [session.setup.teams[0].name, session.setup.teams[1].name],
    ground: session.setup.ground.name,
    phase: session.core.phase,
    revision: session.revision,
    eventCount: session.events.length,
    lastEventHash: session.lastEventHash,
    updatedAt: "2026-10-04T02:00:00.000Z",
    completed: session.core.phase === "COMPLETE",
  };
}

function tamperEntry(bytes: Uint8Array, entryName: string): Uint8Array {
  const out = Uint8Array.from(bytes);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 < out.length) {
    const sig = out[offset]! | (out[offset + 1]! << 8) | (out[offset + 2]! << 16) | (out[offset + 3]! << 24);
    if ((sig >>> 0) !== 0x04034b50) break;
    const size = (out[offset + 22]! | (out[offset + 23]! << 8) | (out[offset + 24]! << 16) | (out[offset + 25]! << 24)) >>> 0;
    const nameLen = out[offset + 26]! | (out[offset + 27]! << 8);
    const extraLen = out[offset + 28]! | (out[offset + 29]! << 8);
    const nameStart = offset + 30;
    const name = decoder.decode(out.slice(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    if (name === entryName) {
      const target = dataStart + Math.min(8, Math.max(0, size - 1));
      out[target] = out[target]! ^ 0x01;
      return out;
    }
    offset = dataStart + size;
  }
  throw new Error(`Entry ${entryName} not found`);
}


function completeDeterministicMatch(rehydrateEachStep: boolean) {
  const controller = createMatchController(
    worldBytes,
    manifest,
    () => "pass09-full-resume-seed",
    () => ({ gameId: "game-pass09-full", matchId: "match-pass09-full" }),
  );
  let serial = 0;
  let response = controller.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: 0, type: "BOOT" });
  const send = (body: object) => {
    response = controller.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: response.revision, ...body });
    expect(response.error).toBeNull();
    if (rehydrateEachStep && serial % 5 === 0 && controller.snapshot()) controller.restore(controller.snapshot());
    return response;
  };
  const teams = response.catalog!.teams;
  send({ type: "START", selections: [teams[0]!.suggested, teams[1]!.suggested], groundId: response.catalog!.grounds[0]!.id });
  for (let guard = 0; guard < 500 && response.view!.phase !== "COMPLETE"; guard++) {
    const view = response.view!;
    let action: Action;
    if (view.phase === "TOSS") action = { kind: "CALL_TOSS", payload: { teamId: view.decisionTeamId!, call: "HEADS" } };
    else if (view.phase === "AWAITING_INNINGS") action = { kind: "CHOOSE_INNINGS", payload: { teamId: view.decisionTeamId!, choice: "BAT" } };
    else if (view.phase === "AWAITING_BATTER") action = { kind: "SET_BATTER", payload: { teamId: view.decisionTeamId!, playerId: view.candidates.find((p) => !p.reason)!.id } };
    else if (view.phase === "AWAITING_BOWLER") action = { kind: "SET_BOWLER", payload: { teamId: view.decisionTeamId!, bowlerId: view.candidates.find((p) => !p.reason)!.id } };
    else action = { kind: "ADVANCE", payload: { scope: "OVER" } };
    const innings = view.innings[view.activeIndex]?.innings;
    const teamId = "teamId" in action.payload ? action.payload.teamId : innings?.bowlingTeamId;
    send({
      type: "COMMAND",
      origin: "HUMAN",
      command: {
        ...action,
        commandId: `ui-${serial + 1}`,
        expectedRevision: response.revision,
        actorId: action.kind === "ADVANCE" ? "SYSTEM" : `USER:${teamId}`,
      },
    });
  }
  expect(response.view!.phase).toBe("COMPLETE");
  return controller.snapshot()!;
}

describe("M4 deterministic persistence and portable archive", () => {
  it("produces byte-identical final state across repeated save/rehydrate cycles", () => {
    const uninterrupted = completeDeterministicMatch(false);
    const repeatedlyResumed = completeDeterministicMatch(true);
    expect(canonicalJson(repeatedlyResumed)).toBe(canonicalJson(uninterrupted));
    expect(repeatedlyResumed.lastEventHash).toBe(uninterrupted.lastEventHash);
    expect(canonicalJson(repeatedlyResumed.events)).toBe(canonicalJson(uninterrupted.events));
  }, 60_000);

  it("rehydrates a saved T20 only by replaying its validated command history", () => {
    const session = sessionAfterPlay();
    const rebuilt = rehydrateT20Session(structuredClone(session), worldBytes, manifest);
    expect(canonicalJson(rebuilt)).toBe(canonicalJson(session));

    const tampered = structuredClone(session);
    tampered.core.globalAttemptOrdinal += 1;
    expect(() => rehydrateT20Session(tampered, worldBytes, manifest)).toThrow(/SAVE_CORE/);
  });

  it("round-trips .lcxxvi bytes and rejects tampering or incompatible engine pins", async () => {
    const session = sessionAfterPlay();
    const summary = summaryFor(session);
    const bytes = await createPortableArchive(session, summary, ARCHIVE_PINS, "2026-10-04T02:00:00.000Z");
    const read = await readPortableArchive(bytes, ARCHIVE_PINS);
    expect(canonicalJson(read.session)).toBe(canonicalJson(session));
    expect(read.summary).toEqual(summary);
    expect(read.worldCopy).toBeNull();
    await expect(readPortableArchive(tamperEntry(bytes, "game.json"), ARCHIVE_PINS)).rejects.toThrow(/CRC|HASH/);
    await expect(readPortableArchive(bytes, { ...ARCHIVE_PINS, engine: "LC_T20_MATCH_FUTURE" })).rejects.toThrow(/PIN_UNSUPPORTED_engine/);
  });

  it("preserves a match presentation copy without rewriting the frozen session", async () => {
    const session = sessionAfterPlay();
    const base = WorldPackSchema.parse(JSON.parse(new TextDecoder().decode(worldBytes)));
    const draft = structuredClone(base);
    draft.players[0]!.name = "A new name";
    const copy = createNewGameWorldCopy(draft, base);
    const bytes = await createPortableArchive(session, summaryFor(session), ARCHIVE_PINS, "2026-10-04T02:00:00.000Z", copy);
    const read = await readPortableArchive(bytes, ARCHIVE_PINS);
    expect(read.manifest.archiveVersion).toBe("LC_ARCHIVE_V2_PRESENTATION");
    expect(read.worldCopy).toEqual(copy);
    expect(canonicalJson(read.session)).toBe(canonicalJson(session));
    await expect(readPortableArchive(tamperEntry(bytes, "world-copy.json"), ARCHIVE_PINS)).rejects.toThrow(/CRC|HASH/);
    await expect(readPortableArchive(rewriteZipEntryText(bytes, "manifest.json", "LC_ARCHIVE_V2_PRESENTATION", "LC_ARCHIVE_V9_PRESENTATION"), ARCHIVE_PINS)).rejects.toThrow("ARCHIVE_VERSION_UNSUPPORTED");
  });

  it("rejects a path-traversal local file name before exposing an imported game", async () => {
    const session = sessionAfterPlay();
    const bytes = await createPortableArchive(session, summaryFor(session), ARCHIVE_PINS, "2026-10-04T02:00:00.000Z");
    const out = Uint8Array.from(bytes);
    const decoder = new TextDecoder();
    const replacement = new TextEncoder().encode("../x.json");
    let offset = 0;
    let replaced = false;
    while (offset + 30 < out.length) {
      const sig = (out[offset]! | (out[offset + 1]! << 8) | (out[offset + 2]! << 16) | (out[offset + 3]! << 24)) >>> 0;
      if (sig !== 0x04034b50) break;
      const size = (out[offset + 22]! | (out[offset + 23]! << 8) | (out[offset + 24]! << 16) | (out[offset + 25]! << 24)) >>> 0;
      const nameLen = out[offset + 26]! | (out[offset + 27]! << 8);
      const extraLen = out[offset + 28]! | (out[offset + 29]! << 8);
      const nameStart = offset + 30;
      const name = decoder.decode(out.slice(nameStart, nameStart + nameLen));
      const dataStart = nameStart + nameLen + extraLen;
      if (name === "game.json") {
        expect(replacement.length).toBe(nameLen);
        out.set(replacement, nameStart);
        replaced = true;
        break;
      }
      offset = dataStart + size;
    }
    expect(replaced).toBe(true);
    await expect(readPortableArchive(out, ARCHIVE_PINS)).rejects.toThrow(/PATH_INVALID/);
  });
});
