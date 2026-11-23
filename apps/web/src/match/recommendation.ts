/**
 * "Recommended" choices on batter and bowler questions (E5). The recommendation is the command the computer captain
 * would play now (proposeOpponent*Command), which is pure: it reads the session and draws no random numbers. Marking a
 * candidate changes only what the player sees; the player's own click is the command that is sent.
 */
type ProposedCommand = { kind: string; payload: object } | null;

/** The player a proposed SET_BATTER or SET_BOWLER command names, or null for any other command. */
export function recommendedPlayerId(command: ProposedCommand): string | null {
  if (!command) return null;
  const payload = command.payload as { playerId?: unknown; bowlerId?: unknown };
  if (command.kind === "SET_BATTER" && typeof payload.playerId === "string") return payload.playerId;
  if (command.kind === "SET_BOWLER" && typeof payload.bowlerId === "string") return payload.bowlerId;
  return null;
}

/**
 * Returns the candidates with `recommended: true` on the computer captain's choice, when that choice is a selectable
 * candidate. Only batter and bowler questions are marked. If the adviser refuses the position (it throws on views it
 * does not cover), nothing is marked.
 */
export function withRecommendation<T extends { id: string; reason: string }>(
  phase: string,
  candidates: readonly T[],
  propose: () => ProposedCommand,
): (T & { recommended?: true })[] {
  if (phase !== "AWAITING_BATTER" && phase !== "AWAITING_BOWLER") return [...candidates];
  let id: string | null = null;
  try {
    id = recommendedPlayerId(propose());
  } catch {
    return [...candidates];
  }
  return candidates.map((c) => (id !== null && c.id === id && !c.reason ? { ...c, recommended: true as const } : c));
}

/** The computer captain's choice for each decision that is not a batter or bowler list. Every field is optional. */
export interface DecisionRecommendation {
  /** Bat or bowl first, after winning the toss. */
  innings?: "BAT" | "BOWL";
  /** Red ball: true to enforce the follow-on, false to bat again. */
  followOn?: boolean;
  /** Red ball: present and true only when the batting side's captain would declare now. */
  declare?: true;
  /** Red ball: present and true only when the fielding side's captain would take the new ball now. */
  newBall?: true;
  /** The aggression the batting captain would set for the striker. */
  aggression?: { playerId: string; level: number };
  /** The length and effort the fielding captain would set. */
  bowling?: { length: string; effort: string };
}

type Category = "INNINGS" | "FOLLOW_ON" | "DECLARATION" | "NEW_BALL" | "BATTING_PLAN" | "BOWLING_PLAN";

/**
 * Asks the computer captain (pure, no random draws) for its choice on every open decision. A proposer that throws, or
 * returns nothing for a decision, leaves that decision unmarked. For plans, "nothing" means the current plan already is
 * the captain's choice, so the current value is the recommendation.
 */
export function recommendDecisions(input: {
  phase: string;
  decisionTeamId: string | null;
  innings: {
    battingTeamId: string;
    bowlingTeamId: string;
    strikerEnd: "NORTH" | "SOUTH";
    northBatterId: string | null;
    southBatterId: string | null;
  } | null | undefined;
  battingPlans: Readonly<Record<string, { aggression: number }>>;
  bowlingPlan: { length: string; effort: string } | null;
  newBallAvailable?: boolean;
  redBall?: boolean;
  propose: (teamId: string, categories: readonly Category[]) => ProposedCommand;
}): DecisionRecommendation {
  const ask = (teamId: string | null | undefined, category: Category): ProposedCommand | undefined => {
    if (!teamId) return undefined;
    try {
      return input.propose(teamId, [category]);
    } catch {
      return undefined;
    }
  };
  const out: DecisionRecommendation = {};
  const payload = (c: ProposedCommand | undefined) => (c?.payload ?? {}) as Record<string, unknown>;
  if (input.phase === "AWAITING_INNINGS") {
    const c = ask(input.decisionTeamId, "INNINGS");
    const choice = payload(c).choice;
    if (c?.kind === "CHOOSE_INNINGS" && (choice === "BAT" || choice === "BOWL")) out.innings = choice;
  }
  if (input.phase === "AWAITING_FOLLOW_ON") {
    const c = ask(input.decisionTeamId, "FOLLOW_ON");
    const enforce = payload(c).enforce;
    if (c?.kind === "CHOOSE_FOLLOW_ON" && typeof enforce === "boolean") out.followOn = enforce;
  }
  const i = input.innings;
  if (input.phase !== "READY" || !i) return out;
  if (input.redBall) {
    if (ask(i.battingTeamId, "DECLARATION")?.kind === "DECLARE") out.declare = true;
    if (input.newBallAvailable && ask(i.bowlingTeamId, "NEW_BALL")?.kind === "TAKE_NEW_BALL") out.newBall = true;
  }
  const strikerId = i.strikerEnd === "NORTH" ? i.northBatterId : i.southBatterId;
  if (strikerId) {
    const c = ask(i.battingTeamId, "BATTING_PLAN");
    const p = payload(c);
    if (c === null) out.aggression = { playerId: strikerId, level: input.battingPlans[strikerId]?.aggression ?? 2 };
    else if (c?.kind === "SET_BATTING_PLAN" && p.playerId === strikerId && typeof p.aggression === "number")
      out.aggression = { playerId: strikerId, level: p.aggression };
  }
  if (input.bowlingPlan) {
    const c = ask(i.bowlingTeamId, "BOWLING_PLAN");
    const p = payload(c);
    if (c === null) out.bowling = { length: input.bowlingPlan.length, effort: input.bowlingPlan.effort };
    else if (c?.kind === "SET_BOWLING_PLAN" && typeof p.length === "string" && typeof p.effort === "string")
      out.bowling = { length: p.length, effort: p.effort };
  }
  return out;
}
