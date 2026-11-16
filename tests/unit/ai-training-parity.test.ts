import { describe, expect, it } from "vitest";
import {
  aiClubTrainingDirective,
  createInitialPlayerLifecycleState,
  derivePersistentWorldIdentity,
  recordElapsedTrainingExposure,
} from "@lcxxvi/simulation";
import { careerWorld } from "../../apps/web/src/career/service.js";

// Audit 16 Nov 2026, Phase 3: AI clubs had no way to set training, so every AI player only rested.
describe("AI club training parity", () => {
  const worldIdentity = derivePersistentWorldIdentity({ worldId: "world-ai-training", baseSeed: "seed-ai-training", originKind: "NEW_PERSISTENT_CAREER" });
  const lifecycle = createInitialPlayerLifecycleState({ worldIdentity, baseWorld: careerWorld, seasonNumber: 1, calendarYear: 2026 });
  const managed = lifecycle.activeWorld.teams[0]!;
  const managedIds = new Set(managed.squadIds);
  const restEveryone = lifecycle.activeWorld.players.map((p) => ({ playerId: p.playerId, directive: "REST" as const }));

  it("AI players practise their role while the managed club follows the manager's directives", () => {
    let state = lifecycle;
    for (let day = 0; day < 20; day += 1) state = recordElapsedTrainingExposure(state, restEveryone, 1, managed.teamId);
    const roleById = new Map(lifecycle.activeWorld.players.map((p) => [p.playerId, p.role]));
    for (const entry of state.seasonTrainingExposure) {
      if (!roleById.has(entry.playerId)) continue;
      const practice = entry.battingPracticeDays + entry.bowlingPracticeDays + entry.fieldingPracticeDays;
      if (managedIds.has(entry.playerId)) {
        expect(entry.restDays).toBe(20);
        expect(practice).toBe(0);
      } else {
        expect(entry.restDays).toBe(0);
        expect(practice).toBe(20);
        const role = roleById.get(entry.playerId);
        if (role === "BATTER") expect(entry.battingPracticeDays).toBe(20);
        if (role === "BOWLER") expect(entry.bowlingPracticeDays).toBe(20);
        if (role === "ALLROUNDER") {
          expect(entry.battingPracticeDays).toBe(10);
          expect(entry.bowlingPracticeDays).toBe(10);
        }
      }
    }
  });

  it("without a managed club the original behaviour is unchanged", () => {
    const state = recordElapsedTrainingExposure(lifecycle, restEveryone, 5);
    expect(state.seasonTrainingExposure.every((e) => e.restDays === 5)).toBe(true);
  });

  it("the policy is deterministic from saved exposure only", () => {
    expect(aiClubTrainingDirective("KEEPER", { battingPracticeDays: 3, bowlingPracticeDays: 0, fieldingPracticeDays: 2 })).toBe("FIELDING_PRACTICE");
    expect(aiClubTrainingDirective("KEEPER", { battingPracticeDays: 2, bowlingPracticeDays: 0, fieldingPracticeDays: 2 })).toBe("BATTING_PRACTICE");
  });
});
