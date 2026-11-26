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
 * V2 (C5, docs/pavilion/stage-c/C5_TACTICS_AND_REFIT.md) adds five mechanisms, again with no run or result multiplier:
 *  - runsAggressionDeepBp: attacking into a spread field. A coefficient on max(0, aggression - 2) x the field's spread
 *    (2,000 bp per boundary rider) for each run category after a ground or aerial shot, so an attacking shot into a
 *    field with more fielders back finds a single or two rather than a dot.
 *  - catchOpportunityAggressionBp: a slog is more often skied. Added per aggression level to the chance that a
 *    covered aerial shot becomes a catch chance.
 *  - runOutAggressionBp: hard running. A coefficient on the aggression feature in the run-out category.
 *  - stumping: the stumping chance (a miss by a batter advancing to spin, aggression above 2), replacing
 *    DELIVERY_STAGE_PACK.stumping's 3 / 1000 of the keeping sigmoid.
 *  - pitch: the ground's pitch. A coefficient on (seam + turn - 2 x centre) of the current pitch for contact and run
 *    categories, so a bowler-friendly surface gives more false shots and fewer boundaries in both innings.
 * V2 also corrects rare dismissal kinds against the calibration split (Studio Production Directive 02, A3): a
 * hit-wicket contact intercept in every phase, higher bowled and lbw intercepts, and a lower aerial catch chance so
 * the total stays level. Cricsheet's "caught and bowled" has no separate branch here (a catch is never the bowler's).
 * V1 (hash baf16852...) produced the C4 files c4-after.json and c4-per-point.json and stays their record.
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
    packVersion: "LC_CALIBRATED_T20_DELIVERY_V2",
    status: "RESEARCH_ONLY",
    gameplayIntegrationPermitted: false,
    base: {
      probabilityPackSha256: "d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab",
      stagePackSha256: "34efa3037702e44a134ea38b414eab3e97c6f79f10b3e5458bc2ab05412e5d7a",
      skillPackSha256: "07949faa30bab7713ae2aa6d3e00e6b443c4812fc3bbfb5e3e4e26d4fb680bfa",
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
});

/** SHA-256 of LC canonical JSON of CALIBRATED_T20_DELIVERY_PACK; verified by the simulation model registry at load. */
export const CALIBRATED_T20_DELIVERY_PACK_SHA256 = "2ea31526811177f0a973e4b4612b457d1ba374f8c64b1af34b94585659b388ad";
/**
 * The calibrated model's hash, recorded in a research set-up's `versions.modelHash`: SHA-256 of LC canonical JSON of
 * { deliveryPackSha256, skillPackSha256, tacticsPackSha256 } (C5: the tactics pack is the third component). It changes
 * whenever any component changes.
 */
export const CALIBRATED_T20_MODEL_HASH = "64e09b4b00d2b3b9565a7e18b86e219933487713cbbd2a2b62e24885e6592802";
