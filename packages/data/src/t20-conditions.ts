/** Explicit additive Appendix F5 policy. Never mutate the frozen one-attempt stage pack. */
export const T20_CONDITION_POLICY = Object.freeze({
  version: "LC_T20_CONDITIONS_V1" as const,
  fatigueBaseBp: { pace: 20, spin: 12 },
  effortFactorBp: { CONSERVE: 8000, NORMAL: 10000, MAXIMUM: 13000 },
  recoveryNonBowlerPerOverBp: 15,
  wearIncrementPerLegalBall: 1,
  wearStep: 100,
  wearTurnDeltaBp: 20,
  wearVariabilityDeltaBp: 10,
  wearSeamDeltaBp: -10,
  maxBasisPoints: 10000,
  weather: "DRY" as const,
  ballAgeResetAtInnings: true,
});

/** ODI currently uses the same synthetic fatigue/wear coefficients with a distinct version identity. */
export const ODI_CONDITION_POLICY = Object.freeze({
  ...T20_CONDITION_POLICY,
  version: "LC_ODI_CONDITIONS_V1" as const,
});
