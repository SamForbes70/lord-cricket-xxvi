import {
  PlayerSchema,
  TeamTacticsSchema,
  MatchStateSchema,
  type Player,
  type TeamTactics,
  type MatchState,
} from "./core.js";
import { WorldPackSchema, type WorldPack } from "./configuration.js";
function requireCondition(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(`INVALID_DATA: ${message}`);
}
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
export function validatePlayer(
  input: unknown,
  variationIds: readonly string[],
): Player {
  const p = PlayerSchema.parse(input);
  requireCondition(
    p.shotSectorWeights.some((n) => n > 0),
    "shot sector total must be positive",
  );
  requireCondition(
    unique(p.variations) &&
      p.variations.every((id) => variationIds.includes(id)),
    "unknown or duplicate variation",
  );
  return p;
}
export function validateTeamTactics(input: unknown): TeamTactics {
  const t = TeamTacticsSchema.parse(input);
  requireCondition(
    Object.keys(t.battingPlans).length === 2,
    "two batting plans required",
  );
  requireCondition(
    Object.entries(t.battingPlans).every(([key, p]) => key === p.playerId),
    "batting plan key must match player",
  );
  requireCondition(
    unique(t.fieldSlots.map((s) => s.playerId)) &&
      unique(t.fieldSlots.map((s) => s.slotId)),
    "unique field players and slots required",
  );
  return t;
}
/** Referential checks only: this does not certify cricket legality or result correctness. */
export function validateMatchReferences(
  input: unknown,
  variationIds: readonly string[],
): MatchState {
  const m = MatchStateSchema.parse(input);
  requireCondition(unique(m.teamIds), "teams must differ");
  requireCondition(
    Object.keys(m.xi).length === 2 &&
      m.teamIds.every((id) => Object.hasOwn(m.xi, id)),
    "XI keys must equal teams",
  );
  const players = Object.values(m.xi).flat();
  requireCondition(
    unique(players.map((p) => p.playerId)),
    "XI players must be globally unique",
  );
  players.forEach((p) => validatePlayer(p, variationIds));
  requireCondition(
    m.inningsOrder.every((t) => m.teamIds.includes(t)),
    "unknown innings team",
  );
  requireCondition(
    m.innings.length === 0
      ? m.activeInningsIndex === 0
      : m.activeInningsIndex < m.innings.length,
    "active innings missing",
  );
  requireCondition(
    Object.entries(m.tactics).every(
      ([team, t]) => m.teamIds.includes(team) && !!validateTeamTactics(t),
    ),
    "unknown tactics team",
  );
  requireCondition(
    Object.keys(m.fatigueBp).every((id) =>
      players.some((p) => p.playerId === id),
    ),
    "unknown fatigue player",
  );
  requireCondition(
    m.result === null ||
      m.result.winnerTeamId === null ||
      m.teamIds.includes(m.result.winnerTeamId),
    "winner not in match",
  );
  requireCondition(
    (m.phase === "COMPLETE") === (m.result !== null),
    "result and phase disagree",
  );
  return m;
}
export function validateWorldReferences(
  input: unknown,
  variationIds: readonly string[],
  rulesIds: readonly string[],
): WorldPack {
  const w = WorldPackSchema.parse(input);
  requireCondition(
    unique(w.players.map((p) => p.playerId)) &&
      unique(w.teams.map((t) => t.teamId)) &&
      unique(w.grounds.map((g) => g.groundId)),
    "duplicate world IDs",
  );
  w.players.forEach((p) => validatePlayer(p, variationIds));
  const ids = new Set(w.players.map((p) => p.playerId));
  requireCondition(
    w.teams.every(
      (t) => unique(t.squadIds) && t.squadIds.every((id) => ids.has(id)),
    ),
    "invalid squad references",
  );
  requireCondition(
    unique(w.rulesIds) && w.rulesIds.every((id) => rulesIds.includes(id)),
    "unknown rule references",
  );
  return w;
}
