/**
 * Stage C research model `calibrated-t20-01`: the skill component, as ADDITIVE terms on top of the unchanged
 * synthetic-alpha-01 probability pack (baselines, LUT, existing coefficients) and the unchanged delivery stage pack.
 *
 * RESEARCH ONLY. `gameplayIntegrationPermitted` is false. No game set-up, career, save, UI or default selects this
 * model; only `validateT20ResearchMatchSetup` (packages/simulation) can, for research scripts and tests.
 *
 * Each term adds coefficientBp x featureBp / 10000 bp of logit to one category, where a skill feature is
 * (rating - centre) x 200 bp and the centre is the world-pack mean of that skill (rounded), so the component
 * redistributes outcomes between players rather than moving the average (no total is tuned).
 * Owner decisions of 25 November 2026: dismissal skill only through measured links (no separate dismissal term:
 * synthetic-alpha-01's bowled and lbw skill terms are cancelled here), and variation carries the wicket-taking
 * against economy trade-off. Fitted to docs/pavilion/stage-c/c2-fit.json (full-member men's T20 internationals,
 * matches up to 2023-08-31) by matching the game's per-rating-point effects, see docs/pavilion/stage-c/C2_CALIBRATED_SKILL.md.
 * C3 (owner decision, 25 November 2026): the per-point targets come from the rating-quarter gap of the players who
 * actually bat and bowl in the game, not the world's whole rating spread (docs/pavilion/stage-c/C3_SKILL_MAPPING.md).
 * The batting terms are therefore negative: synthetic-alpha-01's own batting terms are already steeper than real.
 * V3 (owner decision, C3 next iteration): batting aimed at the upper end of the measured real per-point ranges, with
 * less negative timing and power terms on a boundary and a stronger rotation term on a dot. V2 (hash 90ba2058...) produced
 * the C3 gate files c3-report.json and c3-skill-differentiation.json and stays their record.
 * Derived from Cricsheet data (https://cricsheet.org/), ODC-By 1.0 (https://cricsheet.org/licensing/).
 */
function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) if (child && typeof child === "object") deepFreeze(child);
  return Object.freeze(value);
}

export type CalibratedSkill = "TIMING" | "POWER" | "DEFENCE" | "ROTATION" | "CONTROL" | "MOVEMENT" | "VARIATION";
export type CalibratedTerms = Readonly<Record<string, Readonly<Partial<Record<CalibratedSkill, number>>>>>;

export const CALIBRATED_T20_PACK = deepFreeze({
  manifest: {
    modelId: "calibrated-t20-01",
    packVersion: "LC_CALIBRATED_T20_SKILL_V3",
    /** C3: per-point targets from the rating-quarter gap of the game's regular batters and bowlers (c3-mapping.json). */
    ratingMapping: "quarters of players with at least 100 balls faced or bowled, suggested elevens, captain V3",
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
    },
  },
  /** World-pack means of each skill (batting: keepers, batters, all-rounders; bowling: bowling-capable players). */
  centres: { TIMING: 60, POWER: 64, DEFENCE: 59, ROTATION: 60, CONTROL: 60, MOVEMENT: 62, VARIATION: 60 },
  /** Contact class (MISS, PAD, GROUND, AERIAL, EDGE, HIT_WICKET). */
  contact: {
    MISS: { CONTROL: 3000 },
    AERIAL: { VARIATION: 8000 },
    EDGE: { VARIATION: 8000 },
  } as CalibratedTerms,
  /** Run value after bat contact (categories 0, 1, 2, 3, 4, 6). */
  runs: {
    "0": { CONTROL: 6000, ROTATION: 3000 },
    "4": { TIMING: -800, POWER: -800, CONTROL: -9000, MOVEMENT: -9000, VARIATION: 3000 },
    "6": { TIMING: -800, POWER: -800, CONTROL: -9000, MOVEMENT: -9000, VARIATION: 3000 },
  } as CalibratedTerms,
  /** Cancels synthetic-alpha-01's bowled and lbw skill terms (controlBp, defenceBp in DELIVERY_STAGE_PACK). */
  cancelMissDismissalSkill: true,
});

/** SHA-256 of LC canonical JSON of CALIBRATED_T20_PACK; verified by the simulation model registry at load. */
export const CALIBRATED_T20_PACK_SHA256 = "8e7768676be4fa31cbfb77d1aea7bd62c91267d3ab0e17e3862751a1a26b20f0";
