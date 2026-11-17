import { RESOURCE_TABLE_AVERAGE_SCORE, resourcesRemaining } from "@lcxxvi/data";

/**
 * Stage 14 rain-revised targets with the fictional `LC_RESOURCE_TABLE_01` (owner decision 2a). Integer arithmetic only,
 * so every platform agrees. Resources are in basis points of a full innings (10000).
 *
 * This is the arithmetic only. No match engine uses it yet: the frozen innings ledger and its pinned schemas only accept
 * a full 120 or 300 ball innings, so a rain-affected match needs its own engine (an open owner decision).
 *
 * Method, the same shape as the published Duckworth-Lewis approach:
 * - An innings' resources are what was available when it started, less what each interruption took away.
 * - If the side batting second has fewer resources, its target scales the first-innings score down in proportion.
 * - If it has more, the extra resources are worth a share of a fictional average score
 *   (`RESOURCE_TABLE_AVERAGE_SCORE`).
 * - The target is that par score plus one. A par score at a stoppage decides a match that cannot resume.
 */

export type RainFormat = "T20" | "ODI";

/** One stoppage: when it happened, and how many legal balls the innings lost. */
export type RainInterruption = { ballsBowled: number; wicketsLost: number; ballsLost: number };

function averageScore(format: RainFormat): number {
  return RESOURCE_TABLE_AVERAGE_SCORE[format];
}

/** Resources available to an innings that started with `startBalls` and suffered these interruptions, in order. */
export function inningsResources(format: RainFormat, startBalls: number, interruptions: readonly RainInterruption[]): number {
  let resources = resourcesRemaining(format, startBalls, 0);
  let allocation = startBalls;
  for (const stop of interruptions) {
    if (stop.ballsBowled > allocation || stop.ballsLost < 0) throw new Error("RAIN_INTERRUPTION_INVALID");
    const leftBefore = allocation - stop.ballsBowled;
    const leftAfter = Math.max(0, leftBefore - stop.ballsLost);
    resources -= resourcesRemaining(format, leftBefore, stop.wicketsLost) - resourcesRemaining(format, leftAfter, stop.wicketsLost);
    allocation -= leftBefore - leftAfter;
  }
  return Math.max(0, resources);
}

/** The par score for the side batting second, given both sides' resources. */
export function parScore(format: RainFormat, firstInningsRuns: number, firstResources: number, secondResources: number): number {
  if (firstResources <= 0) throw new Error("RAIN_RESOURCES_INVALID");
  if (secondResources <= firstResources) return Math.floor((firstInningsRuns * secondResources) / firstResources);
  return firstInningsRuns + Math.floor((averageScore(format) * (secondResources - firstResources)) / 10000);
}

/** The revised target: par plus one. */
export function revisedTarget(format: RainFormat, firstInningsRuns: number, firstResources: number, secondResources: number): number {
  return parScore(format, firstInningsRuns, firstResources, secondResources) + 1;
}

/**
 * Par at a stoppage that ends the match: the side batting second is judged on the resources it has used so far
 * (its available resources less those still left with `ballsLeft` and `wicketsLost`).
 */
export function parAtStoppage(input: {
  format: RainFormat;
  firstInningsRuns: number;
  firstResources: number;
  secondResourcesAvailable: number;
  ballsLeft: number;
  wicketsLost: number;
}): number {
  const used = input.secondResourcesAvailable - resourcesRemaining(input.format, input.ballsLeft, input.wicketsLost);
  return parScore(input.format, input.firstInningsRuns, input.firstResources, Math.max(0, used));
}
