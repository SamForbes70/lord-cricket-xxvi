import { readFileSync } from "node:fs";
import { test,expect } from "vitest";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { UI_VERSION } from "../../apps/web/src/match/protocol.js";

const world = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json","utf8"));

test("M7B AI provenance and actor restrictions survive deterministic T20 restore", () => {
  const c=createMatchController(world,manifest,()=>"m7b-controller-seed");
  const boot=c.handle({version:UI_VERSION,requestId:"ui-1",expectedRevision:0,type:"BOOT"});
  const teams=boot.catalog!.teams;
  const started=c.handle({version:UI_VERSION,requestId:"ui-2",expectedRevision:0,type:"START",
    format:"T20",selections:[teams[0]!.suggested,teams[1]!.suggested],groundId:boot.catalog!.grounds[0]!.id});
  expect(started.error).toBeNull();
  const caller=teams[0]!.id;
  const failed=c.handle({version:UI_VERSION,requestId:"ui-3",expectedRevision:started.revision,
    type:"COMMAND",origin:"AI",command:{kind:"CALL_TOSS",payload:{teamId:caller,call:"HEADS"},
      actorId:`AI:${teams[1]!.id}`,commandId:"ui-3",expectedRevision:started.revision}});
  expect(failed.error).not.toBeNull();
  expect(failed.revision).toBe(started.revision);
  const success=c.handle({version:UI_VERSION,requestId:"ui-4",expectedRevision:started.revision,
    type:"COMMAND",origin:"AI",command:{kind:"CALL_TOSS",payload:{teamId:caller,call:"HEADS"},
      actorId:`AI:${caller}`,commandId:"ui-4",expectedRevision:started.revision}});
  expect(success.error).toBeNull();
  const replayed=c.handle({version:UI_VERSION,requestId:"ui-4",expectedRevision:started.revision,
    type:"COMMAND",origin:"AI",command:{kind:"CALL_TOSS",payload:{teamId:caller,call:"HEADS"},
      actorId:`AI:${caller}`,commandId:"ui-4",expectedRevision:started.revision}});
  expect(replayed).toEqual(success);expect(c.snapshot()!.commands.filter(cmd=>cmd.commandId==="ui-4")).toHaveLength(1);
  const restored=createMatchController(world,manifest,()=>"not-used");
  restored.restore(c.snapshot());
  expect(restored.currentResponse("ui-5").view?.lastEventHash).toBe(success.view?.lastEventHash);
});
