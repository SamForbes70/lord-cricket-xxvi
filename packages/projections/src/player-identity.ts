import type { T20SeasonMatchCompletion } from "@lcxxvi/contracts";

/**
 * Player identity (E6): what a player is known for, their recent form, and milestones in reach.
 * Pure and deterministic. Every tag traces to a skill value in the world data and every number to a
 * recorded scorecard or career total. Nothing is invented and nothing is saved.
 */

/** Starting values. Design choices to tune after playtests, not calibration. */
export const PLAYER_IDENTITY_RULES = {
  tagMinSkill: 65,
  tagSquadTop: 3,
  maxTags: 2,
  formMatches: 5,
  /** Form needs this many matches before a trend is stated. */
  trendMinMatches: 3,
  /** Latest two against the earlier ones: a batter's mean runs must differ by this much, a bowler's mean wickets by this much. */
  battingTrendRuns: 10,
  bowlingTrendWickets: 1,
  runsStep: 500,
  runsWithin: 50,
  wicketsStep: 25,
  wicketsWithin: 5,
  matchesStep: 50,
} as const;

export interface IdentitySkills {
  defence: number; timing: number; power: number; rotation: number; vsPace: number; vsSpin: number;
  control: number; movement: number; variation: number; stamina: number;
  catching: number; groundFielding: number; throwing: number; keeping: number;
}
export interface IdentityPlayer { playerId: string; role: string; bowlingCapable: boolean; skills: IdentitySkills }
export type PlayerTagId =
  | "POWER_HITTER" | "ANCHOR" | "STRIKE_ROTATOR" | "PLAYS_SPIN" | "PLAYS_PACE"
  | "METRONOME" | "MOVES_IT" | "BAG_OF_TRICKS" | "WORKHORSE" | "SAFE_HANDS" | "GUN_FIELDER" | "GLOVESMAN";
export interface PlayerTag { id: PlayerTagId; label: string; value: number }

type Scope = "ALL" | "BOWLERS" | "KEEPERS";
/** In a fixed order, which breaks ties between tags of equal value. */
const TAGS: readonly { id: PlayerTagId; label: string; scope: Scope; measure: (s: IdentitySkills) => number }[] = [
  { id: "GLOVESMAN", label: "Glovesman", scope: "KEEPERS", measure: (s) => s.keeping },
  { id: "POWER_HITTER", label: "Power hitter", scope: "ALL", measure: (s) => s.power },
  { id: "ANCHOR", label: "Anchor", scope: "ALL", measure: (s) => (s.defence + s.timing) / 2 },
  { id: "STRIKE_ROTATOR", label: "Strike rotator", scope: "ALL", measure: (s) => s.rotation },
  { id: "PLAYS_SPIN", label: "Plays spin well", scope: "ALL", measure: (s) => s.vsSpin },
  { id: "PLAYS_PACE", label: "Plays pace well", scope: "ALL", measure: (s) => s.vsPace },
  { id: "METRONOME", label: "Metronome", scope: "BOWLERS", measure: (s) => s.control },
  { id: "MOVES_IT", label: "Moves it", scope: "BOWLERS", measure: (s) => s.movement },
  { id: "BAG_OF_TRICKS", label: "Bag of tricks", scope: "BOWLERS", measure: (s) => s.variation },
  { id: "WORKHORSE", label: "Workhorse", scope: "BOWLERS", measure: (s) => s.stamina },
  { id: "SAFE_HANDS", label: "Safe hands", scope: "ALL", measure: (s) => s.catching },
  { id: "GUN_FIELDER", label: "Gun fielder", scope: "ALL", measure: (s) => (s.groundFielding + s.throwing) / 2 },
];
const inScope = (scope: Scope, player: IdentityPlayer) =>
  scope === "ALL" || (scope === "BOWLERS" ? player.bowlingCapable : player.role === "KEEPER");

/**
 * Up to two tags per player. A tag needs the skill at the minimum or better and among the squad's top three
 * for that skill (players level with third place count), so a tag means "one of the best here at this".
 */
export function squadPlayerTags(squad: readonly IdentityPlayer[]): Record<string, PlayerTag[]> {
  const earned = new Map<string, PlayerTag[]>(squad.map((player) => [player.playerId, []]));
  for (const tag of TAGS) {
    const eligible = squad.filter((player) => inScope(tag.scope, player)).map((player) => ({ player, value: tag.measure(player.skills) }));
    const ranked = [...eligible].sort((a, b) => b.value - a.value);
    const cutoff = ranked[Math.min(PLAYER_IDENTITY_RULES.tagSquadTop, ranked.length) - 1]?.value ?? Infinity;
    for (const entry of eligible) {
      if (entry.value >= PLAYER_IDENTITY_RULES.tagMinSkill && entry.value >= cutoff) {
        earned.get(entry.player.playerId)!.push({ id: tag.id, label: tag.label, value: Math.round(entry.value) });
      }
    }
  }
  const result: Record<string, PlayerTag[]> = {};
  for (const [playerId, tags] of earned) {
    // Stable sort: equal values keep the fixed tag order.
    result[playerId] = [...tags].sort((a, b) => b.value - a.value).slice(0, PLAYER_IDENTITY_RULES.maxTags);
  }
  return result;
}

export interface FormEntry {
  fixtureId: string; roundNumber: number;
  batted: boolean; runs: number; ballsFaced: number; notOut: boolean;
  bowled: boolean; wickets: number; runsConceded: number;
}
export type FormTrend = "UP" | "LEVEL" | "DOWN";
export interface PlayerForm { entries: FormEntry[]; trend: FormTrend | null; discipline: "BATTING" | "BOWLING" | null; text: string }

/** A player's most recent matches this season, oldest first, from completed scorecards only. */
export function playerForm(completions: readonly T20SeasonMatchCompletion[], playerId: string): PlayerForm {
  const entries: FormEntry[] = [];
  const ordered = [...completions].sort((a, b) => a.roundNumber - b.roundNumber || a.fixtureOrdinal - b.fixtureOrdinal);
  for (const completion of ordered) {
    const bat = completion.scorecard.innings.map((innings) => innings.batting[playerId]).find((line) => line && (line.ballsFaced > 0 || line.dismissed || line.runs > 0));
    const bowl = completion.scorecard.innings.map((innings) => innings.bowling[playerId]).find((line) => line && line.legalBalls > 0);
    if (!bat && !bowl) continue;
    entries.push({
      fixtureId: completion.fixtureId, roundNumber: completion.roundNumber,
      batted: !!bat, runs: bat?.runs ?? 0, ballsFaced: bat?.ballsFaced ?? 0, notOut: bat ? !bat.dismissed : false,
      bowled: !!bowl, wickets: bowl?.wickets ?? 0, runsConceded: bowl?.runsConceded ?? 0,
    });
  }
  const recent = entries.slice(-PLAYER_IDENTITY_RULES.formMatches);
  const bowledCount = recent.filter((entry) => entry.bowled).length;
  const battedCount = recent.filter((entry) => entry.batted).length;
  const discipline = recent.length === 0 ? null : bowledCount > battedCount ? "BOWLING" : battedCount > 0 ? "BATTING" : "BOWLING";
  const used = discipline === "BOWLING" ? recent.filter((entry) => entry.bowled) : recent.filter((entry) => entry.batted);
  let trend: FormTrend | null = null;
  if (used.length >= PLAYER_IDENTITY_RULES.trendMinMatches) {
    const value = (entry: FormEntry) => (discipline === "BOWLING" ? entry.wickets : entry.runs);
    const mean = (items: FormEntry[]) => items.reduce((sum, entry) => sum + value(entry), 0) / items.length;
    const diff = mean(used.slice(-2)) - mean(used.slice(0, -2));
    const need = discipline === "BOWLING" ? PLAYER_IDENTITY_RULES.bowlingTrendWickets : PLAYER_IDENTITY_RULES.battingTrendRuns;
    trend = diff >= need ? "UP" : diff <= -need ? "DOWN" : "LEVEL";
  }
  const text = discipline === "BOWLING"
    ? used.map((entry) => `${entry.wickets}/${entry.runsConceded}`).join(", ")
    : used.map((entry) => `${entry.runs}${entry.notOut ? "*" : ""}`).join(", ");
  return { entries: recent, trend, discipline, text };
}

export interface PlayerMilestone { kind: "RUNS" | "WICKETS" | "MATCHES"; target: number; needed: number; text: string }

/** Career milestones within reach, from recorded career totals. */
export function playerMilestones(totals: { runs: number; wickets: number; matches: number }): PlayerMilestone[] {
  const found: PlayerMilestone[] = [];
  const next = (value: number, step: number) => (Math.floor(value / step) + 1) * step;
  const runsTarget = next(totals.runs, PLAYER_IDENTITY_RULES.runsStep);
  if (runsTarget - totals.runs <= PLAYER_IDENTITY_RULES.runsWithin) {
    const needed = runsTarget - totals.runs;
    found.push({ kind: "RUNS", target: runsTarget, needed, text: `${needed} ${needed === 1 ? "run" : "runs"} from ${runsTarget} career runs` });
  }
  const wicketsTarget = next(totals.wickets, PLAYER_IDENTITY_RULES.wicketsStep);
  if (wicketsTarget - totals.wickets <= PLAYER_IDENTITY_RULES.wicketsWithin) {
    const needed = wicketsTarget - totals.wickets;
    found.push({ kind: "WICKETS", target: wicketsTarget, needed, text: `${needed} ${needed === 1 ? "wicket" : "wickets"} from ${wicketsTarget} career wickets` });
  }
  if ((totals.matches + 1) % PLAYER_IDENTITY_RULES.matchesStep === 0) {
    found.push({ kind: "MATCHES", target: totals.matches + 1, needed: 1, text: `Next match is appearance number ${totals.matches + 1}` });
  }
  return found;
}
