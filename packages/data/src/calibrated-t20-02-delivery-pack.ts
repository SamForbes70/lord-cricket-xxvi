/**
 * Stage C research model `calibrated-t20-02` (slice C6): the delivery-outcome component. RESEARCH ONLY.
 *
 * `gameplayIntegrationPermitted` is false. Only calibrated-t20-02 reads this pack (through the model registry in
 * packages/simulation). calibrated-t20-01 and its delivery pack V2 (calibrated-t20-delivery-pack.ts) are unchanged.
 *
 * V3 is delivery V2 with every V2 value kept, plus two mechanisms on existing branches (no run or result multiplier,
 * no forced outcome), each with a value per phase of the T20 innings:
 *  - catchOpportunityPhaseBp: added to the chance that a covered aerial shot or edge becomes a catch chance;
 *  - dismissalPhaseBp: added to the bowled intercept after a miss and the lbw intercept after a pad.
 * The values are fitted on the fit period (matches to 2023-08-31) to the first-innings dismissal kinds per legal ball
 * in each phase, and chosen on the selection period (2023-09-01 to 2025-08-24), under captain V6 on the per-delivery
 * harness (docs/pavilion/stage-c/C6_REFIT.md). The holdout (2025-08-30 onward) was not read.
 * Derived from Cricsheet data (https://cricsheet.org/), ODC-By 1.0 (https://cricsheet.org/licensing/).
 */
function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) if (child && typeof child === "object") deepFreeze(child);
  return Object.freeze(value);
}

export const CALIBRATED_T20_02_DELIVERY_PACK = deepFreeze({
  manifest: {
    modelId: "calibrated-t20-02",
    packVersion: "LC_CALIBRATED_T20_DELIVERY_V3",
    status: "RESEARCH_ONLY",
    gameplayIntegrationPermitted: false,
    base: {
      probabilityPackSha256: "d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab",
      stagePackSha256: "34efa3037702e44a134ea38b414eab3e97c6f79f10b3e5458bc2ab05412e5d7a",
      skillPackSha256: "188c50996df1cc25976c7f35fbbf36c2d4c11eba1bcfaaaf0bdce6beccacdb6f",
    },
    source: {
      dataset: "Cricsheet t20s_json.zip",
      licence: "ODC-By-1.0",
      archiveSha256: "956f29df9d2b95dd6fe12de5bc70d4522f23693e5e7e2ac4c1a004e1b541ad8e",
      licenceNoticeSha256: "11a6d83734845ad09d809667aa219857a5b985b28c258a2eebf5677668a6bd3b",
      reference: "men's T20 internationals between two full members, first innings",
      fitPeriod: "<= 2023-08-31",
      selectionPeriod: "2023-09-01 to 2025-08-24",
    },
  },
  contact: {
    /** Additive intercepts (bp of logit) by phase. */
    intercept: {
      T20_EARLY: { MISS: -5000, PAD: -5000, GROUND: 0, AERIAL: -4500, EDGE: -2000, HIT_WICKET: -16000 },
      T20_MIDDLE: { MISS: -5000, PAD: -5000, GROUND: 0, AERIAL: 0, EDGE: -3300, HIT_WICKET: -16000 },
      T20_LATE: { MISS: -21000, PAD: -21000, GROUND: 0, AERIAL: 0, EDGE: -6000, HIT_WICKET: -16000 },
    },
    /** Additive coefficient (bp) on the aggression feature (aggression - 2) x 10,000. */
    aggression: { MISS: -1000, PAD: 0, GROUND: 0, AERIAL: 0, EDGE: -1000, HIT_WICKET: -1000 },
  },
  /** Base weights for run categories 0, 1, 2, 3, 4, 6 after bat contact. */
  runs: {
    GROUND: [1450, 5900, 1000, 60, 2900, 0],
    AERIAL: [1500, 1600, 900, 100, 2000, 3800],
    EDGE: [4500, 2300, 500, 0, 2400, 0],
  },
  /** Coefficients (bp) on ring and deep coverage (0 to 10,000 bp each) for each run category. */
  runsCoverageBp: {
    RING: { "0": 14000, "1": -6000, "2": -9000, "3": -6000, "4": -2000, "6": -5000 },
    DEEP: { "0": -8000, "1": 3000, "2": 5000, "3": 0, "4": -30000, "6": -20000 },
  },
  /** Coefficient (bp) on (aggression - 2) x 10,000 for each run category after a GROUND or AERIAL shot. */
  runsAggressionBp: { "0": -3500, "1": 0, "2": 0, "3": 0, "4": 3500, "6": 2000 },
  catchOpportunityBp: { AERIAL: 1800, EDGE: 3000 },
  dismissalInterceptBp: { BOWLED: -26000, LBW: -21000, RUN_OUT: -57000 },
  /** V2: coefficient (bp) on max(0, aggression - 2) x the field's spread (bp) for each run category after a GROUND or AERIAL shot. */
  runsAggressionDeepBp: { "0": -7000, "1": 2500, "2": 2000, "3": 0, "4": 0, "6": 0 },
  /** V2: added to catchOpportunityBp for each aggression level above 2 (subtracted below), clamped to 0 to 10,000. */
  catchOpportunityAggressionBp: { AERIAL: 300, EDGE: 0 },
  /** V2: coefficient (bp) on the aggression feature (aggression - 2) x 10,000 in the run-out category. */
  runOutAggressionBp: 8000,
  /** V2: stumping chance as a fraction of the keeping sigmoid (synthetic-alpha-01: 3 / 1000). */
  stumping: { numerator: 70, denominator: 1000 },
  /** V2: coefficients (bp) on the pitch feature seamBp + turnBp - 2 x centreBp of the current pitch. */
  pitch: {
    centreBp: 5600,
    contact: { MISS: 4500, PAD: 4500, GROUND: 0, AERIAL: 0, EDGE: 4500, HIT_WICKET: 0 },
    runs: { "0": 3000, "1": 0, "2": 0, "3": 0, "4": -3750, "6": -3750 },
  },
  /**
   * V3 (C6): additive bp on catchOpportunityBp (after the aggression term, clamped to 0 to 10,000) by phase, for a
   * covered aerial shot or edge. The C6 fit ties AERIAL and EDGE to one value per phase (Cricsheet does not say which
   * catches came from edges).
   */
  catchOpportunityPhaseBp: {
    T20_EARLY: { AERIAL: -350, EDGE: -350 },
    T20_MIDDLE: { AERIAL: 50, EDGE: 50 },
    T20_LATE: { AERIAL: -750, EDGE: -750 },
  },
  /** V3 (C6): additive intercepts (bp) on the bowled and lbw chance after a miss or pad, by phase. */
  dismissalPhaseBp: {
    T20_EARLY: { BOWLED: -1800, LBW: -300 },
    T20_MIDDLE: { BOWLED: -1500, LBW: -3000 },
    T20_LATE: { BOWLED: 19100, LBW: 23400 },
  },
});

/** SHA-256 of LC canonical JSON of CALIBRATED_T20_02_DELIVERY_PACK; verified by the simulation model registry at load. */
export const CALIBRATED_T20_02_DELIVERY_PACK_SHA256 = "956f0d640253fc3c83fedf83b890095c65dcfa3c542d1bed508c46f3ffc4dd3b";
/**
 * calibrated-t20-02's model hash, recorded in a research set-up's `versions.modelHash`: SHA-256 of LC canonical JSON of
 * { deliveryPackSha256, skillPackSha256, tacticsPackSha256 }, as for calibrated-t20-01. The tactics component is
 * calibrated-t20-01's LC_CALIBRATED_T20_TACTICS_V1, unchanged and shared (not refitted).
 */
export const CALIBRATED_T20_02_MODEL_HASH = "be97f9a991e9263dc392dc0e91e1a70187fc60a21fd2ab85495de4b8b6965444";
