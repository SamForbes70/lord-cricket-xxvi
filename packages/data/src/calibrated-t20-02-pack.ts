/**
 * Stage C research model `calibrated-t20-02` (slice C6): the skill component. RESEARCH ONLY.
 *
 * A separately versioned refit (Studio Production Directive 03, 27 November 2026: "Recalibrate batter scoring,
 * boundary and dot-ball skill differentiation"). `calibrated-t20-01` and its packs are unchanged; this pack belongs
 * only to `calibrated-t20-02`. `gameplayIntegrationPermitted` is false: no game set-up, career, save, UI or default
 * selects this model; only `validateT20ResearchMatchSetup` (packages/simulation) can, for research scripts and tests.
 *
 * Same form and meaning as CALIBRATED_T20_PACK (calibrated-t20-pack.ts): each term adds coefficientBp x featureBp /
 * 10000 bp of logit to one category, where a skill feature is (rating - centre) x 200 bp about the world-pack mean.
 * V6 starts from V5 (calibrated-t20-01's skill pack) and refits only the two terms named in the pre-registered fit
 * statement (docs/pavilion/stage-c/C6_REFIT.md section 1): the batting timing and power terms on a four and a six, and
 * the rotation term on a dot. Fitted on the fit period (matches to 2023-08-31) and chosen on the selection period
 * (2023-09-01 to 2025-08-24) under captain V6 on the per-delivery harness. The holdout (2025-08-30 onward) was not read.
 * Derived from Cricsheet data (https://cricsheet.org/), ODC-By 1.0 (https://cricsheet.org/licensing/).
 */
import type { CalibratedTerms } from "./calibrated-t20-pack.js";

function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) if (child && typeof child === "object") deepFreeze(child);
  return Object.freeze(value);
}

export const CALIBRATED_T20_02_PACK = deepFreeze({
  manifest: {
    modelId: "calibrated-t20-02",
    packVersion: "LC_CALIBRATED_T20_SKILL_V6",
    /** C6: fitted to the adjusted rating-quarter ratios of the fit period under captain V6, per-delivery harness. */
    ratingMapping: "adjusted top / bottom rating quarters of players with at least 100 balls faced or bowled, suggested elevens, captain V6",
    status: "RESEARCH_ONLY",
    gameplayIntegrationPermitted: false,
    base: {
      probabilityPackSha256: "d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab",
      stagePackSha256: "34efa3037702e44a134ea38b414eab3e97c6f79f10b3e5458bc2ab05412e5d7a",
    },
    source: {
      dataset: "Cricsheet t20s_json.zip",
      licence: "ODC-By-1.0",
      archiveSha256: "956f29df9d2b95dd6fe12de5bc70d4522f23693e5e7e2ac4c1a004e1b541ad8e",
      licenceNoticeSha256: "11a6d83734845ad09d809667aa219857a5b985b28c258a2eebf5677668a6bd3b",
      reference: "men's T20 internationals between two full members",
      fitPeriod: "<= 2023-08-31",
      selectionPeriod: "2023-09-01 to 2025-08-24",
    },
  },
  centres: { TIMING: 60, POWER: 64, DEFENCE: 59, ROTATION: 60, CONTROL: 60, MOVEMENT: 62, VARIATION: 60 },
  contact: {
    MISS: { CONTROL: 21000 },
    AERIAL: { VARIATION: 8000 },
    EDGE: { VARIATION: 8000 },
  } as CalibratedTerms,
  runs: {
    "0": { CONTROL: 24000, ROTATION: -13700 },
    "4": { TIMING: 1400, POWER: 1400, CONTROL: -13000, MOVEMENT: -13000, VARIATION: 3000 },
    "6": { TIMING: 1400, POWER: 1400, CONTROL: -13000, MOVEMENT: -13000, VARIATION: 3000 },
  } as CalibratedTerms,
  cancelMissDismissalSkill: true,
});

/** SHA-256 of LC canonical JSON of CALIBRATED_T20_02_PACK; verified by the simulation model registry at load. */
export const CALIBRATED_T20_02_PACK_SHA256 = "188c50996df1cc25976c7f35fbbf36c2d4c11eba1bcfaaaf0bdce6beccacdb6f";
