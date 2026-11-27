import {
  POST_MATCH_ANALYSIS_VERSION,
  projectPostMatchAnalysis,
  type PostMatchAnalysis,
  type PostMatchAnalysisInput,
  type PostMatchDecision,
  type PostMatchDecisionKind,
} from "./post-match-analysis.js";

/**
 * LC_POST_MATCH_ANALYSIS_V2 (Directive 03, "post-match explanations naming the correct model and policy versions").
 *
 * V1's analysis (the same phases, turning points, decisions and fixed rules, `rulesVersion` V1) with two changes:
 * 1. it names the versions: the model recorded in the match's own setup, and plainly that the match record does not
 *    store which computer captain or batting policy made the computer's decisions;
 * 2. the measured note on each decision comes from the tactical validation measured under the versions it names
 *    (`POST_MATCH_EVIDENCE_V2`), with its figures, instead of V1's notes from the captain V2 run.
 * V1 (`projectPostMatchAnalysis`) is unchanged. Pure, derived on read, nothing saved. See
 * docs/pavilion/POST_MATCH_ANALYSIS_V2.md.
 */
export const POST_MATCH_ANALYSIS_V2_VERSION = "LC_POST_MATCH_ANALYSIS_V2" as const;

/**
 * The evidence the V2 notes quote: the tactical validation of the batting policy V3 measurement, `synthetic-alpha-01`
 * under captain V6, 200 matches per experiment, the captain asked before every ball. Committed in
 * docs/pavilion/batting-policy-v3/tactical-validation-v6-synthetic.json (BATTING_POLICY_V3.md, section 5, merged in #172).
 */
export const POST_MATCH_EVIDENCE_V2 = {
  date: "2026-11-27",
  dateText: "27 November 2026",
  model: "synthetic-alpha-01",
  captain: "LC_T20_TACTICAL_CAPTAIN_V6",
  battingPolicy: "LC_T20_BATTING_POLICY_V3",
  validationVersion: "LC_PAVILION_TACTICAL_VALIDATION_V1",
  advance: "DELIVERY",
  matchesPerExperiment: 200,
  page: "docs/pavilion/BATTING_POLICY_V3.md",
  file: "docs/pavilion/batting-policy-v3/tactical-validation-v6-synthetic.json",
} as const;

/** One experiment of the evidence file, as committed: the good side's share of decided matches with its 95% interval. */
export interface PostMatchExperimentV2 {
  experiment: string;
  goodWinPercentOfDecided: number;
  goodWinPercent95: readonly [number, number];
  meanRunDifference: number;
  meanRunDifference95: readonly [number, number];
}
/** Copied from the evidence file; a unit test checks every value against it. */
export const POST_MATCH_EXPERIMENTS_V2: Readonly<Record<string, PostMatchExperimentV2>> = Object.fromEntries(([
  ["selection-weakest", 56, [48.9, 62.8], 3.1, [-0.7, 6.8]],
  ["selection-old-rule", 80.8, [74.8, 85.7], 13.2, [9.4, 17.1]],
  ["batting-order-reversed", 73.7, [67.1, 79.4], 8.1, [4.2, 11.9]],
  ["aggression-all-out", 53, [46.1, 59.9], 4.5, [0.3, 8.6]],
  ["aggression-blocking", 65.8, [58.9, 72.1], 6, [3.1, 9]],
  ["bowling-worst-first", 49.7, [42.8, 56.7], -0.2, [-3.8, 3.4]],
  ["bowling-plan-full-max", 51, [44.1, 57.9], 0.8, [-2.9, 4.5]],
  ["bowling-length-good", 52.3, [45.3, 59.1], 0.6, [-3.1, 4.2]],
  ["bowling-effort-maximum", 51, [44.1, 57.9], 0.8, [-2.9, 4.4]],
  ["bowling-effort-conserve", 49.5, [42.6, 56.4], -0.6, [-4, 2.9]],
  ["field-attacking-throughout", 56.1, [49.1, 62.9], 3.7, [-0.1, 7.5]],
] as const).map(([experiment, share, shareCi, runs, runsCi]) => [experiment, {
  experiment, goodWinPercentOfDecided: share, goodWinPercent95: shareCi, meanRunDifference: runs, meanRunDifference95: runsCi,
}]));

/**
 * What the evidence shows for a kind of decision. CLEAR: every experiment for it has an interval above 50%. MIXED: some
 * do and some do not. NONE_DETECTED: no experiment for it has an interval above 50%. NOT_MEASURED: no experiment.
 */
export type PostMatchMeasuredEffectV2 = "CLEAR" | "MIXED" | "NONE_DETECTED" | "NOT_MEASURED";

function pct(value: number): string { return `${value.toFixed(1)}%`; }
function ci([low, high]: readonly [number, number]): string { return `${low.toFixed(1)} to ${high.toFixed(1)}`; }
function share(id: string): string {
  const e = POST_MATCH_EXPERIMENTS_V2[id]!;
  return `${pct(e.goodWinPercentOfDecided)} of decided matches, 95% interval ${ci(e.goodWinPercent95)}`;
}
function shareRange(ids: readonly string[]): string {
  const values = ids.map((id) => POST_MATCH_EXPERIMENTS_V2[id]!.goodWinPercentOfDecided);
  return `between ${pct(Math.min(...values))} and ${pct(Math.max(...values))} of decided matches`;
}
function runs(id: string): string {
  const e = POST_MATCH_EXPERIMENTS_V2[id]!;
  return `${e.meanRunDifference.toFixed(1)} runs an innings, ${ci(e.meanRunDifference95)}`;
}

/** The experiments behind each kind of decision. Toss, bat or bowl, and batting intent have none. */
export const POST_MATCH_DECISION_EXPERIMENTS_V2: Readonly<Record<PostMatchDecisionKind, readonly string[]>> = {
  SELECTION: ["selection-old-rule", "selection-weakest"],
  BATTER: ["batting-order-reversed"],
  BATTING_PLAN: ["aggression-blocking", "aggression-all-out"],
  BOWLER: ["bowling-worst-first"],
  BOWLING_PLAN: ["bowling-plan-full-max", "bowling-length-good", "bowling-effort-maximum", "bowling-effort-conserve"],
  FIELD: ["field-attacking-throughout"],
  TOSS: [],
  INNINGS_CHOICE: [],
};

/** Derived from the experiments' intervals, never set by hand. */
export function postMatchEffectV2(kind: PostMatchDecisionKind): PostMatchMeasuredEffectV2 {
  const ids = POST_MATCH_DECISION_EXPERIMENTS_V2[kind];
  if (ids.length === 0) return "NOT_MEASURED";
  const above = ids.filter((id) => POST_MATCH_EXPERIMENTS_V2[id]!.goodWinPercent95[0] > 50).length;
  return above === ids.length ? "CLEAR" : above === 0 ? "NONE_DETECTED" : "MIXED";
}

const UNDER = "Measured under these versions";
/** The note shown with each kind of decision. Figures are the evidence file's; "the captain's side" is the good side. */
export const POST_MATCH_MEASURED_NOTES_V2: Readonly<Record<PostMatchDecisionKind, string>> = {
  SELECTION:
    `${UNDER}: against an eleven picked by the old selection rule, the suggested eleven won ${share("selection-old-rule")}. ` +
    `Against the weakest eleven it won ${share("selection-weakest")}, which the measurement cannot tell apart from no effect.`,
  BATTER:
    `${UNDER}: against the same eleven batting in reverse order, the usual order won ${share("batting-order-reversed")}. ` +
    "Single batter picks were not measured on their own.",
  BATTING_PLAN:
    `${UNDER}, for one aggression held all match: against blocking (aggression 0) every ball, the computer captain's batting won ${share("aggression-blocking")}. ` +
    `Against attacking (aggression 4) every ball it won ${share("aggression-all-out")}, not a measurable difference in results, and scored ${runs("aggression-all-out")} more. ` +
    "Batting intent was not measured.",
  BOWLER:
    `${UNDER}: against the weakest available bowler every over, the computer captain's choices won ${share("bowling-worst-first")}. ` +
    "No detectable effect on results, so this is shown as a record only.",
  BOWLING_PLAN:
    `${UNDER}: against four bowling plans held all innings (full length at maximum effort, good length throughout, maximum effort, conserve effort), ` +
    `the computer captain's plans won ${shareRange(["bowling-plan-full-max", "bowling-length-good", "bowling-effort-maximum", "bowling-effort-conserve"])}, every 95% interval including 50%. ` +
    "No detectable effect on results, so this is shown as a record only.",
  FIELD:
    `${UNDER}: against the two-slip powerplay field held for all 20 overs, the computer captain's fields won ${share("field-attacking-throughout")}. ` +
    "No detectable effect on results, so this is shown as a record only. Other field changes were not measured.",
  TOSS: "Not measured.",
  INNINGS_CHOICE: "Not measured.",
};

/** The versions a finished match records, from its own setup (`setup.versions`). Null when not available. */
export interface PostMatchRecordedVersionsV2 {
  model: string;
  modelHash: string;
  rules: string;
}
/** This build's computer captain, from @lcxxvi/ai. Not the match's: the match record does not store it. */
export interface PostMatchBuildCaptainV2 {
  captain: string;
  battingPolicy: string;
}

export interface PostMatchAnalysisV2Input extends PostMatchAnalysisInput {
  recordedVersions: PostMatchRecordedVersionsV2 | null;
  buildCaptain: PostMatchBuildCaptainV2;
}

export type PostMatchDecisionV2 = Omit<PostMatchDecision, "measured"> & {
  measured: PostMatchMeasuredEffectV2;
  measuredNote: string;
};

export interface PostMatchVersionsV2 {
  /** From the match's own setup, or null when the setup was not available. */
  model: string | null;
  modelHash: string | null;
  rules: string | null;
  /** Always false: commands store the computer as `AI:<team>` and nothing else, so its captain version is not in the record. */
  computerCaptainRecorded: false;
  /** Decision commands the record credits to the computer, all sides. */
  computerDecisions: number;
  /** This build's computer captain and batting policy. Not the match's own record. */
  buildCaptain: PostMatchBuildCaptainV2;
  /** The notes were measured under the match's own model. False when the match's model is another, or not recorded. */
  evidenceModelMatches: boolean;
}

export interface PostMatchAnalysisV2 extends Omit<PostMatchAnalysis, "version" | "decisions"> {
  version: typeof POST_MATCH_ANALYSIS_V2_VERSION;
  /** Phases, turning points, decisions and "what followed" follow V1's fixed rules unchanged. */
  rulesVersion: typeof POST_MATCH_ANALYSIS_VERSION;
  decisions: PostMatchDecisionV2[];
  versions: PostMatchVersionsV2;
  evidence: typeof POST_MATCH_EVIDENCE_V2;
}

export function projectPostMatchAnalysisV2(input: PostMatchAnalysisV2Input): PostMatchAnalysisV2 {
  const { recordedVersions, buildCaptain, ...v1Input } = input;
  const v1 = projectPostMatchAnalysis(v1Input);
  const decisions = v1.decisions.map((decision): PostMatchDecisionV2 => ({
    ...decision,
    measured: postMatchEffectV2(decision.kind),
    measuredNote: POST_MATCH_MEASURED_NOTES_V2[decision.kind],
  }));
  const computerDecisions = Object.values(v1.commandCounts).reduce((sum, counts) => sum + counts.ai, 0);
  return {
    version: POST_MATCH_ANALYSIS_V2_VERSION,
    rulesVersion: v1.version,
    matchId: v1.matchId,
    phases: v1.phases,
    turningPoints: v1.turningPoints,
    decisions,
    commandCounts: v1.commandCounts,
    versions: {
      model: recordedVersions?.model ?? null,
      modelHash: recordedVersions?.modelHash ?? null,
      rules: recordedVersions?.rules ?? null,
      computerCaptainRecorded: false,
      computerDecisions,
      buildCaptain: { captain: buildCaptain.captain, battingPolicy: buildCaptain.battingPolicy },
      evidenceModelMatches: recordedVersions?.model === POST_MATCH_EVIDENCE_V2.model,
    },
    evidence: POST_MATCH_EVIDENCE_V2,
  };
}
