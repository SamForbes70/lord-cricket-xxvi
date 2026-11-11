import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import type { T20Session } from "@lcxxvi/simulation";
import { createDiagnostic } from "../../apps/web/src/match/diagnostic-export.js";

describe("match diagnostic export", () => {
  test("omits the seed of an unfinished match unless the player opts in", async () => {
    const session = { setup: { format: "T20", gameId: "game", matchId: "match", seed: "secret-seed" }, core: { phase: "READY" },
      executionManifest: { engine: "LC_T20_MATCH_V1", rulesHash: "rules" }, revision: 2, events: [], lastEventHash: "last" } as unknown as T20Session;
    const hidden = await createDiagnostic(session, null);
    expect(JSON.parse(new TextDecoder().decode(hidden.bytes)).seed).toBeNull();
    expect(hidden.preview.includesSeed).toBe(false);
    expect(new TextDecoder().decode(hidden.bytes)).not.toContain("secret-seed");
    const shared = await createDiagnostic(session, null, true);
    expect(JSON.parse(new TextDecoder().decode(shared.bytes)).seed).toBe("secret-seed");
    expect(shared.preview.includesSeed).toBe(true);
  });
  test("includes the seed once the match is complete", async () => {
    const session = { setup: { format: "T20", gameId: "game", matchId: "match", seed: "secret-seed" }, core: { phase: "COMPLETE" },
      executionManifest: { engine: "LC_T20_MATCH_V1", rulesHash: "rules" }, revision: 9, events: [], lastEventHash: "last" } as unknown as T20Session;
    expect(JSON.parse(new TextDecoder().decode((await createDiagnostic(session, null)).bytes)).seed).toBe("secret-seed");
  });
  test("exports complete events and the seed only in the explicitly requested bytes", async () => {
    const session = { setup: { format: "T20", gameId: "game", matchId: "match", seed: "secret-seed" },
      executionManifest: { engine: "LC_T20_MATCH_V1", rulesHash: "rules" }, revision: 2,
      events: [{ sequence: 1, type: "DELIVERY_RECORDED", payload: { event: { batRuns: 4 } } }], lastEventHash: "last" } as unknown as T20Session;
    const original = structuredClone(session);
    const result = await createDiagnostic(session, { requestType: "COMMAND", sequence: 2, invariantCode: "INVALID_FIELD", command: null }, true);
    const text = new TextDecoder().decode(result.bytes), data = JSON.parse(text);
    expect(data.seed).toBe("secret-seed"); expect(data.events).toEqual(session.events);
    expect(data.failure).toMatchObject({ sequence: 2, invariantCode: "INVALID_FIELD" });
    expect(result.preview).toMatchObject({ format: "T20", eventCount: 1, revision: 2, includesSeed: true });
    expect(JSON.stringify(result.preview)).not.toContain("secret-seed");
    expect(result.preview.sha256).toBe(createHash("sha256").update(result.bytes).digest("hex"));
    expect(session).toEqual(original);
  });
  test("reports unavailable fields without inventing match data", async () => {
    const result = await createDiagnostic(null, null), data = JSON.parse(new TextDecoder().decode(result.bytes));
    expect(data.seed).toBeNull(); expect(data.events).toEqual([]); expect(data.failure).toBeNull();
    expect(result.preview).toMatchObject({ format: null, revision: null, includesSeed: false, eventCount: 0 });
  });
});
