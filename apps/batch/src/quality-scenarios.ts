import { createHash } from "node:crypto";
import {
  DeliveryRecordedSchema, canonicalJson, type T20MatchSetupRequest, type WorldPack,
} from "@lcxxvi/contracts";
import {
  createT20CorpusRequest, createT20Session, executeT20Command, fixtureAutopilotStep,
  projectT20Scorecard, type FrozenT20Setup, type T20Session,
} from "@lcxxvi/simulation";
import { tacticalT20Step } from "./tactical-match.js";

export const QUALITY_POLICIES = ["BASELINE", "TACTICAL"] as const;
export type QualityPolicy = typeof QUALITY_POLICIES[number];
const PHASES = ["POWERPLAY", "MIDDLE", "DEATH"] as const;
const phase = (legalBalls: number) => legalBalls < 36 ? "POWERPLAY" : legalBalls < 90 ? "MIDDLE" : "DEATH";
const empty = () => ({ runs: 0, wickets: 0, legalBalls: 0, attempts: 0, dots: 0, boundaries: 0 });

/** Builds a bounded grid without changing the frozen world or accepted corpus. */
export function qualityScenarioRequests(template: unknown, world: WorldPack, seedsPerCell: number): T20MatchSetupRequest[] {
  if (!Number.isSafeInteger(seedsPerCell) || seedsPerCell < 1 || seedsPerCell > 8) throw new Error("QUALITY_SEED_COUNT");
  const teams = world.teams.map(team => team.teamId).sort();
  const grounds = world.grounds.map(ground => ground.groundId).sort();
  if (teams.length !== 8 || new Set(teams).size !== 8 || grounds.length !== 8 || new Set(grounds).size !== 8) {
    throw new Error("QUALITY_WORLD_DIMENSIONS");
  }
  const requests: T20MatchSetupRequest[] = [];
  for (let pair = 0; pair < 4; pair++) {
    for (const groundId of grounds) {
      for (let seedIndex = 0; seedIndex < seedsPerCell; seedIndex++) {
        const caseId = `quality-p${pair}-${groundId}-s${seedIndex}`;
        requests.push(createT20CorpusRequest({
          caseId, seed: `LC_M7_QUALITY_GRID_V1_${caseId}`,
          teamIds: [teams[pair * 2]!, teams[pair * 2 + 1]!], groundId,
          modelId: "synthetic-alpha-01", rulesId: "LC_T20_01", stagePackId: "synthetic-alpha-01-delivery-v1",
          fixtureCaptainPolicyId: "LC_FIXTURE_CAPTAIN_V1", expectedFinalEventHash: null,
          expectedScorecardSha256: null, oracleStatus: "GENERATED_FROM_PRODUCTION_NOT_INDEPENDENT",
        }, template, world));
      }
    }
  }
  return requests;
}

/** Observes accepted commands and delivery events without adding random draws. */
export function runQualityScenario(setup: FrozenT20Setup, policy: QualityPolicy) {
  if (!QUALITY_POLICIES.includes(policy)) throw new Error("QUALITY_UNKNOWN_POLICY");
  let session: T20Session = createT20Session(setup);
  const stats = [0, 1].map(() => ({ ...empty(), illegals: 0,
    phases: Object.fromEntries(PHASES.map(name => [name, empty()])) as Record<typeof PHASES[number], ReturnType<typeof empty>> }));
  const commands: Record<string, number> = {};
  const deliveryPlans: Record<string, number> = {};
  while (session.core.phase !== "COMPLETE") {
    if (session.revision >= 900) throw new Error("QUALITY_COMMAND_LIMIT");
    const command = policy === "BASELINE" ? fixtureAutopilotStep(session) : tacticalT20Step(session);
    const before = session;
    const next = executeT20Command(session, command).session;
    commands[command.kind] = (commands[command.kind] ?? 0) + 1;
    for (const entry of next.events.slice(before.events.length)) {
      if (entry.type !== "DELIVERY_RECORDED") continue;
      const payload = entry.payload as { event: unknown };
      const event = DeliveryRecordedSchema.parse(payload.event);
      const innings = stats[event.inningsIndex];
      if (!innings) throw new Error("QUALITY_INNINGS_INDEX");
      const p = innings.phases[phase(innings.legalBalls)];
      const runs = event.batRuns + Object.values(event.extras).reduce((a, b) => a + b, 0);
      const increments = { runs, wickets: Number(event.dismissal !== null), legalBalls: Number(event.legalBall),
        attempts: 1, dots: Number(runs === 0), boundaries: Number(event.boundary !== "NONE") };
      for (const key of Object.keys(increments) as (keyof typeof increments)[]) {
        innings[key] += increments[key]; p[key] += increments[key];
      }
      innings.illegals += Number(!event.legalBall);
      const batting = before.core.battingPlans[event.strikerId];
      const bowling = before.core.bowlingPlan;
      const key = `${batting?.aggression ?? 2}/${batting?.intent ?? "NORMAL"}/${bowling?.length}/${bowling?.effort}`;
      deliveryPlans[key] = (deliveryPlans[key] ?? 0) + 1;
    }
    session = next;
  }
  const scorecard = projectT20Scorecard(session);
  for (const [index, card] of scorecard.innings.entries()) {
    const actual = stats[index]!;
    if (actual.runs !== card.runs || actual.wickets !== card.wickets || actual.legalBalls !== card.legalBalls) {
      throw new Error("QUALITY_SCORECARD_RECONCILIATION");
    }
  }
  const innings = scorecard.innings.map((card, index) => ({
    ...stats[index]!, battingTeamId: card.battingTeamId, targetToWin: card.targetToWin,
    termination: card.targetToWin !== null && card.runs >= card.targetToWin ? "CHASE_WON"
      : card.wickets === 10 ? "ALL_OUT" : "ALLOCATION_END",
  }));
  return { policy, seed: setup.seed, matchId: setup.matchId, groundId: setup.ground.groundId,
    teamIds: setup.teams.map(team => team.teamId), innings, commands, deliveryPlans,
    finalEventHash: session.lastEventHash,
    scorecardSha256: createHash("sha256").update(canonicalJson(scorecard)).digest("hex"), result: scorecard.result };
}

export type QualityScenarioResult = ReturnType<typeof runQualityScenario>;

/** Keeps successful chases separate from complete first-innings distributions. */
export function summariseQualityScenarios(rows: QualityScenarioResult[]) {
  if (!rows.length) throw new Error("QUALITY_EMPTY_COHORT");
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.matchId}/${row.policy}`;
    if (seen.has(key)) throw new Error("QUALITY_DUPLICATE_RUN");
    seen.add(key);
  }
  const summaries = QUALITY_POLICIES.map(policy => {
    const selected = rows.filter(row => row.policy === policy);
    if (!selected.length) throw new Error("QUALITY_MISSING_POLICY");
    const first = selected.map(row => row.innings[0]!);
    const attempts = first.reduce((sum, innings) => sum + innings.attempts, 0);
    const scores = first.map(innings => innings.runs).sort((a, b) => a - b);
    return { policy, matches: selected.length,
      firstMeanRuns: first.reduce((sum, innings) => sum + innings.runs, 0) / first.length,
      firstMeanWickets: first.reduce((sum, innings) => sum + innings.wickets, 0) / first.length,
      firstScorePercentiles: { p10: scores[Math.ceil(scores.length * .1) - 1]!,
        p50: scores[Math.ceil(scores.length * .5) - 1]!, p90: scores[Math.ceil(scores.length * .9) - 1]! },
      firstDotFraction: first.reduce((sum, innings) => sum + innings.dots, 0) / attempts,
      firstBoundaryFraction: first.reduce((sum, innings) => sum + innings.boundaries, 0) / attempts,
      chaseEndings: Object.fromEntries(["CHASE_WON", "ALL_OUT", "ALLOCATION_END"].map(ending =>
        [ending, selected.filter(row => row.innings[1]!.termination === ending).length])) };
  });
  const pairs = rows.filter(row => row.policy === "BASELINE").map(baseline => {
    const tactical = rows.find(row => row.matchId === baseline.matchId && row.policy === "TACTICAL");
    if (!tactical || tactical.seed !== baseline.seed || canonicalJson(tactical.teamIds) !== canonicalJson(baseline.teamIds)
      || tactical.groundId !== baseline.groundId || tactical.innings[0]!.battingTeamId !== baseline.innings[0]!.battingTeamId) {
      throw new Error("QUALITY_UNPAIRED_SCENARIO");
    }
    return { matchId: baseline.matchId, firstRunsDifference: tactical.innings[0]!.runs - baseline.innings[0]!.runs };
  });
  if (pairs.length * 2 !== rows.length) throw new Error("QUALITY_UNPAIRED_SCENARIO");
  return { policies: summaries, pairedFirstRunsDifferenceMean: pairs.reduce((sum, row) => sum + row.firstRunsDifference, 0) / pairs.length, pairs };
}
