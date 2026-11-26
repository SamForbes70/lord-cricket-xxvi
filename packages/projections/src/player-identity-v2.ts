import type { HistoricalPlayerRecord } from "@lcxxvi/contracts";
import { playerMilestones, type IdentitySkills, type PlayerForm } from "./player-identity.js";
import {
  matchIntroduction,
  playingStyle,
  type IdentityBowlingStyle,
  type PlayingStyle,
  type StoryFact,
} from "./player-identity-v1.js";

/**
 * LC_PLAYER_IDENTITY_V2 (Pavilion entertainment track, slice 2, 26 November 2026). Two presentation-only additions:
 *
 * - Factual match introductions. When a batter walks out or a bowler comes on in a managed career T20 match, the
 *   introduction states the player's league record before this match: runs or wickets, best figures, the latest
 *   scores or figures, and a career milestone in reach. Every number comes from the recorded career (the historical
 *   statistics projection) and is listed in `facts`. Without a record (exhibitions, quick matches, roster careers)
 *   the V1 style-only introduction is used unchanged.
 * - Selection advice. In the selection room, short reasons for each option drawn from playing styles, ratings and
 *   recorded form. Inferences are marked `SUGGESTION`; ratings and recorded figures are marked as such. No reason
 *   claims an effect on the result: the match engine reads ratings, never the style labels.
 *
 * Pure and deterministic. It reads no clock, no `Math.random` and no simulation random stream, and nothing it returns
 * is saved, so no persisted format changes and no match result can depend on it.
 */
export const PLAYER_IDENTITY_V2_VERSION = "LC_PLAYER_IDENTITY_V2" as const;

/** Display rules. Design choices for playtests, not calibration. */
export const PLAYER_IDENTITY_V2_RULES = {
  /** Latest league scores or figures named in a match introduction. */
  introRecentMatches: 3,
  /** A rating gap named in the selection advice must be at least this. */
  adviceRatingGap: 5,
  /** At most this many reasons per selection option. */
  adviceMaxReasons: 3,
} as const;

/** One player's league record before the match, reduced to what an introduction may state. */
export interface CareerIntroRecord {
  playerId: string;
  matches: number;
  battingInnings: number;
  runs: number;
  highScore: { runs: number; notOut: boolean } | null;
  fifties: number;
  hundreds: number;
  bowlingLegalBalls: number;
  /** League matches in which the player bowled. */
  bowlingInnings: number;
  wickets: number;
  bestBowling: { wickets: number; runs: number } | null;
  /** Latest league scores, oldest first, such as "41*". */
  recentBatting: string[];
  /** Latest league figures, oldest first, such as "2/31". */
  recentBowling: string[];
}

/**
 * The read-only summary handed from the career to the match view with a managed fixture. Derived on launch from the
 * recorded career; never saved and never part of the launch, the binding or any export.
 */
export interface CareerIntroSummary {
  version: typeof PLAYER_IDENTITY_V2_VERSION;
  matchGameId: string;
  /** League T20 records only, as they stood before this match. */
  players: Record<string, CareerIntroRecord>;
}

/** The historical-statistics fields an introduction reads. */
export type CareerIntroSource = Pick<
  HistoricalPlayerRecord,
  | "playerId" | "matches" | "battingInnings" | "runs" | "highScoreRuns" | "highScoreNotOut" | "fifties" | "hundreds"
  | "bowlingLegalBalls" | "bowlingInnings" | "bowlingWickets" | "bestBowlingWickets" | "bestBowlingRuns" | "contributingMatches"
>;

/** A player's record for the introduction, from the career's historical statistics. */
export function careerIntroRecord(source: CareerIntroSource): CareerIntroRecord {
  const ordered = [...source.contributingMatches].sort(
    (a, b) => a.seasonNumber - b.seasonNumber || a.roundNumber - b.roundNumber,
  );
  const n = PLAYER_IDENTITY_V2_RULES.introRecentMatches;
  const recentBatting = ordered
    .filter((m) => m.battedInnings !== null && m.runsScored !== null)
    .slice(-n)
    .map((m) => `${m.runsScored}${m.notOut ? "*" : ""}`);
  const recentBowling = ordered
    .filter((m) => (m.bowledLegalBalls ?? 0) > 0)
    .slice(-n)
    .map((m) => `${m.bowlingWickets ?? 0}/${m.bowlingRunsConceded ?? 0}`);
  return {
    playerId: source.playerId,
    matches: source.matches,
    battingInnings: source.battingInnings,
    runs: source.runs,
    highScore: source.battingInnings > 0 ? { runs: source.highScoreRuns, notOut: source.highScoreNotOut } : null,
    fifties: source.fifties,
    hundreds: source.hundreds,
    bowlingLegalBalls: source.bowlingLegalBalls,
    bowlingInnings: source.bowlingInnings,
    wickets: source.bowlingWickets,
    bestBowling:
      source.bowlingLegalBalls > 0 && source.bestBowlingRuns !== null
        ? { wickets: source.bestBowlingWickets, runs: source.bestBowlingRuns }
        : null,
    recentBatting,
    recentBowling,
  };
}

/**
 * The summary for one managed match: every player named, with a record from the career where one exists. A player
 * the historical statistics do not list has no recorded league match, which is itself a recorded fact.
 */
export function careerIntroSummary(
  matchGameId: string,
  playerIds: readonly string[],
  records: readonly CareerIntroSource[],
): CareerIntroSummary {
  const byId = new Map(records.map((record) => [record.playerId, record]));
  const players: Record<string, CareerIntroRecord> = {};
  for (const playerId of [...playerIds].sort()) {
    const source = byId.get(playerId);
    players[playerId] = source
      ? careerIntroRecord(source)
      : {
          playerId, matches: 0, battingInnings: 0, runs: 0, highScore: null, fifties: 0, hundreds: 0,
          bowlingLegalBalls: 0, bowlingInnings: 0, wickets: 0, bestBowling: null, recentBatting: [], recentBowling: [],
        };
  }
  return { version: PLAYER_IDENTITY_V2_VERSION, matchGameId, players };
}

export interface MatchIntro {
  /** "CAREER" when built from the recorded career, otherwise the V1 style-only introduction. */
  source: "CAREER" | "STYLE_ONLY";
  /** The short text shown in the chip. */
  visible: string;
  /** The full introduction: the chip's title and its screen-reader text. */
  sentence: string;
  /** Every number in `visible` and `sentence` that comes from the record. */
  facts: StoryFact[];
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const score = (runs: number, notOut: boolean) => `${runs}${notOut ? "*" : ""}`;

/**
 * The introduction when a batter walks out or a bowler comes on. With a career record it adds the league record
 * before this match; without one it is exactly the V1 introduction. `isNew` is false once the batter has faced or
 * the bowler has bowled in the innings; the chip then shows the style alone.
 */
export function matchIntroductionV2(
  name: string,
  style: PlayingStyle,
  kind: "BATTER" | "BOWLER",
  record: CareerIntroRecord | null,
  isNew: boolean,
): MatchIntro {
  const lead = kind === "BATTER" ? "Walks out" : "On to bowl";
  const v1 = matchIntroduction(name, style, kind);
  if (!record) {
    return { source: "STYLE_ONLY", visible: isNew ? `${lead}: ${style.label}` : style.label, sentence: v1, facts: [] };
  }
  const facts: StoryFact[] = [];
  const fact = <T extends number | string>(key: string, value: T): T => {
    facts.push({ key, value });
    return value;
  };
  let headline: string;
  const detail: string[] = [];
  if (kind === "BATTER") {
    if (record.battingInnings === 0) {
      headline = "first league innings";
      detail.push(
        record.matches === 0
          ? "No league match recorded before this one."
          : `No league innings in ${plural(fact("matches", record.matches), "recorded match", "recorded matches")}.`,
      );
    } else {
      const runs = fact("runs", record.runs);
      const innings = fact("battingInnings", record.battingInnings);
      const hs = record.highScore!;
      const best = score(fact("highScore", hs.runs), hs.notOut);
      const tons = record.hundreds > 0 ? `, ${plural(fact("hundreds", record.hundreds), "hundred")}` : "";
      const fifties = record.fifties > 0 ? `, ${plural(fact("fifties", record.fifties), "fifty", "fifties")}` : "";
      detail.push(`League record before this match: ${runs} runs in ${plural(innings, "innings", "innings")}, best ${best}${tons}${fifties}.`);
      if (record.recentBatting.length > 0) {
        fact("recentBatting", record.recentBatting.join(", "));
        detail.push(`Latest league scores, oldest first: ${record.recentBatting.join(", ")}.`);
      }
      const milestone = playerMilestones({ runs: record.runs, wickets: 0, matches: 0 }).find((m) => m.kind === "RUNS");
      if (milestone) {
        fact("milestoneNeeded", milestone.needed);
        fact("milestoneTarget", milestone.target);
        headline = `${milestone.needed} from ${milestone.target} runs`;
        detail.push(`Needs ${plural(milestone.needed, "run")} for ${milestone.target} league runs.`);
      } else if (innings >= PLAYER_IDENTITY_V2_RULES.introRecentMatches) {
        headline = `${runs} runs, best ${best}`;
      } else {
        headline = `${runs} runs in ${plural(innings, "innings", "innings")}`;
      }
    }
  } else {
    if (record.bowlingLegalBalls === 0) {
      headline = "first league over";
      detail.push(
        record.matches === 0
          ? "No league match recorded before this one."
          : `Has not bowled in ${plural(fact("matches", record.matches), "recorded league match", "recorded league matches")}.`,
      );
    } else {
      const wickets = fact("wickets", record.wickets);
      const best = record.bestBowling
        ? `${fact("bestBowlingWickets", record.bestBowling.wickets)}/${fact("bestBowlingRuns", record.bestBowling.runs)}`
        : null;
      detail.push(`League record before this match: ${plural(wickets, "wicket")}${best ? `, best ${best}` : ""}.`);
      if (record.recentBowling.length > 0) {
        fact("recentBowling", record.recentBowling.join(", "));
        detail.push(`Latest league figures, oldest first: ${record.recentBowling.join(", ")}.`);
      }
      const milestone = playerMilestones({ runs: 0, wickets: record.wickets, matches: 0 }).find((m) => m.kind === "WICKETS");
      if (milestone) {
        fact("milestoneNeeded", milestone.needed);
        fact("milestoneTarget", milestone.target);
        headline = `${milestone.needed} from ${milestone.target} wickets`;
        detail.push(`Needs ${plural(milestone.needed, "wicket")} for ${milestone.target} league wickets.`);
      } else {
        headline = best && wickets > 0
          ? `${plural(wickets, "wicket")}, best ${best}`
          : `${plural(wickets, "wicket")} in ${plural(fact("bowlingInnings", record.bowlingInnings), "match", "matches")}`;
      }
    }
  }
  return {
    source: "CAREER",
    visible: isNew ? `${lead}: ${headline}` : style.label,
    sentence: `${v1} ${detail.join(" ")}`,
    facts,
  };
}

/** A selection option or XI member, as the advice needs it. */
export interface AdvicePlayer {
  playerId: string;
  name: string;
  role: string;
  bowlingStyle: IdentityBowlingStyle | null;
  /** T20 ratings. */
  skills: IdentitySkills;
}

/** RECORD: recorded figures. RATING: the world's ratings. SUGGESTION: an inference from styles, never a prediction. */
export type AdviceKind = "RECORD" | "RATING" | "SUGGESTION";
export interface AdviceReason { kind: AdviceKind; id: string; text: string }

const SPIN: ReadonlySet<string> = new Set(["OFF_SPIN", "LEG_SPIN", "SLOW_LEFT_ARM", "LEFT_ARM_WRIST"]);
const bowls = (p: AdvicePlayer) => p.bowlingStyle !== null && (p.role === "BOWLER" || p.role === "ALLROUNDER");
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Up to three short reasons for picking `option` over `other`. `restOfXi` is the match-day XI without either
 * option. Reasons are deterministic and come in a fixed order: style balance (suggestions), then the rating that
 * names the option's style when it is clearly higher, then recorded form this season.
 */
export function selectionAdvice(input: {
  option: AdvicePlayer;
  other: AdvicePlayer;
  restOfXi: readonly AdvicePlayer[];
  /** This season's recorded form, from completed scorecards, or null when not known. */
  form: PlayerForm | null;
}): AdviceReason[] {
  const { option, other, restOfXi, form } = input;
  const reasons: AdviceReason[] = [];
  const styleOf = (p: AdvicePlayer) => playingStyle({ playerId: p.playerId, role: p.role, bowlingStyle: p.bowlingStyle, skills: p.skills }).primary;
  const style = styleOf(option);
  const otherStyle = styleOf(other);
  const label = lower(style.label);
  if (style.basis.length > 0 && style.id !== otherStyle.id) {
    const same = restOfXi.filter((p) => styleOf(p).id === style.id).length;
    if (same === 0) {
      reasons.push({ kind: "SUGGESTION", id: "ADDS_STYLE", text: `Adds ${article(label)} ${label}: the rest of your XI has none.` });
    } else if (same >= 2) {
      reasons.push({ kind: "SUGGESTION", id: "STYLE_COVERED", text: `Your XI already has ${same} other ${label}s.` });
    }
  }
  if (bowls(option) && !(bowls(other) && SPIN.has(other.bowlingStyle!) === SPIN.has(option.bowlingStyle!))) {
    const spinner = SPIN.has(option.bowlingStyle!);
    const alike = restOfXi.filter((p) => bowls(p) && SPIN.has(p.bowlingStyle!) === spinner).length;
    if (alike === 0) {
      reasons.push({ kind: "SUGGESTION", id: spinner ? "ONLY_SPINNER" : "ONLY_PACE", text: `Would be the XI's only ${spinner ? "spin" : "pace"} bowler.` });
    }
  }
  const basis = style.basis[0];
  if (basis) {
    const mine = Math.round(option.skills[basis.skill]);
    const theirs = Math.round(other.skills[basis.skill]);
    if (mine - theirs >= PLAYER_IDENTITY_V2_RULES.adviceRatingGap) {
      const phrase = basis.label.startsWith("against") ? basis.label : `for ${basis.label}`;
      reasons.push({ kind: "RATING", id: "RATING_GAP", text: `Rates ${mine} ${phrase}; ${other.name} rates ${theirs}.` });
    }
  }
  if (form) {
    // Lead with the discipline the option's style names, so a bowler's figures come before his scores.
    const bowled = form.entries.filter((e) => e.bowled).map((e) => `${e.wickets}/${e.runsConceded}`);
    const batted = form.entries.filter((e) => e.batted).map((e) => `${e.runs}${e.notOut ? "*" : ""}`);
    const useBowling = style.discipline === "BOWLING" ? bowled.length > 0 : batted.length === 0 && bowled.length > 0;
    const shown = form.entries.length > 0 ? (useBowling ? bowled : batted) : form.text ? [form.text] : [];
    if (shown.length > 0) {
      reasons.push({
        kind: "RECORD",
        id: "SEASON_FORM",
        text: `This season, latest ${useBowling ? "figures" : "scores"}, oldest first: ${shown.join(", ")}.`,
      });
    }
  }
  return reasons.slice(0, PLAYER_IDENTITY_V2_RULES.adviceMaxReasons);
}

/** The caveat shown with the advice. */
export const SELECTION_ADVICE_NOTE =
  "Suggestions read playing styles and recorded figures. They are not a prediction: the match uses ratings, not style labels.";
