import { describe, expect, it } from "vitest";
import {
  createInitialPlayerLifecycleState,
  createInitialSquadEconomyState,
  derivePersistentWorldIdentity,
  validatePlayerLifecycleState,
  validateSquadEconomyState,
  verifyEconomyLedgerChain,
} from "@lcxxvi/simulation";
import { careerWorld } from "../../apps/web/src/career/service.js";

// Audit 16 Nov 2026, Phase 2: validation caches must never trust a hash the object reports about itself.
function fixture() {
  const worldIdentity = derivePersistentWorldIdentity({
    worldId: "world-cache-integrity",
    baseSeed: "seed-cache-integrity",
    originKind: "NEW_PERSISTENT_CAREER",
  });
  const lifecycle = createInitialPlayerLifecycleState({ worldIdentity, baseWorld: careerWorld, seasonNumber: 1, calendarYear: 2026 });
  const economy = createInitialSquadEconomyState({ worldIdentity, lifecycle, seasonNumber: 1, calendarYear: 2026, currentDate: "2026-04-01" });
  return { lifecycle, economy };
}

describe("validation caches reject tampered copies that carry a known hash", () => {
  it("lifecycle: an edited copy keeping a verified lifecycleSha256 is rejected", () => {
    const { lifecycle } = fixture();
    const verified = validatePlayerLifecycleState(lifecycle);
    expect(validatePlayerLifecycleState(verified)).toBe(verified);
    const tampered = structuredClone(verified);
    tampered.retiredPlayers = [...tampered.retiredPlayers];
    tampered.activeWorld.teams[0]!.squadIds = tampered.activeWorld.teams[0]!.squadIds.slice(0, 3);
    expect(tampered.lifecycleSha256).toBe(verified.lifecycleSha256);
    expect(() => validatePlayerLifecycleState(tampered)).toThrow();
  });

  it("lifecycle: a state that failed the squad checks is not accepted on a later call", () => {
    const { lifecycle } = fixture();
    const bad = structuredClone(lifecycle);
    bad.activeWorld.teams[0]!.squadIds = bad.activeWorld.teams[0]!.squadIds.slice(0, 3);
    expect(() => validatePlayerLifecycleState(bad)).toThrow();
    expect(() => validatePlayerLifecycleState(bad)).toThrow();
  });

  it("economy: an edited copy keeping a verified economySha256 is rejected", () => {
    const { economy } = fixture();
    const verified = validateSquadEconomyState(economy);
    expect(validateSquadEconomyState(verified)).toBe(verified);
    const tampered = structuredClone(verified);
    tampered.contracts[0]!.annualWageK += 1;
    expect(tampered.economySha256).toBe(verified.economySha256);
    expect(() => validateSquadEconomyState(tampered)).toThrow(/HASH_MISMATCH/);
  });

  it("ledger: an edited earlier entry is caught even when the tail entry is unchanged", () => {
    const { economy } = fixture();
    verifyEconomyLedgerChain(economy.ledger);
    expect(economy.ledger.length).toBeGreaterThan(1);
    const tampered = structuredClone(economy.ledger);
    tampered[0] = { ...tampered[0]!, teamCommittedWagesAfterK: tampered[0]!.teamCommittedWagesAfterK + 1 };
    expect(() => verifyEconomyLedgerChain(tampered)).toThrow(/LEDGER_HASH_MISMATCH:1/);
  });
});
