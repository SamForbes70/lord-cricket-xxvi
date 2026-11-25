/**
 * Career fixture policy V2: the match-day XI (`LC_SEASON_XI_BASELINE_V2`) and the fixture bowling choice
 * (`LC_FIXTURE_CAPTAIN_V2`) for computer-run career fixtures.
 *
 * V1 (`selectBaselineXI` in offscreen-fixture.ts and `fixtureAutopilotStep` in t20-match.ts) is unchanged and still
 * defines every frozen fixture, quick-match corpus, checksum and every season already recorded with it. V1 ranked
 * players by batting + bowling + fielding, so anyone who could bowl outranked a better specialist batter, batted the
 * side in that order, and shared the overs equally among everyone who could bowl. V2 applies the approved stage A
 * selector (`rankedEleven` in @lcxxvi/data, the rule behind `suggestedEleven`) with condition added, and gives the
 * overs to the best bowlers while never leaving the innings unbowlable.
 *
 * Pure and deterministic: skills, roles, condition and the public innings state in, a selection or a command out. No
 * random draw, no clock, no hidden or future information.
 */
import type { Player, T20Command, T20TeamSelection } from "@lcxxvi/contracts";
import { isBowlingCapable, rankedEleven } from "@lcxxvi/data";
import { fixtureAutopilotStep, type T20Session } from "./t20-match.js";

export const SEASON_XI_BASELINE_V2_POLICY_ID = "LC_SEASON_XI_BASELINE_V2" as const;
export const FIXTURE_CAPTAIN_V2_POLICY_ID = "LC_FIXTURE_CAPTAIN_V2" as const;

/** Non-keeper bowling-capable players the V2 XI must carry; `rankedEleven` aims for six. Same floor as V1. */
export const SEASON_XI_V2_MINIMUM_BOWLERS = 5;

export type SeasonXIV2Condition = Readonly<{
  fatigueBp: number;
  availability: "AVAILABLE" | "UNAVAILABLE";
  battingReadiness: number;
  bowlingReadiness: number;
}>;

export type SeasonXIV2Candidate = Readonly<{ player: Readonly<Player>; condition: SeasonXIV2Condition }>;

const codePointOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Batting value: the four batting skills `suggestedEleven` uses, plus batting readiness on each of them. */
export function seasonXIV2BattingScore(candidate: SeasonXIV2Candidate): number {
  const s = candidate.player.skills.T20;
  return s.timing + s.power + s.defence + s.rotation + candidate.condition.battingReadiness * 4;
}

/** Bowling value: the three bowling skills `suggestedEleven` uses, plus bowling readiness on each of them. */
export function seasonXIV2BowlingScore(candidate: SeasonXIV2Candidate): number {
  const s = candidate.player.skills.T20;
  return s.control + s.movement + s.variation + candidate.condition.bowlingReadiness * 3;
}

/**
 * `LC_SEASON_XI_BASELINE_V2`. Unavailable players are left out. Of the rest: the keeper with the best batting; the four
 * best bowling-capable players by bowling; the six best remaining by batting; then, while the side has fewer than six
 * bowling-capable players, the weakest batter who cannot bowl gives way to the remaining bowling-capable player who
 * adds most in batting and bowling together (3 x batting + 4 x bowling, so all-rounders are preferred). The batting order
 * is batting value, best first, so specialist batters open. Ties: lower fatigue, then playerId by code point. The
 * keeper captains, as in `suggestedEleven`.
 */
export function selectSeasonXIV2(teamId: string, squad: readonly SeasonXIV2Candidate[]): T20TeamSelection {
  const available = squad.filter((c) => c.condition.availability === "AVAILABLE");
  if (available.length < 11) throw new Error(`LC_SEASON_XI_V2_INSUFFICIENT_AVAILABLE_PLAYERS:${teamId}`);
  const byId = new Map(available.map((c) => [c.player.playerId, c]));
  const view = available.map((c) => c.player);
  const of = (p: Readonly<Player>) => byId.get(p.playerId)!;
  const tieBreak = (a: Readonly<Player>, b: Readonly<Player>) =>
    of(a).condition.fatigueBp - of(b).condition.fatigueBp || codePointOrder(a.playerId, b.playerId);
  let eleven: { playerIds: string[]; captainId: string; keeperId: string };
  try {
    eleven = rankedEleven(view, (p) => seasonXIV2BattingScore(of(p)), (p) => seasonXIV2BowlingScore(of(p)), tieBreak);
  } catch {
    throw new Error(`LC_SEASON_XI_V2_NO_AVAILABLE_KEEPER:${teamId}`);
  }
  const bowlers = eleven.playerIds.filter((id) => id !== eleven.keeperId && isBowlingCapable(byId.get(id)!.player));
  if (eleven.playerIds.length !== 11) throw new Error(`LC_SEASON_XI_V2_FAILED_TO_SELECT_XI:${teamId}`);
  if (bowlers.length < SEASON_XI_V2_MINIMUM_BOWLERS) throw new Error(`LC_SEASON_XI_V2_INSUFFICIENT_AVAILABLE_BOWLERS:${teamId}`);
  return { teamId, playerIds: eleven.playerIds, captainId: eleven.captainId, keeperId: eleven.keeperId };
}

export type FixtureBowlerOvers = Readonly<{ playerId: string; oversLeft: number }>;

/**
 * Whether `oversRemaining` overs can still be bowled by `bowlers`, no bowler bowling consecutive overs and the first
 * not bowled by `previousOverBowlerId`.
 *
 * A deliberate copy of `canCompleteBowling` in packages/ai/src/bowling-plan.ts: scripts/check-boundaries.mjs does not
 * let simulation import @lcxxvi/ai. tests/unit/fixture-policy-v2.test.ts checks the two agree case by case.
 */
export function canCompleteFixtureBowling(
  oversRemaining: number,
  bowlers: readonly FixtureBowlerOvers[],
  previousOverBowlerId: string | null,
): boolean {
  if (!Number.isInteger(oversRemaining) || oversRemaining < 0) throw new Error("LC_FIXTURE_CAPTAIN_V2_INVALID_OVERS_REMAINING");
  if (oversRemaining === 0) return true;
  const open = Math.ceil(oversRemaining / 2);
  const afterPrevious = Math.floor(oversRemaining / 2);
  let capacity = 0;
  for (const b of bowlers) {
    if (!Number.isInteger(b.oversLeft) || b.oversLeft < 0) throw new Error("LC_FIXTURE_CAPTAIN_V2_INVALID_OVERS_LEFT");
    capacity += Math.min(b.oversLeft, b.playerId === previousOverBowlerId ? afterPrevious : open);
  }
  return capacity >= oversRemaining;
}

const T20_INNINGS_BALLS = 120;
const T20_BOWLER_QUOTA_BALLS = 24;
const T20_DEATH_FROM_BALL = 90;
/** Held back for the death overs: a bowler with one over left before the death phase scores this much less. */
const DEATH_OVER_RESERVE = 30;

/**
 * The bowler `LC_FIXTURE_CAPTAIN_V2` picks for the next over, in preference order then made feasible.
 *
 * Eligible as for V1: in the XI with a bowling style, not the keeper, not the previous over's bowler, quota not used.
 * Preference: control + movement + variation, less fatigue / 90 (the tactical captain's fatigue weight), less 30 for a
 * bowler with one over left before the death overs (the tactical captain's reserve rule), ties by playerId code point.
 * The first preference after whom the rest of the innings can still be bowled is chosen; if none can (the innings was
 * already unbowlable), the first preference, as `feasibleBowlerChoice` does.
 */
export function fixtureCaptainV2BowlerChoice(s: T20Session): string {
  const innings = s.core.innings[s.core.activeInningsIndex];
  if (!innings) throw new Error("LC_FIXTURE_CAPTAIN_V2_NO_ACTIVE_INNINGS");
  const field = s.setup.teams.find((t) => t.teamId === innings.innings.bowlingTeamId);
  if (!field) throw new Error("LC_FIXTURE_CAPTAIN_V2_UNKNOWN_TEAM");
  const legalBalls = innings.innings.legalBalls;
  const previous = innings.innings.previousOverBowlerId;
  const able = field.xi.filter((p) => p.bowlingStyle !== null && p.playerId !== field.keeperId);
  const ballsLeft = (id: string) => T20_BOWLER_QUOTA_BALLS - innings.bowling[id]!.legalBalls;
  const candidates = able.filter((p) => p.playerId !== previous && ballsLeft(p.playerId) > 0);
  if (candidates.length === 0) throw new Error("LC_FIXTURE_CAPTAIN_V2_NO_ELIGIBLE_BOWLER");
  const death = legalBalls >= T20_DEATH_FROM_BALL;
  const score = (p: Readonly<Player>) => {
    const k = p.skills.T20;
    return k.control + k.movement + k.variation - (s.core.fatigueBp[p.playerId] ?? 0) / 90
      - (!death && ballsLeft(p.playerId) <= 6 ? DEATH_OVER_RESERVE : 0);
  };
  const preference = [...candidates]
    .sort((a, b) => score(b) - score(a) || codePointOrder(a.playerId, b.playerId))
    .map((p) => p.playerId);
  const oversRemaining = Math.ceil((T20_INNINGS_BALLS - legalBalls) / 6);
  const bowlers = able
    .map((p) => ({ playerId: p.playerId, oversLeft: Math.floor(ballsLeft(p.playerId) / 6) }))
    .filter((b) => b.oversLeft > 0);
  for (const id of preference) {
    const after = bowlers.map((b) => (b.playerId === id ? { playerId: id, oversLeft: b.oversLeft - 1 } : b));
    if (canCompleteFixtureBowling(oversRemaining - 1, after, id)) return id;
  }
  return preference[0]!;
}

/**
 * `LC_FIXTURE_CAPTAIN_V2`: `fixtureAutopilotStep` in every phase except the bowler choice, which is
 * `fixtureCaptainV2BowlerChoice`. For V2 career fixtures only; frozen fixtures, corpora and V1 seasons keep V1.
 */
export function fixtureAutopilotStepV2(s: T20Session): T20Command {
  const command = fixtureAutopilotStep(s);
  if (command.kind !== "SET_BOWLER") return command;
  return { ...command, payload: { ...command.payload, bowlerId: fixtureCaptainV2BowlerChoice(s) } };
}
