import { expect, test } from "@playwright/test";
import path from "node:path";

const persistenceUrl = () => `/@fs/${path.resolve("packages/persistence/src/index.ts")}`;
const worldStateUrl = () => `/@fs/${path.resolve("apps/web/src/career/world-state.ts")}`;
const serviceUrl = () => `/@fs/${path.resolve("apps/web/src/career/service.ts")}`;

// docs/design/WORLD_STATE_HISTORY_V4.md: a world state V4 save embeds at most two roster packs, so the
// stored PERSISTENT_LIFECYCLE_ROSTER_PACK_V1 rows are the full history. A new save stores its packs.
test("a new world state V4 save stores its roster packs as rows and reloads as V4", async ({ page }) => {
  await page.goto("/#exhibition");
  const result = await page.evaluate(
    async ([pUrl, wUrl, sUrl]) => {
      const persistence = (await import(pUrl!)) as typeof import("../../packages/persistence/src/index.js");
      const worldState = (await import(wUrl!)) as typeof import("../../apps/web/src/career/world-state.js");
      const { careerWorld } = (await import(sUrl!)) as typeof import("../../apps/web/src/career/service.js");
      const name = `m4-v4-packs-${crypto.randomUUID()}`;
      const repo = new persistence.IndexedDbPersistentWorldRepository(name);
      const state = await worldState.createInitialPersistentWorldCareerStateV3({
        worldId: "world-m4-v4",
        careerId: "career-m4-v4",
        baseSeed: "seed-m4-v4",
        controlledTeamId: careerWorld.teams[0]!.teamId,
        worldStateVersion: "LC_PERSISTENT_WORLD_STATE_V4",
      });
      const saveId = "pworld:world-m4-v4";
      const leased = await repo.acquireLease(saveId, "owner-m4", Date.now());
      await repo.commit({
        saveId,
        kind: "AUTO",
        title: "M4 V4",
        expectedRevision: null,
        state,
        command: null,
        ownerId: "owner-m4",
        now: Date.now(),
        updatedAt: new Date().toISOString(),
        setActive: true,
      });
      const packs = await repo.loadLifecycleRosterPacks(saveId);
      const loaded = await repo.load(saveId);
      const embedded = state.lifecycle.historicalRosterPacks.length;
      indexedDB.deleteDatabase(name);
      return {
        leased,
        version: state.worldStateVersion,
        embedded,
        stored: packs.size,
        storedHasActive: [...packs.values()].some(
          (pack) => JSON.stringify(pack) === JSON.stringify(state.lifecycle.activeRosterPack),
        ),
        loadedVersion: loaded?.state.worldStateVersion,
        sameHash: loaded?.state.stateSha256 === state.stateSha256,
      };
    },
    [persistenceUrl(), worldStateUrl(), serviceUrl()],
  );
  expect(result.leased).toBe(true);
  expect(result.version).toBe("LC_PERSISTENT_WORLD_STATE_V4");
  expect(result.embedded).toBeLessThanOrEqual(2);
  expect(result.stored).toBeGreaterThanOrEqual(1);
  expect(result.storedHasActive).toBe(true);
  expect(result.loadedVersion).toBe("LC_PERSISTENT_WORLD_STATE_V4");
  expect(result.sameHash).toBe(true);
});
