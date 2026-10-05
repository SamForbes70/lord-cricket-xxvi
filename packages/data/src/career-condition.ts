import {
  CareerAvailabilityPackSchema,
  CareerConditionPolicySchema,
} from "@lcxxvi/contracts";
import { FROZEN_WORLD_PINS } from "./world-pins.js";

export const T20_CAREER_CONDITION_POLICY = CareerConditionPolicySchema.parse({
  conditionPolicyVersion: "LC_T20_CAREER_CONDITION_V1",
  maxFatigueBp: 10000,
  restRecoveryPerDayBp: 2000,
  practiceRecoveryPerDayBp: 1400,
  noRandomInjuries: true,
});

/**
 * V0.1 supports manual unavailable dates, but the frozen baseline starts with
 * no forced absences. This keeps the fictional starting world neutral while
 * preserving a strict versioned boundary for future fixture-pack entries.
 */
export const DEFAULT_CAREER_AVAILABILITY_PACK = CareerAvailabilityPackSchema.parse({
  availabilityVersion: "LC_T20_AVAILABILITY_PACK_V1",
  packId: "fictional-eight-01-availability-v1",
  worldPackId: FROZEN_WORLD_PINS.worldPackId,
  worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
  entries: [],
});

export const FICTIONAL_EIGHT_TEAM_ROSTERS = Object.freeze(
  Object.fromEntries(
    Array.from({ length: 8 }, (_, teamIndex) => {
      const start = teamIndex * 20 + 1;
      return [
        `team-${String(teamIndex + 1).padStart(2, "0")}`,
        Array.from({ length: 20 }, (_, offset) => `p${String(start + offset).padStart(3, "0")}`),
      ];
    }),
  ) as Record<string, readonly string[]>,
);

export const FICTIONAL_EIGHT_PLAYER_IDS = Object.freeze(
  Array.from({ length: 160 }, (_, index) => `p${String(index + 1).padStart(3, "0")}`),
);
