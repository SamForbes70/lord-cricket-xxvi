import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import {
  UI_VERSION,
  PINS,
  type Response,
  type Action,
  type Selection,
} from "../../apps/web/src/match/protocol.js";
const bytes = new Uint8Array(
  readFileSync("packages/data/worlds/fictional-eight-01.json"),
);
const manifest = JSON.parse(
  readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"),
);
function harness(seed = "private-ui-acceptance-08") {
  const controller = createMatchController(bytes, manifest, () => seed);
  let serial = 0;
  let response = controller.handle({
    version: UI_VERSION,
    requestId: `ui-${++serial}`,
    expectedRevision: 0,
    type: "BOOT",
  });
  const frames: Response[] = [response];
  function send(body: object, rev = response.revision) {
    const req = {
      version: UI_VERSION,
      requestId: `ui-${++serial}`,
      expectedRevision: rev,
      ...body,
    };
    response = controller.handle(req);
    frames.push(response);
    return { req, response };
  }
  function start() {
    const teams = response.catalog!.teams;
    return send({
      type: "START",
      selections: [teams[0]!.suggested, teams[1]!.suggested],
      groundId: response.catalog!.grounds[0]!.id,
    });
  }
  function act(a: Action, actor?: string) {
    const v = response.view!,
      i = v.innings[v.activeIndex]?.innings;
    const t =
      "teamId" in a.payload
        ? a.payload.teamId
        : a.kind === "SET_BATTING_PLAN"
          ? i?.battingTeamId
          : i?.bowlingTeamId;
    const id = `ui-${serial + 1}`;
    return send({
      type: "COMMAND",
      origin: "HUMAN",
      command: {
        ...a,
        commandId: id,
        expectedRevision: response.revision,
        actorId: actor ?? (a.kind === "ADVANCE" ? "SYSTEM" : `USER:${t}`),
      },
    });
  }
  function step(scope: "DELIVERY" | "OVER" = "OVER") {
    const v = response.view!;
    if (v.phase === "TOSS")
      return act({
        kind: "CALL_TOSS",
        payload: { teamId: v.decisionTeamId!, call: "HEADS" },
      });
    if (v.phase === "AWAITING_INNINGS")
      return act({
        kind: "CHOOSE_INNINGS",
        payload: { teamId: v.decisionTeamId!, choice: "BAT" },
      });
    if (v.phase === "AWAITING_BATTER")
      return act({
        kind: "SET_BATTER",
        payload: {
          teamId: v.decisionTeamId!,
          playerId: v.candidates.find((p) => !p.reason)!.id,
        },
      });
    if (v.phase === "AWAITING_BOWLER")
      return act({
        kind: "SET_BOWLER",
        payload: {
          teamId: v.decisionTeamId!,
          bowlerId: v.candidates.find((p) => !p.reason)!.id,
        },
      });
    return act({ kind: "ADVANCE", payload: { scope } });
  }
  return {
    controller,
    send,
    start,
    act,
    step,
    frames,
    get r() {
      return response;
    },
  };
}
describe("M3 production worker controller", () => {
  it("retains the pinned 160-player catalogue and rejects XI/captain/keeper/duplicate-team edits", () => {
    const h = harness(),
      catalog = h.r.catalog!;
    expect(catalog.teams.flatMap((t) => t.players)).toHaveLength(160);
    expect(h.r.pins).toEqual(PINS);
    const a = catalog.teams[0]!.suggested,
      b = catalog.teams[1]!.suggested;
    const bad: Selection[][] = [
      [{ ...a, playerIds: a.playerIds.slice(1) }, b],
      [{ ...a, captainId: "missing" }, b],
      [{ ...a, keeperId: a.playerIds[1]! }, b],
      [a, a],
    ];
    for (const selections of bad) {
      const r = h.send({
        type: "START",
        selections,
        groundId: catalog.grounds[0]!.id,
      }).response;
      expect(r.error).toBeTruthy();
      expect(r.revision).toBe(0);
    }
    expect(h.start().response.error).toBeNull();
  });
  it("rejects stale revisions, unsupported fields, AI/autopilot origin and unknown wire properties atomically", () => {
    const h = harness();
    h.start();
    const rev = h.r.revision;
    expect(h.send({ type: "VERIFY" }, 0).response.error).toMatch(/Stale/);
    expect(h.r.revision).toBe(rev);
    expect(
      h.act(
        {
          kind: "CALL_TOSS",
          payload: { teamId: h.r.view!.decisionTeamId!, call: "HEADS" },
        },
        "SYSTEM",
      ).response.error,
    ).toMatch(/human/);
    expect(
      h.send({ type: "BOOT", seed: "do-not-allow" }).response.error,
    ).toBeTruthy();
    h.step();
    h.step();
    h.step();
    h.step();
    h.step();
    expect(h.r.view!.phase).toBe("READY");
    const v = h.r.view!,
      head = v.lastEventHash;
    const invalid = v.fieldSlots.map((f) => ({ ...f, slotId: "cover" }));
    const r = h.act({
      kind: "SET_FIELD",
      payload: {
        teamId: v.innings[0]!.innings.bowlingTeamId,
        fieldSlots: invalid,
      },
    }).response;
    expect(r.error).toMatch(/FIELD/);
    expect(r.view!.lastEventHash).toBe(head);
    expect(
      h.act({
        kind: "SET_BOWLING_PLAN",
        payload: { ...v.bowlingPlan!, variationId: "magic" },
      }).response.error,
    ).toMatch(/UNSUPPORTED_VARIATION/);
    expect(h.r.view!.lastEventHash).toBe(head);
  });
  it("deduplicates identical requests and rejects reused IDs with different payloads", () => {
    const h = harness();
    const { req, response } = h.start();
    expect(h.controller.handle(req)).toEqual(response);
    const altered = { ...req, groundId: "ground-02" };
    expect(h.controller.handle(altered).error).toMatch(/already used/);
  });
  it("completes a manual match, stops at decisions, blocks ineligible bowlers, proves replay, keeps seed private and prevents terminal deliveries", () => {
    const seed = "PRIVATE-NOT-FOR-THE-PAGE";
    const h = harness(seed);
    h.start();
    let rejected = 0;
    for (let n = 0; n < 500 && h.r.view!.phase !== "COMPLETE"; n++) {
      const v = h.r.view!;
      if (v.phase === "AWAITING_BOWLER") {
        for (const p of v.candidates.filter((p) => p.reason)) {
          const before = h.r.view!.lastEventHash;
          expect(
            h.act({
              kind: "SET_BOWLER",
              payload: { teamId: v.decisionTeamId!, bowlerId: p.id },
            }).response.error,
          ).toBeTruthy();
          expect(h.r.view!.lastEventHash).toBe(before);
          rejected++;
        }
      }
      expect(h.step().response.error).toBeNull();
    }
    expect(rejected).toBeGreaterThan(20);
    expect(h.r.view!.phase).toBe("COMPLETE");
    expect(h.r.view!.scorecard!.result.completionReason).toBe("TARGET_REACHED");
    const before = h.r.view!;
    expect(
      h.act({ kind: "ADVANCE", payload: { scope: "DELIVERY" } }).response.error,
    ).toBeTruthy();
    expect(h.r.view).toEqual(before);
    const proof = h.send({ type: "VERIFY" }).response.verification!;
    expect(proof.replay).toBe(true);
    expect(proof.resimulation).toBe(true);
    expect(proof.systemAutopilotRequests).toBe(0);
    expect(h.send({ type: "VERIFY" }).response.verification).toEqual(proof);
    for (const frame of h.frames) {
      expect(JSON.stringify(frame)).not.toContain(seed);
      expect(JSON.stringify(frame)).not.toMatch(
        /"seed"|"worldSeed"|"setup"|"commands"/,
      );
    }
  });
  it("single-delivery advance emits at most one delivery and cannot skip a manual stop", () => {
    const h = harness();
    h.start();
    while (h.r.view!.phase !== "READY") h.step();
    const count = () =>
      h.r.view!.commentary.filter((e) => e.text.startsWith("Innings ")).length;
    const before = count();
    h.step("DELIVERY");
    expect(count()).toBe(before + 1);
    for (let n = 0; n < 30 && h.r.view!.phase === "READY"; n++)
      h.step("DELIVERY");
    expect(h.r.view!.phase).not.toBe("READY");
    const head = h.r.view!.lastEventHash;
    expect(
      h.act({ kind: "ADVANCE", payload: { scope: "OVER" } }).response.error,
    ).toBeTruthy();
    expect(h.r.view!.lastEventHash).toBe(head);
  });
  it("production UI and worker do not invoke fixture autopilot or page-side gameplay random functions", () => {
    const page = readFileSync("apps/web/src/main.tsx", "utf8"),
      worker = readFileSync("apps/web/src/match/match.worker.ts", "utf8"),
      controller = readFileSync("apps/web/src/match/controller.ts", "utf8");
    for (const s of [page, worker, controller])
      expect(s).not.toMatch(
        /fixtureAutopilotStep|runFixtureT20|applyT20FixtureResolution|Math\.random/,
      );
    expect(page).not.toMatch(
      /getRandomValues|randomUUID|createT20Session|executeT20Command/,
    );
    expect(page.match(/new Worker\(/g)).toHaveLength(1);
  });
});
