/**
 * Studio Production Directive 05, CP10 (commentary): the cricket vocabulary the ball-by-ball commentary draws on.
 *
 * Every phrase here describes something the delivery event records: the executed length, how the ball came off the
 * bat (along the ground, in the air or off the edge, or not at all) and the recorded shot sector. Nothing is
 * invented: no line, pace, spin, footwork or fielding position that the event does not hold. Sector names follow the
 * recorded convention of ADR 013 (off side 0 to 2, straight 3 and 4, leg side 5 to 7) and are the same names the
 * wagon wheel uses for the same balls; they are directions from the bat, not fielders' places on the field diagram.
 *
 * Pure and deterministic: a variant is chosen by hashing a key the caller builds from event data (match, innings,
 * sequence), never by a random number. No en or em dashes in any phrase.
 */

export type ExecutedLength = "YORKER" | "FULL" | "GOOD" | "SHORT" | "FULL_TOSS";
export type Trajectory = "GROUND" | "AERIAL" | "EDGE";

/** Directions from the bat, by recorded sector (ADR 013 convention). */
export const SECTOR_NAMES: readonly string[] = [
  "third man",
  "point",
  "cover",
  "mid-off",
  "mid-on",
  "midwicket",
  "square leg",
  "fine leg",
];

/** Where a six off each sector lands: the deep fielding region in the same direction. */
const SIX_REGIONS: readonly string[] = [
  "over third man",
  "over point",
  "over extra cover",
  "over long-off",
  "over long-on",
  "over deep midwicket",
  "over square leg",
  "over fine leg",
];

/**
 * A stroke as a verb phrase. `act` takes the batter as subject ("drives"), `part` is the participle ("driven"),
 * `where` the direction ("through the covers"). `object` says whether the bowler's name may follow the verb
 * ("drives Rilan Ternford through the covers").
 */
export interface Stroke {
  readonly act: string;
  readonly part: string;
  readonly where: string;
  readonly object: boolean;
}

const s = (act: string, part: string, where: string, object = true): Stroke => ({ act, part, where, object });

type LengthBand = "FULL" | "GOOD" | "SHORT";
const band = (length: ExecutedLength | null): LengthBand =>
  length === "SHORT" ? "SHORT" : length === "GOOD" || length === null ? "GOOD" : "FULL";

/** Scoring strokes along the ground, by sector and length band. */
const GROUND: readonly Readonly<Record<LengthBand, readonly Stroke[]>>[] = [
  {
    FULL: [s("squeezes", "squeezed", "down to third man"), s("runs it", "run", "down to third man", false)],
    GOOD: [s("steers", "steered", "down to third man"), s("dabs", "dabbed", "late, down to third man"), s("runs it", "run", "down to third man", false)],
    SHORT: [s("steers", "steered", "down to third man"), s("cuts", "cut", "late, down to third man")],
  },
  {
    FULL: [s("drives", "driven", "square through point"), s("squeezes", "squeezed", "out past point", false)],
    GOOD: [s("punches", "punched", "off the back foot through point"), s("guides", "guided", "square through point")],
    SHORT: [s("cuts", "cut", "through point"), s("slaps", "slapped", "square through point"), s("cuts", "cut", "hard behind point")],
  },
  {
    FULL: [s("drives", "driven", "through the covers"), s("drives", "driven", "on the up through cover"), s("caresses", "caressed", "through the covers")],
    GOOD: [s("punches", "punched", "through cover"), s("eases", "eased", "into the covers")],
    SHORT: [s("punches", "punched", "off the back foot through cover"), s("cuts", "cut", "in front of square through cover")],
  },
  {
    FULL: [s("drives", "driven", "past mid-off"), s("drives", "driven", "straight, past mid-off")],
    GOOD: [s("pushes", "pushed", "past mid-off"), s("punches", "punched", "down the ground past mid-off")],
    SHORT: [s("punches", "punched", "down the ground past mid-off"), s("chops", "chopped", "down past mid-off")],
  },
  {
    FULL: [s("drives", "driven", "past mid-on"), s("clips", "clipped", "past mid-on")],
    GOOD: [s("pushes", "pushed", "past mid-on"), s("works", "worked", "down the ground past mid-on")],
    SHORT: [s("pulls", "pulled", "down past mid-on"), s("punches", "punched", "back past mid-on")],
  },
  {
    FULL: [s("whips", "whipped", "through midwicket"), s("flicks", "flicked", "through midwicket")],
    GOOD: [s("works", "worked", "through midwicket"), s("clips", "clipped", "off the pads through midwicket")],
    SHORT: [s("pulls", "pulled", "through midwicket"), s("swats", "swatted", "through midwicket")],
  },
  {
    FULL: [s("flicks", "flicked", "square on the leg side"), s("clips", "clipped", "round to square leg")],
    GOOD: [s("tucks", "tucked", "round to square leg"), s("works", "worked", "square on the leg side")],
    SHORT: [s("pulls", "pulled", "through square leg"), s("pulls", "pulled", "in front of square")],
  },
  {
    FULL: [s("flicks", "flicked", "fine off the pads"), s("glances", "glanced", "down to fine leg")],
    GOOD: [s("glances", "glanced", "fine"), s("tickles", "tickled", "down to fine leg")],
    SHORT: [s("helps", "helped", "round to fine leg"), s("hooks", "hooked", "down to fine leg")],
  },
];

/** Verbs for a stroke in the air, by sector and length band; the direction is added by the caller. */
const AERIAL_VERBS: readonly Readonly<Record<LengthBand, readonly [string, string][]>>[] = [
  { FULL: [["slices", "sliced"]], GOOD: [["slices", "sliced"], ["steers", "steered"]], SHORT: [["upper-cuts", "upper-cut"]] },
  { FULL: [["slashes", "slashed"]], GOOD: [["slashes", "slashed"]], SHORT: [["cuts", "cut"], ["slashes", "slashed"]] },
  { FULL: [["lofts", "lofted"], ["drives", "driven"]], GOOD: [["lofts", "lofted"]], SHORT: [["slaps", "slapped"]] },
  { FULL: [["lofts", "lofted"], ["drives", "driven"]], GOOD: [["lofts", "lofted"]], SHORT: [["lofts", "lofted"]] },
  { FULL: [["lofts", "lofted"], ["drives", "driven"]], GOOD: [["lofts", "lofted"], ["swings", "swung"]], SHORT: [["pulls", "pulled"]] },
  { FULL: [["hoists", "hoisted"], ["whips", "whipped"]], GOOD: [["hoists", "hoisted"], ["heaves", "heaved"]], SHORT: [["pulls", "pulled"]] },
  { FULL: [["flicks", "flicked"], ["hoists", "hoisted"]], GOOD: [["swings", "swung"]], SHORT: [["pulls", "pulled"], ["hooks", "hooked"]] },
  { FULL: [["flicks", "flicked"]], GOOD: [["helps", "helped"]], SHORT: [["hooks", "hooked"], ["helps", "helped"]] },
];

/** Strokes off the edge, by sector. */
const EDGES: readonly (readonly Stroke[])[] = [
  [s("edges", "edged", "down to third man"), s("edges", "edged", "fine, down towards third man")],
  [s("slices", "sliced", "off the edge past point"), s("edges", "edged", "square towards point")],
  [s("edges", "edged", "thickly towards cover"), s("slices", "sliced", "off the outside edge towards cover")],
  [s("chips", "chipped", "off a leading edge towards mid-off")],
  [s("chips", "chipped", "off a leading edge towards mid-on")],
  [s("chips", "chipped", "off a leading edge towards midwicket")],
  [s("inside-edges", "inside-edged", "round to square leg"), s("inside-edges", "inside-edged", "onto the pad and round to square leg", false)],
  [s("inside-edges", "inside-edged", "past the stumps to fine leg"), s("edges", "edged", "fine on the leg side")],
];

/** Defensive or blocked strokes that are fielded, by length band; the direction is added by the caller. */
const DEFENSIVE: Readonly<Record<ExecutedLength, readonly [string, string][]>> = {
  YORKER: [["digs it out", "dug out"], ["jams it out", "jammed out"]],
  FULL: [["drives", "driven"], ["pushes", "pushed"], ["blocks", "blocked"]],
  FULL_TOSS: [["drives", "driven"], ["hits", "hit"]],
  GOOD: [["pushes", "pushed"], ["defends", "defended"], ["taps", "tapped"], ["blocks", "blocked"]],
  SHORT: [["plays it off the back foot", "played off the back foot"], ["punches", "punched"], ["works", "worked"]],
};

/** Fielded strokes to the fine regions, where a straight bat cannot send the ball: by sector 0 (third man) and 7 (fine leg). */
const FINE_FIELDED: Readonly<Record<number, readonly Stroke[]>> = {
  0: [s("dabs", "dabbed", "down to third man", false), s("steers", "steered", "down to third man", false), s("guides", "guided", "down to third man", false)],
  7: [s("glances", "glanced", "to fine leg", false), s("tucks", "tucked", "round to fine leg", false), s("flicks", "flicked", "fine, to fine leg", false)],
};

/** How the bowler put it there: subject is the bowler ("Rilan Ternford pitches it up"). */
const LEADS: Readonly<Record<ExecutedLength, readonly string[]>> = {
  YORKER: ["spears in a yorker", "goes for the yorker", "fires in the yorker"],
  FULL: ["pitches it up", "goes full", "overpitches"],
  FULL_TOSS: ["serves up a full toss", "lets slip a full toss"],
  GOOD: ["hits a good length", "lands it on a length", "hits the deck on a length"],
  SHORT: ["bangs it in short", "drops short", "goes short"],
};

/** The delivery as a noun ("a yorker", "a short ball"). */
const NOUNS: Readonly<Record<ExecutedLength, readonly string[]>> = {
  YORKER: ["a yorker", "the yorker"],
  FULL: ["a full ball", "a full delivery"],
  FULL_TOSS: ["a full toss"],
  GOOD: ["a good-length ball", "one on a length"],
  SHORT: ["a short ball", "a short one"],
};

export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** One of `options`, chosen by hashing `key`. The same key always gives the same option. */
export function choose<T>(key: string, options: readonly T[]): T {
  return options[fnv1a32(key) % options.length]!;
}

export function capitalise(text: string): string {
  return text.length > 0 ? text[0]!.toUpperCase() + text.slice(1) : text;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** Small counts as words ("two"), larger as figures. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
export function ordinalWord(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

export function lengthLead(key: string, length: ExecutedLength | null): string | null {
  return length ? choose(`${key}|lead`, LEADS[length]) : null;
}

export function lengthNoun(key: string, length: ExecutedLength | null): string {
  return length ? choose(`${key}|noun`, NOUNS[length]) : "that one";
}

/**
 * The stroke a scoring ball records: along the ground, in the air or off the edge towards its sector. Null when the
 * event records no sector (no stroke to describe).
 */
export function scoringStroke(key: string, sector: number | null, trajectory: Trajectory | null, length: ExecutedLength | null): Stroke | null {
  if (sector === null || sector < 0 || sector > 7) return null;
  if (trajectory === "EDGE") return choose(`${key}|edge`, EDGES[sector]!);
  if (trajectory === "AERIAL") {
    const [act, part] = choose(`${key}|air`, AERIAL_VERBS[sector]![band(length)]);
    return s(act, part, `in the air ${choose(`${key}|airwhere`, ["over", "towards"])} ${SECTOR_NAMES[sector]}`);
  }
  return choose(`${key}|ground`, GROUND[sector]![band(length)]);
}

/** A six: the stroke and the deep region it clears. Null when the event records no sector. */
export function sixStroke(key: string, sector: number | null, trajectory: Trajectory | null, length: ExecutedLength | null): Stroke | null {
  if (sector === null || sector < 0 || sector > 7) return null;
  if (trajectory === "EDGE") return s("top-edges", "top-edged", SIX_REGIONS[sector]!);
  const [act, part] = choose(`${key}|six`, AERIAL_VERBS[sector]![band(length)]);
  return s(act, part, SIX_REGIONS[sector]!);
}

/** A stroke that is fielded or not run: towards its sector. Null when the event records no sector. */
export function fieldedStroke(key: string, sector: number | null, trajectory: Trajectory | null, length: ExecutedLength | null): Stroke | null {
  if (sector === null || sector < 0 || sector > 7) return null;
  const where = SECTOR_NAMES[sector]!;
  if (trajectory === "EDGE") {
    const edge = choose(`${key}|edge`, EDGES[sector]!);
    return s(edge.act, edge.part, edge.where, edge.object);
  }
  if (trajectory === "AERIAL") {
    const [act, part] = choose(`${key}|air`, AERIAL_VERBS[sector]![band(length)]);
    return s(act, part, `in the air towards ${where}`);
  }
  const fine = FINE_FIELDED[sector];
  if (fine && length !== "YORKER") return choose(`${key}|fine`, fine);
  const [act, part] = choose(`${key}|def`, DEFENSIVE[length ?? "GOOD"]);
  return s(act, part, choose(`${key}|defwhere`, [`to ${where}`, `towards ${where}`, `straight to ${where}`]), false);
}

/** "drives Rilan Ternford through the covers" when the stroke takes an object, else "drives through the covers". */
export function strokeWithBowler(stroke: Stroke, bowler: string): string {
  return stroke.object ? `${stroke.act} ${bowler} ${stroke.where}` : `${stroke.act} ${stroke.where}`;
}

/** Captain's notes: a batting plan in words. */
const AGGRESSION_WORDS = ["defensively", "cautiously", "with a balanced approach", "positively", "aggressively"];
const INTENT_WORDS: Readonly<Record<string, string>> = { ROTATE: ", looking to rotate the strike", PROTECT: ", protecting the wicket" };
export function battingPlanText(batter: string, aggression: number, intent: string): string {
  return `${batter} will bat ${AGGRESSION_WORDS[aggression] ?? `at aggression ${aggression}`}${INTENT_WORDS[intent] ?? ""}.`;
}

/** Captain's notes: a bowling plan in words. */
const PLAN_LENGTHS: Readonly<Record<string, string>> = { YORKER: "yorkers", FULL: "full", GOOD: "a good length", SHORT: "short", FULL_TOSS: "full" };
const PLAN_LINES: Readonly<Record<string, string>> = { OFF: "outside off stump", STUMPS: "at the stumps", LEG: "on a leg-stump line" };
const PLAN_EFFORTS: Readonly<Record<string, string>> = { CONSERVE: ", within themselves", MAXIMUM: ", at full effort" };
export function bowlingPlanText(bowler: string, line: string, length: string, effort: string): string {
  const len = PLAN_LENGTHS[length] ?? length.toLowerCase().replaceAll("_", " ");
  const ln = PLAN_LINES[line] ?? `on a ${line.toLowerCase()} line`;
  return `${bowler} will bowl ${len} ${ln}${PLAN_EFFORTS[effort] ?? ""}.`;
}
