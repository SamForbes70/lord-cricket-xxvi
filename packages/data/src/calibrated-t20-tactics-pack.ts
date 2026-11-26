/**
 * Stage C research model `calibrated-t20-01`, slice C5: the tactics component. RESEARCH ONLY.
 *
 * `gameplayIntegrationPermitted` is false. Only the calibrated research model reads this pack (through the model
 * registry in packages/simulation); synthetic-alpha-01 is unchanged, and no game set-up, career, save, replay or UI
 * selects the calibrated model.
 *
 * DESIGN CHOICES, NOT FITTED. Cricsheet records neither the field nor the length or pace of a delivery, so no real
 * yardstick exists for these effects. Each one is a bounded, cricket-plausible mechanism on an existing branch of the
 * delivery model, with a trade-off rather than a free gain. No run or result multiplier; no outcome is forced.
 * Sizes and the measured effects are in docs/pavilion/stage-c/C5_TACTICS_AND_REFIT.md.
 *  - length: by the EXECUTED length. Additive contact terms, run-value terms after a ground or aerial shot, and
 *    bowled and lbw terms; plus a term on the aggression feature for contact (a yorker is hard to slog, a good
 *    length punishes a slog with edges, a short ball invites the pull in the air). These add to synthetic-alpha-01's
 *    own length terms (yorker miss +2,000 and aerial -1,000; full toss aerial +5,000 and ground +2,000; short aerial
 *    and edge +1,500), which stay.
 *  - effort: on the effort feature (+10,000 MAXIMUM, 0 NORMAL, -10,000 CONSERVE). Pace beats the bat more often
 *    (misses and edges) but travels further off it (fours and sixes), and accuracy drops (a term on the intended
 *    length's weight). synthetic-alpha-01's wide and no-ball terms and the fatigue cost stay.
 *  - field: the slip cordon. An edge carries to the keeper's area or the slips' area. Coverage of an edge is
 *    keeperEdgeBp plus slipEdgeBp for each slip in the field (at most 10,000), and it sets both the catch chance and
 *    the ring cover on the edge's run value. With no slips, an edge is caught less often and runs away for more.
 */
function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) if (child && typeof child === "object") deepFreeze(child);
  return Object.freeze(value);
}

export type CalibratedLengthId = "YORKER" | "FULL" | "GOOD" | "SHORT" | "FULL_TOSS";

export const CALIBRATED_T20_TACTICS_PACK = deepFreeze({
  manifest: {
    modelId: "calibrated-t20-01",
    packVersion: "LC_CALIBRATED_T20_TACTICS_V1",
    status: "RESEARCH_ONLY",
    gameplayIntegrationPermitted: false,
    basis: "design choices: Cricsheet has no field, length or pace data; bounded and labelled, not fitted",
    base: {
      probabilityPackSha256: "d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab",
      stagePackSha256: "34efa3037702e44a134ea38b414eab3e97c6f79f10b3e5458bc2ab05412e5d7a",
    },
  },
  length: {
    /** Additive contact intercepts (bp) by executed length. */
    contact: {
      YORKER: { MISS: 500, PAD: 500, GROUND: 0, AERIAL: -1500, EDGE: 0, HIT_WICKET: 0 },
      FULL: { MISS: 0, PAD: 0, GROUND: 0, AERIAL: 500, EDGE: 1000, HIT_WICKET: 0 },
      GOOD: { MISS: 0, PAD: 0, GROUND: 0, AERIAL: -500, EDGE: 500, HIT_WICKET: 0 },
      SHORT: { MISS: 0, PAD: -2000, GROUND: 0, AERIAL: 0, EDGE: 0, HIT_WICKET: 0 },
      FULL_TOSS: { MISS: 0, PAD: 0, GROUND: 0, AERIAL: 0, EDGE: 0, HIT_WICKET: 0 },
    },
    /** Coefficient (bp) on (aggression - 2) x 10,000 for contact, by executed length. */
    contactAggression: {
      YORKER: { MISS: 1000, PAD: 0, GROUND: 0, AERIAL: -500, EDGE: 0, HIT_WICKET: 0 },
      FULL: { MISS: 0, PAD: 0, GROUND: 0, AERIAL: 0, EDGE: 0, HIT_WICKET: 0 },
      GOOD: { MISS: 0, PAD: 0, GROUND: 0, AERIAL: 0, EDGE: 1000, HIT_WICKET: 0 },
      SHORT: { MISS: 0, PAD: 0, GROUND: 0, AERIAL: 1000, EDGE: 0, HIT_WICKET: 0 },
      FULL_TOSS: { MISS: 0, PAD: 0, GROUND: 0, AERIAL: 0, EDGE: 0, HIT_WICKET: 0 },
    },
    /** Additive run-value intercepts (bp) after a GROUND or AERIAL shot, by executed length. */
    runs: {
      YORKER: { "0": 500, "1": 0, "2": 0, "3": 0, "4": -2000, "6": -2000 },
      FULL: { "0": -500, "1": 0, "2": 0, "3": 0, "4": 800, "6": 0 },
      GOOD: { "0": 1500, "1": 0, "2": 0, "3": 0, "4": -1000, "6": -500 },
      SHORT: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "6": 1500 },
      FULL_TOSS: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 2000, "6": 2000 },
    },
    /** Additive intercepts (bp) on the bowled and lbw chance after a miss or pad, by executed length. */
    dismissal: {
      YORKER: { BOWLED: 5000, LBW: 3000 },
      FULL: { BOWLED: 1500, LBW: 2000 },
      GOOD: { BOWLED: 0, LBW: 0 },
      SHORT: { BOWLED: -5000, LBW: -6000 },
      FULL_TOSS: { BOWLED: -3000, LBW: -3000 },
    },
  },
  effort: {
    /** Coefficients (bp) on the effort feature for contact. */
    contact: { MISS: 1000, PAD: 0, GROUND: 0, AERIAL: 0, EDGE: 1000, HIT_WICKET: 0 },
    /** Coefficients (bp) on the effort feature for each run category after a GROUND or AERIAL shot. */
    runs: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 1000, "6": 1000 },
    /** Coefficient (bp) on the effort feature for the intended length's weight (accuracy). */
    intendedLengthBp: -1500,
  },
  field: { keeperEdgeBp: 6000, slipEdgeBp: 2000 },
});

/** SHA-256 of LC canonical JSON of CALIBRATED_T20_TACTICS_PACK; verified by the simulation model registry at load. */
export const CALIBRATED_T20_TACTICS_PACK_SHA256 = "0cad9b7b5bddf95d7264db7c1db5f86146363173bbcf1f421a448305c20f7055";
