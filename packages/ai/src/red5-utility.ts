import type { RedBallTacticalProfile } from "@lcxxvi/contracts";

export const RED5_CONTINUATION_UTILITY_VERSION = "LC_RED5_UTILITY_V1" as const;
export const RED5_PLANNING_BUDGET_VERSION = "LC_RED5_PLANNING_BUDGET_V1" as const;

export interface Red5PlanningBudget {
  readonly version: typeof RED5_PLANNING_BUDGET_VERSION;
  readonly rolloutsPerAction: number;
  readonly maxCommandsPerRollout: number;
  readonly continueOversBeforeReview: number;
}

export const DEFAULT_RED5_PLANNING_BUDGET: Readonly<Red5PlanningBudget> = {
  version: RED5_PLANNING_BUDGET_VERSION,
  rolloutsPerAction: 2,
  maxCommandsPerRollout: 700,
  continueOversBeforeReview: 6,
};

export interface Red5RolloutOutcome {
  readonly completed: boolean;
  readonly winnerTeamId: string | null;
  readonly isDraw: boolean;
  readonly isTie: boolean;
  readonly wonByInnings: boolean;
  readonly evaluatingTeamLeadRuns: number;
}

export interface Red5DeclarationEvaluation {
  readonly utilityVersion: typeof RED5_CONTINUATION_UTILITY_VERSION;
  readonly budget: Red5PlanningBudget;
  readonly declareMeanUtility: number;
  readonly batOnMeanUtility: number;
  readonly recommendedDeclare: boolean;
  readonly rolloutsEvaluated: number;
}

export interface Red5FollowOnEvaluation {
  readonly utilityVersion: typeof RED5_CONTINUATION_UTILITY_VERSION;
  readonly budget: Red5PlanningBudget;
  readonly enforceMeanUtility: number;
  readonly batAgainMeanUtility: number;
  readonly recommendedEnforce: boolean;
  readonly rolloutsEvaluated: number;
}

function assertValidBudget(budget: Red5PlanningBudget): void {
  if (
    budget.version !== RED5_PLANNING_BUDGET_VERSION ||
    !Number.isSafeInteger(budget.rolloutsPerAction) ||
    budget.rolloutsPerAction < 1 ||
    budget.rolloutsPerAction > 32 ||
    !Number.isSafeInteger(budget.maxCommandsPerRollout) ||
    budget.maxCommandsPerRollout < 10 ||
    budget.maxCommandsPerRollout > 2500 ||
    !Number.isSafeInteger(budget.continueOversBeforeReview) ||
    budget.continueOversBeforeReview < 1 ||
    budget.continueOversBeforeReview > 60
  ) {
    throw new Error("LC_RED5_INVALID_PLANNING_BUDGET");
  }
}

export function scoreRed5RolloutOutcome(
  outcome: Red5RolloutOutcome,
  evaluatingTeamId: string,
  profile: RedBallTacticalProfile,
): number {
  if (!outcome.completed) {
    return Math.max(-300, Math.min(300, Math.round(outcome.evaluatingTeamLeadRuns / 2)));
  }
  if (outcome.winnerTeamId === evaluatingTeamId) {
    if (outcome.wonByInnings) {
      return profile === "AGGRESSIVE" ? 1200 : 1150;
    }
    return 1000;
  }
  if (outcome.isTie) return 250;
  if (outcome.isDraw) {
    return profile === "CONSERVATIVE" ? 350 : profile === "BALANCED" ? 150 : 25;
  }
  return profile === "CONSERVATIVE" ? -1150 : profile === "BALANCED" ? -1000 : -900;
}

export function evaluateRed5DeclarationRollouts(params: {
  readonly evaluatingTeamId: string;
  readonly profile: RedBallTacticalProfile;
  readonly budget?: Red5PlanningBudget;
  readonly simulateAction: (
    action: "DECLARE_NOW" | "BAT_ON",
    rolloutIndex: number,
    budget: Red5PlanningBudget,
  ) => Red5RolloutOutcome;
}): Red5DeclarationEvaluation {
  const budget = params.budget ?? DEFAULT_RED5_PLANNING_BUDGET;
  assertValidBudget(budget);
  let declareTotal = 0;
  let batOnTotal = 0;
  for (let r = 0; r < budget.rolloutsPerAction; r++) {
    declareTotal += scoreRed5RolloutOutcome(
      params.simulateAction("DECLARE_NOW", r, budget),
      params.evaluatingTeamId,
      params.profile,
    );
    batOnTotal += scoreRed5RolloutOutcome(
      params.simulateAction("BAT_ON", r, budget),
      params.evaluatingTeamId,
      params.profile,
    );
  }
  const declareMeanUtility = declareTotal / budget.rolloutsPerAction;
  const batOnMeanUtility = batOnTotal / budget.rolloutsPerAction;
  return {
    utilityVersion: RED5_CONTINUATION_UTILITY_VERSION,
    budget,
    declareMeanUtility,
    batOnMeanUtility,
    recommendedDeclare: declareMeanUtility > batOnMeanUtility,
    rolloutsEvaluated: budget.rolloutsPerAction * 2,
  };
}

export function evaluateRed5FollowOnRollouts(params: {
  readonly evaluatingTeamId: string;
  readonly profile: RedBallTacticalProfile;
  readonly budget?: Red5PlanningBudget;
  readonly simulateAction: (
    action: "ENFORCE" | "BAT_AGAIN",
    rolloutIndex: number,
    budget: Red5PlanningBudget,
  ) => Red5RolloutOutcome;
}): Red5FollowOnEvaluation {
  const budget = params.budget ?? DEFAULT_RED5_PLANNING_BUDGET;
  assertValidBudget(budget);
  let enforceTotal = 0;
  let batAgainTotal = 0;
  for (let r = 0; r < budget.rolloutsPerAction; r++) {
    enforceTotal += scoreRed5RolloutOutcome(
      params.simulateAction("ENFORCE", r, budget),
      params.evaluatingTeamId,
      params.profile,
    );
    batAgainTotal += scoreRed5RolloutOutcome(
      params.simulateAction("BAT_AGAIN", r, budget),
      params.evaluatingTeamId,
      params.profile,
    );
  }
  const enforceMeanUtility = enforceTotal / budget.rolloutsPerAction;
  const batAgainMeanUtility = batAgainTotal / budget.rolloutsPerAction;
  return {
    utilityVersion: RED5_CONTINUATION_UTILITY_VERSION,
    budget,
    enforceMeanUtility,
    batAgainMeanUtility,
    recommendedEnforce: enforceMeanUtility >= batAgainMeanUtility,
    rolloutsEvaluated: budget.rolloutsPerAction * 2,
  };
}
