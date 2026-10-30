import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { WorldPackSchema } from "@lcxxvi/contracts";
import { createNewGameWorldCopy } from "../../apps/web/src/world/new-game-world.js";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { createODIMatchController } from "../../apps/web/src/match/controller-odi.js";
import { createRed5MatchController } from "../../apps/web/src/match/controller-red5.js";
import { UI_VERSION } from "../../apps/web/src/match/protocol.js";

const worldBytes = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const world = WorldPackSchema.parse(JSON.parse(new TextDecoder().decode(worldBytes)));
const draft = structuredClone(world);
draft.teams[0]!.name = "Harbour XI";
draft.players[0]!.name = "Rhea Harbour";
draft.grounds[0]!.name = "New Quay";
draft.teams[0]!.colours = ["#1177cc", "#eeee11"];
const copy = createNewGameWorldCopy(draft, world);

describe("edited exhibition presentation", () => {
  for (const [format, factory] of [
    ["T20", createMatchController], ["ODI", createODIMatchController], ["RED_BALL", createRed5MatchController],
  ] as const) {
    test(`${format} displays the copy while preserving its frozen match snapshot`, () => {
      const controller = factory(worldBytes, manifest, () => "edited-seed", () => ({ gameId: `game-${format}`, matchId: `match-${format}` }));
      const boot = controller.handle({ version: UI_VERSION, requestId: "ui-1", expectedRevision: 0, type: "BOOT" });
      const catalog = boot.catalog!;
      const response = controller.handle({
        version: UI_VERSION, requestId: "ui-2", expectedRevision: 0, type: "START", format,
        selections: [catalog.teams[0]!.suggested, catalog.teams[1]!.suggested], groundId: catalog.grounds[0]!.id, worldCopy: copy,
      });
      expect(response.error).toBeNull();
      expect(response.view?.teams[0]?.name).toBe("Harbour XI");
      expect(response.view?.teams[0]?.colours).toEqual(["#1177cc", "#eeee11"]);
      expect(response.view?.names.p001).toBe("Rhea Harbour");
      expect(response.view?.ground).toBe("New Quay");
      const snapshot = controller.snapshot()!;
      expect(snapshot.setup.teams[0].name).toBe(world.teams[0]!.name);
      expect(snapshot.setup.teams[0].xi.find(player => player.playerId === "p001")!.name).toBe(world.players[0]!.name);
      controller.restore(snapshot);
      controller.setWorldCopy(copy);
      expect(controller.currentResponse("ui-3").view?.names.p001).toBe("Rhea Harbour");
      const altered = structuredClone(copy);
      altered.world.players[0]!.skills.T20!.power += 1;
      expect(() => controller.setWorldCopy(altered)).toThrow();
    });
  }
});
