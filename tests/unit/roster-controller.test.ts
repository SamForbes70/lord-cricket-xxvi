import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStagedRosterPack } from "@lcxxvi/simulation";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { UI_VERSION } from "../../apps/web/src/match/protocol.js";

const bytes = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const world = JSON.parse(new TextDecoder().decode(bytes));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));

describe("roster match controller", () => {
  it("starts, advances and restores a roster match without accepting a different pack", () => {
    const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
    const draft = structuredClone(world);
    draft.teams[0].name = "Imported Club";
    const pack = createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "test", world: { ...draft, players } }), world.rulesIds, ["stock"]);
    const controller = createMatchController(bytes, manifest, () => "seed");
    const boot = controller.handle({ version: UI_VERSION, requestId: "ui-1", expectedRevision: 0, type: "BOOT" });
    const teams = boot.catalog!.teams;
    const started = controller.handle({ version: UI_VERSION, requestId: "ui-2", expectedRevision: 0, type: "START", format: "T20", selections: [teams[0]!.suggested, teams[1]!.suggested], groundId: boot.catalog!.grounds[0]!.id, rosterPack: pack });
    expect(started.error).toBeNull();
    expect(started.view?.teams[0]?.name).toBe("Imported Club");
    const command = { commandId: "ui-3", expectedRevision: 1, actorId: `USER:${started.view!.decisionTeamId}`, kind: "CALL_TOSS", payload: { teamId: started.view!.decisionTeamId, call: "HEADS" } };
    const advanced = controller.handle({ version: UI_VERSION, requestId: "ui-3", expectedRevision: 1, type: "COMMAND", origin: "HUMAN", command });
    expect(advanced.error).toBeNull();
    const snapshot = controller.snapshot();
    const restored = createMatchController(bytes, manifest, () => "seed");
    restored.restore(snapshot, pack);
    expect(restored.currentResponse("ui-4").view).toEqual(advanced.view);
    const changed = structuredClone(pack);
    changed.world.teams[0]!.name = "Wrong";
    expect(() => restored.restore(snapshot, changed)).toThrow();
  });
});
