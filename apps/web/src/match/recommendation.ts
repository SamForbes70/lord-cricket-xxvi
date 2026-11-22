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
