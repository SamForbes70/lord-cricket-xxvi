/**
 * Stage C research model `calibrated-t20-01`, slice C4: the delivery-outcome component. RESEARCH ONLY.
 *
 * `gameplayIntegrationPermitted` is false. Only the calibrated research model reads this pack (through the model
 * registry in packages/simulation); synthetic-alpha-01 and its DELIVERY_STAGE_PACK are unchanged, and no game set-up,
 * career, save, replay or UI selects the calibrated model.
 *
 * What it changes, against DELIVERY_STAGE_PACK and the contact coefficients of synthetic-alpha-01, for the calibrated
 * model only. There is no run multiplier and no outcome is forced: each value is a parameter of an existing branch.
 *  - contact: additive logit terms per phase (intercepts) and per aggression level (on the same (aggression - 2) x
 *    10,000 bp feature as synthetic-alpha-01). Aggression keeps its reward (more aerial shots, fewer ground shots) but
 *    costs fewer false shots (misses and edges) per level.
 *  - runs: base weights of the run value after bat contact (categories 0, 1, 2, 3, 4, 6), replacing
 *    DELIVERY_STAGE_PACK.runs for GROUND, AERIAL and EDGE.
 *  - runsCoverageBp: coefficients on the shot sector's ring coverage (INNER and MIDDLE fielders) and deep coverage
 *    (DEEP fielders) for each run category, replacing the single depth-blind dot +5,000 and boundary -7,000 of
 *    synthetic-alpha-01. A ring fielder saves the single, a boundary rider concedes the single or two but saves the
 *    four. Coverage uses DELIVERY_STAGE_PACK's positional and depth weights unchanged.
 *  - runsAggressionBp: coefficient on the aggression feature for each run category after a ground or aerial shot
 *    (a harder-hit shot is less often a dot and more often a boundary; a defensive one the reverse).
 *  - catchOpportunityBp: chance that a covered aerial shot or edge becomes a catch chance.
 *  - dismissalInterceptBp: intercepts of bowled, lbw and run out (no skill term is added; owner decision 2 of
 *    25 November 2026 stands).
 * Fitted to the per-ball first-innings outcome mix of men's T20 internationals between two full members, matches up
 * to 2023-08-31, and chosen on 2023-09-01 to 2025-08-24 (docs/pavilion/stage-c/C4_DELIVERY_MIX.md). The holdout
 * (2025-08-30 onward) was not read.
 * Derived from Cricsheet data (https://cricsheet.org/), ODC-By 1.0 (https://cricsheet.org/licensing/).
 */
function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) if (child && typeof child === "object") deepFreeze(child);
  return Object.freeze(value);
}

export type CalibratedContactId = "MISS" | "PAD" | "GROUND" | "AERIAL" | "EDGE" | "HIT_WICKET";
export type CalibratedRunId = "0" | "1" | "2" | "3" | "4" | "6";

export const CALIBRATED_T20_DELIVERY_PACK = deepFreeze({
  manifest: {
    modelId: "calibrated-t20-01",
    packVersion: "LC_CALIBRATED_T20_DELIVERY_V1",
    status: "RESEARCH_ONLY",
    gameplayIntegrationPermitted: false,
    base: {
      probabilityPackSha256: "d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab",
      stagePackSha256: "34efa3037702e44a134ea38b414eab3e97c6f79f10b3e5458bc2ab05412e5d7a",
      skillPackSha256: "4fa5d84597d105afdae72dc4d0681a7b883055824bfe449a342a82d3ef4fe43e",
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
      T20_EARLY: { MISS: 1000, PAD: 1000, GROUND: 0, AERIAL: -4500, EDGE: -2000, HIT_WICKET: 0 },
      T20_MIDDLE: { MISS: -5000, PAD: -5000, GROUND: 0, AERIAL: 0, EDGE: -3300, HIT_WICKET: 0 },
      T20_LATE: { MISS: -13000, PAD: -13000, GROUND: 0, AERIAL: -4500, EDGE: -3300, HIT_WICKET: 0 },
    },
    /** Additive coefficient (bp) on the aggression feature (aggression - 2) x 10,000. */
    aggression: { MISS: -1500, PAD: 0, GROUND: 0, AERIAL: 0, EDGE: -1500, HIT_WICKET: -1000 },
  },
  /** Base weights for run categories 0, 1, 2, 3, 4, 6 after bat contact. */
  runs: {
    GROUND: [1450, 5900, 1300, 60, 2900, 0],
    AERIAL: [1500, 1600, 900, 100, 2000, 3800],
    EDGE: [4500, 2300, 500, 0, 2400, 0],
  },
  /** Coefficients (bp) on ring and deep coverage (0 to 10,000 bp each) for each run category. */
  runsCoverageBp: {
    RING: { "0": 8000, "1": -4000, "2": -6000, "3": -6000, "4": -2000, "6": -5000 },
    DEEP: { "0": -8000, "1": 3000, "2": 5000, "3": 0, "4": -20000, "6": -20000 },
  },
  /** Coefficient (bp) on (aggression - 2) x 10,000 for each run category after a GROUND or AERIAL shot. */
  runsAggressionBp: { "0": -1000, "1": 0, "2": 0, "3": 0, "4": 1000, "6": 1000 },
  catchOpportunityBp: { AERIAL: 2000, EDGE: 3000 },
  dismissalInterceptBp: { BOWLED: -25000, LBW: -28000, RUN_OUT: -52000 },
});

/** SHA-256 of LC canonical JSON of CALIBRATED_T20_DELIVERY_PACK; verified by the simulation model registry at load. */
export const CALIBRATED_T20_DELIVERY_PACK_SHA256 = "baf16852b40bb6b348d48d38dedff192572383ede64126dafbd0b4e8984b3c9c";
/**
 * The calibrated model's hash, recorded in a research set-up's `versions.modelHash`: SHA-256 of LC canonical JSON of
 * { deliveryPackSha256, skillPackSha256 }. It changes whenever either component changes.
 */
export const CALIBRATED_T20_MODEL_HASH = "27090e93a46178d1f2d4569ab7f773f0f2c007a1f4e96db1ee3dffeb6504c7a8";
