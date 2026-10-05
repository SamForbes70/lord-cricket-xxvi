import { T20OffscreenFixturePolicySchema } from "@lcxxvi/contracts";

export const T20_OFFSCREEN_FIXTURE_POLICY = T20OffscreenFixturePolicySchema.parse({
  policyVersion: "LC_T20_OFFSCREEN_POLICY_V1",
  executionVersion: "LC_T20_OFFSCREEN_FIXTURE_V1",
  selectionPolicyId: "LC_SEASON_XI_BASELINE_V1",
  captainPolicyId: "LC_FIXTURE_CAPTAIN_V1",
  conditionDeltaPolicyId: "LC_ENGINE_FINAL_FATIGUE_DELTA_V1",
  matchEngineVersion: "LC_T20_MATCH_V1",
  selectionScorePolicy: "SUM_SUPPORTED_T20_SKILLS_PLUS_AREA_READINESS_V1",
  unavailablePlayersExcluded: true,
  fatigueSelectionEffect: "LOWER_FATIGUE_STABLE_TIEBREAK_ONLY",
  minimumNonKeeperBowlingCapable: 5,
  requiresKeeper: true,
  noFutureRandomAccess: true,
  noAlternateMatchSimulator: true,
});
