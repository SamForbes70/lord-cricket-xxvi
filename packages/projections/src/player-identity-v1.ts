import { playerMilestones, type IdentitySkills } from "./player-identity.js";

/**
 * LC_PLAYER_IDENTITY_V1 (Pavilion entertainment track, 26 November 2026): who a player is, in a line or two.
 *
 * - Playing style: a label read from the player's T20 ratings by fixed thresholds. Each label names the ratings it
 *   rests on, so a "Boundary hitter" always has the power rating to back it.
 * - Personality: two traits, chosen by an FNV-1a hash of the version and the player id. Flavour only: no trait
 *   claims a skill, a result or a fact, so a trait can never contradict the ratings or the record.
 * - Story so far: one paragraph built only from recorded career figures that the caller passes in. Every number in
 *   it is listed in `facts`.
 *
 * Pure and deterministic. It reads no clock, no `Math.random` and no simulation random stream, and nothing it returns
 * is saved, so the same save always shows the same identity and no match result can depend on it.
 */
export const PLAYER_IDENTITY_VERSION = "LC_PLAYER_IDENTITY_V1" as const;

/** Rating thresholds for the style labels. Design choices for playtests, not calibration. */
export const PLAYING_STYLE_RULES = {
  /** Power at or above this makes a hitter. About the top quarter of the fictional eight-club world. */
  power: 68,
  hitterRotation: 60,
  enforcerVsPace: 65,
  anchorDefence: 62,
  anchorTiming: 60,
  spinPlayerVsSpin: 66,
  accumulatorRotation: 64,
  /** A bowling skill at or above this names the bowler's style. */
  bowlingSkill: 65,
  specialistKeeping: 70,
} as const;

export type IdentityRole = "BATTER" | "BOWLER" | "ALLROUNDER" | "KEEPER";
export type IdentityBowlingStyle = "FAST" | "MEDIUM" | "OFF_SPIN" | "LEG_SPIN" | "SLOW_LEFT_ARM" | "LEFT_ARM_WRIST";

export interface PlayingStyleInput {
  playerId: string;
  role: IdentityRole | string;
  bowlingStyle: IdentityBowlingStyle | null;
  /** T20 ratings, 0 to 100. */
  skills: IdentitySkills;
}

export type PlayingStyleId =
  | "FINISHER" | "PACE_ENFORCER" | "BOUNDARY_HITTER" | "ANCHOR" | "SPIN_PLAYER" | "ACCUMULATOR" | "ALL_PURPOSE_BATTER"
  | "SPECIALIST_KEEPER" | "KEEPER_BATTER"
  | "SWING_SEAM" | "CHANGE_OF_PACE" | "LINE_AND_LENGTH" | "FAST_BOWLER" | "MEDIUM_PACER"
  | "MYSTERY_WRIST_SPINNER" | "BIG_TURNING_WRIST_SPINNER" | "ACCURATE_WRIST_SPINNER" | "WRIST_SPINNER"
  | "MISERLY_FINGER_SPINNER" | "BIG_TURNING_FINGER_SPINNER" | "CRAFTY_FINGER_SPINNER" | "FINGER_SPINNER";

type SkillKey = keyof IdentitySkills;
export interface StyleBasis { skill: SkillKey; label: string; value: number }
export interface PlayingStyle {
  id: PlayingStyleId;
  label: string;
  discipline: "BATTING" | "BOWLING" | "KEEPING";
  /** The ratings the label rests on, each at or above its threshold. Empty only for a plain fallback label. */
  basis: StyleBasis[];
}

const SKILL_LABEL: Record<SkillKey, string> = {
  defence: "defence", timing: "timing", power: "power", rotation: "strike rotation", vsPace: "against pace",
  vsSpin: "against spin", control: "control", movement: "movement", variation: "variation", stamina: "stamina",
  catching: "catching", groundFielding: "ground fielding", throwing: "throwing", keeping: "keeping",
};

/** A named style and the minimum T20 ratings it needs. */
export type StyleRow = { id: PlayingStyleId; label: string; needs: readonly (readonly [SkillKey, number])[] };

/** Each named batting style and the minimum ratings it needs. */
export const BATTING_STYLE_TABLE: readonly StyleRow[] = [
  { id: "FINISHER", label: "Finisher", needs: [["power", PLAYING_STYLE_RULES.power], ["rotation", PLAYING_STYLE_RULES.hitterRotation]] },
  { id: "PACE_ENFORCER", label: "Pace enforcer", needs: [["power", PLAYING_STYLE_RULES.power], ["vsPace", PLAYING_STYLE_RULES.enforcerVsPace]] },
  { id: "BOUNDARY_HITTER", label: "Boundary hitter", needs: [["power", PLAYING_STYLE_RULES.power]] },
  { id: "ANCHOR", label: "Anchor", needs: [["defence", PLAYING_STYLE_RULES.anchorDefence], ["timing", PLAYING_STYLE_RULES.anchorTiming]] },
  { id: "SPIN_PLAYER", label: "Spin specialist", needs: [["vsSpin", PLAYING_STYLE_RULES.spinPlayerVsSpin]] },
  { id: "ACCUMULATOR", label: "Accumulator", needs: [["rotation", PLAYING_STYLE_RULES.accumulatorRotation]] },
];

type Family = "PACE" | "WRIST" | "FINGER";
const FAMILY: Record<IdentityBowlingStyle, Family> = {
  FAST: "PACE", MEDIUM: "PACE", OFF_SPIN: "FINGER", SLOW_LEFT_ARM: "FINGER", LEG_SPIN: "WRIST", LEFT_ARM_WRIST: "WRIST",
};
const SPIN_NOUN: Record<IdentityBowlingStyle, string> = {
  FAST: "fast bowler", MEDIUM: "medium pacer", OFF_SPIN: "off-spinner", SLOW_LEFT_ARM: "left-arm spinner",
  LEG_SPIN: "leg-spinner", LEFT_ARM_WRIST: "left-arm wrist-spinner",
};
const B = PLAYING_STYLE_RULES.bowlingSkill;
/** Bowling styles by family; `noun` is replaced by the bowling-style noun. */
export const BOWLING_STYLE_TABLE: Record<Family, readonly StyleRow[]> = {
  PACE: [
    { id: "SWING_SEAM", label: "Swing and seam bowler", needs: [["movement", B]] },
    { id: "CHANGE_OF_PACE", label: "Change-of-pace specialist", needs: [["variation", B]] },
    { id: "LINE_AND_LENGTH", label: "Line-and-length seamer", needs: [["control", B]] },
  ],
  WRIST: [
    { id: "MYSTERY_WRIST_SPINNER", label: "Mystery noun", needs: [["variation", B]] },
    { id: "BIG_TURNING_WRIST_SPINNER", label: "Big-turning noun", needs: [["movement", B]] },
    { id: "ACCURATE_WRIST_SPINNER", label: "Accurate noun", needs: [["control", B]] },
  ],
  FINGER: [
    { id: "MISERLY_FINGER_SPINNER", label: "Miserly noun", needs: [["control", B]] },
    { id: "BIG_TURNING_FINGER_SPINNER", label: "Big-turning noun", needs: [["movement", B]] },
    { id: "CRAFTY_FINGER_SPINNER", label: "Crafty noun", needs: [["variation", B]] },
  ],
};

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const basisOf = (skills: IdentitySkills, needs: readonly (readonly [SkillKey, number])[]): StyleBasis[] =>
  needs.map(([skill]) => ({ skill, label: SKILL_LABEL[skill], value: Math.round(skills[skill]) }));
const meets = (skills: IdentitySkills, needs: readonly (readonly [SkillKey, number])[]) =>
  needs.every(([skill, min]) => skills[skill] >= min);

const battingStrength = (s: IdentitySkills) => (s.timing + s.power + s.defence + s.rotation) / 4;
const bowlingStrength = (s: IdentitySkills) => (s.control + s.movement + s.variation) / 3;

/**
 * Of the rows whose minimums are all met, the one with the widest margin: its weakest needed rating is furthest
 * above that rating's minimum (ties keep table order). A player who is good at many things is named for what stands
 * out most. Null when no row is met.
 */
function widestMargin(rows: readonly StyleRow[], skills: IdentitySkills): StyleRow | null {
  let best: StyleRow | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (!meets(skills, row.needs)) continue;
    const score = Math.min(...row.needs.map(([key, min]) => skills[key] - min));
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

/** The named batting style, or null when none is earned. */
export function battingStyle(skills: IdentitySkills): PlayingStyle | null {
  const row = widestMargin(BATTING_STYLE_TABLE, skills);
  return row ? { id: row.id, label: row.label, discipline: "BATTING", basis: basisOf(skills, row.needs) } : null;
}

/** The bowling style. A bowler with no standout skill still gets the plain name of their bowling type. */
export function bowlingStyleOf(bowlingStyle: IdentityBowlingStyle, skills: IdentitySkills): PlayingStyle {
  const noun = SPIN_NOUN[bowlingStyle];
  const row = widestMargin(BOWLING_STYLE_TABLE[FAMILY[bowlingStyle]], skills);
  if (row) return { id: row.id, label: row.label.replace("noun", noun), discipline: "BOWLING", basis: basisOf(skills, row.needs) };
  const id: PlayingStyleId = bowlingStyle === "FAST" ? "FAST_BOWLER" : bowlingStyle === "MEDIUM" ? "MEDIUM_PACER" : FAMILY[bowlingStyle] === "WRIST" ? "WRIST_SPINNER" : "FINGER_SPINNER";
  return { id, label: capitalise(noun), discipline: "BOWLING", basis: [] };
}

/**
 * A player's primary style and, when earned, a secondary one. Batters and keepers lead with batting (keepers with
 * their keeping); bowlers with bowling; all-rounders with whichever of batting and bowling is stronger.
 */
export function playingStyle(player: PlayingStyleInput): { primary: PlayingStyle; secondary: PlayingStyle | null } {
  const s = player.skills;
  const bat = battingStyle(s);
  const canBowl = player.bowlingStyle !== null && (player.role === "BOWLER" || player.role === "ALLROUNDER");
  const bowl = canBowl ? bowlingStyleOf(player.bowlingStyle!, s) : null;
  if (player.role === "KEEPER") {
    const specialist = s.keeping >= PLAYING_STYLE_RULES.specialistKeeping;
    const primary: PlayingStyle = specialist
      ? { id: "SPECIALIST_KEEPER", label: "Specialist keeper", discipline: "KEEPING", basis: basisOf(s, [["keeping", PLAYING_STYLE_RULES.specialistKeeping]]) }
      : { id: "KEEPER_BATTER", label: "Keeper-batter", discipline: "KEEPING", basis: [] };
    return { primary, secondary: bat };
  }
  if (bowl && (player.role === "BOWLER" || bowlingStrength(s) > battingStrength(s))) {
    return { primary: bowl, secondary: bat };
  }
  return {
    primary: bat ?? { id: "ALL_PURPOSE_BATTER", label: "All-purpose batter", discipline: "BATTING", basis: [] },
    secondary: bowl,
  };
}

/** "Finisher (power 74, strike rotation 66)": the label with the ratings that earn it. */
export function styleWithBasis(style: PlayingStyle): string {
  return style.basis.length === 0 ? style.label : `${style.label} (${style.basis.map((b) => `${b.label} ${b.value}`).join(", ")})`;
}

export type PersonalityTraitId =
  | "LARRIKIN" | "QUIET" | "STUDENT" | "SUPERSTITIOUS" | "COMPETITOR" | "EARLY_RISER" | "JOKER" | "HOMEBODY"
  | "TRAVELLER" | "PERFECTIONIST" | "MENTOR" | "CROSSWORDS";
export interface PersonalityTrait { id: PersonalityTraitId; label: string; flavour: string }

/** Flavour only. None of these claims a skill, a result or a fact about a match. */
export const PERSONALITY_TRAITS: readonly PersonalityTrait[] = [
  { id: "LARRIKIN", label: "Larrikin", flavour: "Has the dressing room laughing with a steady stream of bad jokes." },
  { id: "QUIET", label: "Quietly spoken", flavour: "Says little at team meetings, and listens to everything." },
  { id: "STUDENT", label: "Student of the game", flavour: "Watches replays of every innings on the bus home." },
  { id: "SUPERSTITIOUS", label: "Superstitious", flavour: "Always pads up left leg first, and will not change it." },
  { id: "COMPETITOR", label: "Fierce competitor", flavour: "Hates losing at anything, including warm-up football." },
  { id: "EARLY_RISER", label: "Early riser", flavour: "First at the ground on match days, usually before the groundstaff." },
  { id: "JOKER", label: "Dressing-room joker", flavour: "Behind most of the pranks, and blamed for the rest." },
  { id: "HOMEBODY", label: "Local favourite", flavour: "Signs every autograph by the boundary rope." },
  { id: "TRAVELLER", label: "Restless traveller", flavour: "Has a story from every ground on the circuit." },
  { id: "PERFECTIONIST", label: "Perfectionist", flavour: "Spends long sessions in the nets on one small thing." },
  { id: "MENTOR", label: "Natural mentor", flavour: "The first to help a newcomer settle in." },
  { id: "CROSSWORDS", label: "Crossword devotee", flavour: "Finishes the paper's crossword before the toss." },
];

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Two different traits, from the player id alone, so they do not change as ratings or age change. */
export function personalityTraits(playerId: string): [PersonalityTrait, PersonalityTrait] {
  const count = PERSONALITY_TRAITS.length;
  const hash = fnv1a32(`${PLAYER_IDENTITY_VERSION}:${playerId}`);
  const first = hash % count;
  const second = (first + 1 + ((hash >>> 8) % (count - 1))) % count;
  return [PERSONALITY_TRAITS[first]!, PERSONALITY_TRAITS[second]!];
}

/** One recorded league match, as the story needs it. */
export interface StoryMatch {
  seasonNumber: number;
  roundNumber: number;
  batted: boolean;
  runs: number;
  notOut: boolean;
  bowled: boolean;
  wickets: number;
  runsConceded: number;
}

/** Recorded career figures. Pass only what the save records; leave a field null when it is not known. */
export interface StoryRecord {
  name: string;
  /** The club now (contracted) or the last club (retired), with which it is. */
  club: { name: string; relation: "CURRENT" | "LAST" } | null;
  age: number | null;
  retired: boolean;
  matches: number;
  seasonsPlayed: number;
  runs: number;
  battingInnings: number;
  highScore: { runs: number; notOut: boolean } | null;
  fifties: number;
  hundreds: number;
  wickets: number;
  bestBowling: { wickets: number; runs: number } | null;
  playerOfTheMatchCount: number;
  seasonAwardsWon: number;
  /** League matches in any order; the latest five are used for form. */
  recentMatches: readonly StoryMatch[];
}

export interface StoryFact { key: string; value: number | string }
export interface StorySoFar { text: string; facts: StoryFact[] }

export const STORY_FORM_MATCHES = 5;
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** One short paragraph from recorded figures only. Every number in `text` is listed in `facts`. */
export function storySoFar(record: StoryRecord, lead: "BATTING" | "BOWLING" | "KEEPING"): StorySoFar {
  const facts: StoryFact[] = [];
  const fact = (key: string, value: number | string) => {
    facts.push({ key, value });
    return value;
  };
  const sentences: string[] = [];
  const club = record.club;
  if (record.matches === 0) {
    const age = record.age !== null ? `, aged ${fact("age", record.age)}` : "";
    sentences.push(
      record.retired
        ? `Retired without a recorded league match${club ? ` for ${club.name}` : ""}.`
        : `Yet to play a league match${club ? ` for ${club.name}` : ""}${age}.`,
    );
    return { text: sentences.join(" "), facts };
  }
  const seasons = record.seasonsPlayed > 0 ? ` across ${plural(Number(fact("seasonsPlayed", record.seasonsPlayed)), "season")}` : "";
  const clubText = club ? (record.retired || club.relation === "LAST" ? `, last with ${club.name}` : `, now with ${club.name}`) : "";
  sentences.push(`${plural(Number(fact("matches", record.matches)), "league match", "league matches")}${seasons}${clubText}.`);

  const battingLine = () => {
    if (record.battingInnings === 0) return null;
    const parts = [`${fact("runs", record.runs)} runs`];
    if (record.highScore) parts.push(`best of ${fact("highScore", record.highScore.runs)}${record.highScore.notOut ? " not out" : ""}`);
    const tons = record.hundreds > 0 ? plural(Number(fact("hundreds", record.hundreds)), "hundred") : null;
    const fifties = record.fifties > 0 ? plural(Number(fact("fifties", record.fifties)), "fifty", "fifties") : null;
    if (tons || fifties) parts.push([tons, fifties].filter(Boolean).join(" and "));
    return parts.join(", ");
  };
  const bowlingLine = () => {
    if (record.wickets === 0 && !record.bestBowling) return null;
    const parts = [plural(Number(fact("wickets", record.wickets)), "wicket")];
    if (record.bestBowling && record.bestBowling.wickets > 0) {
      parts.push(`best of ${fact("bestBowlingWickets", record.bestBowling.wickets)}/${fact("bestBowlingRuns", record.bestBowling.runs)}`);
    }
    return parts.join(", ");
  };
  const lines = lead === "BOWLING" ? [bowlingLine(), battingLine()] : [battingLine(), bowlingLine()];
  const recorded = lines.filter((line): line is string => line !== null);
  if (recorded.length > 0) sentences.push(`${capitalise(recorded.join("; "))}.`);

  const recent = [...record.recentMatches]
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.roundNumber - b.roundNumber)
    .slice(-STORY_FORM_MATCHES);
  const bowledRecent = recent.filter((m) => m.bowled);
  const battedRecent = recent.filter((m) => m.batted);
  const useBowling = lead === "BOWLING" ? bowledRecent.length > 0 : battedRecent.length === 0 && bowledRecent.length > 0;
  const form = useBowling
    ? bowledRecent.map((m) => `${m.wickets}/${m.runsConceded}`)
    : battedRecent.map((m) => `${m.runs}${m.notOut ? "*" : ""}`);
  if (form.length > 0 && !record.retired) {
    fact(useBowling ? "recentBowling" : "recentBatting", form.join(", "));
    sentences.push(`Latest ${useBowling ? "figures" : "scores"}, oldest first: ${form.join(", ")}.`);
  }
  const honours: string[] = [];
  if (record.playerOfTheMatchCount > 0) {
    const n = Number(fact("playerOfTheMatch", record.playerOfTheMatchCount));
    honours.push(`Player of the Match ${n === 1 ? "once" : `${n} times`}`);
  }
  if (record.seasonAwardsWon > 0) honours.push(plural(Number(fact("seasonAwards", record.seasonAwardsWon)), "season award"));
  if (honours.length > 0) sentences.push(`${honours.join(", ")}.`);
  if (!record.retired) {
    const next = playerMilestones({ runs: record.runs, wickets: record.wickets, matches: record.matches })[0];
    if (next) {
      fact("milestoneNeeded", next.needed);
      fact("milestoneTarget", next.target);
      sentences.push(`${next.text}.`);
    }
  }
  return { text: sentences.join(" "), facts };
}

export interface PlayerIdentity {
  version: typeof PLAYER_IDENTITY_VERSION;
  playerId: string;
  primary: PlayingStyle;
  secondary: PlayingStyle | null;
  traits: [PersonalityTrait, PersonalityTrait];
  story: StorySoFar | null;
}

/** The whole identity. Pass `record` only where recorded career figures are at hand. */
export function derivePlayerIdentity(player: PlayingStyleInput, record: StoryRecord | null = null): PlayerIdentity {
  const { primary, secondary } = playingStyle(player);
  return {
    version: PLAYER_IDENTITY_VERSION,
    playerId: player.playerId,
    primary,
    secondary,
    traits: personalityTraits(player.playerId),
    story: record ? storySoFar(record, primary.discipline) : null,
  };
}

/**
 * The match screen's introduction when a batter walks out or a bowler comes on: the style and the ratings behind
 * it. It states nothing about form or records, which the match screen does not hold.
 */
export function matchIntroduction(name: string, style: PlayingStyle, kind: "BATTER" | "BOWLER"): string {
  return kind === "BATTER" ? `New at the crease: ${name}, ${styleWithBasis(style)}.` : `Into the attack: ${name}, ${styleWithBasis(style)}.`;
}
