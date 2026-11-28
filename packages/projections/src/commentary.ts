import {
  COMMENTARY_ADAPTER_VERSION,
  type CommentaryCategory,
  type CommentaryEntry,
  type CommentaryFactSlot,
  type CommentaryMilestoneTag,
  type CommentaryVerbosityMode,
  type DeliveryRecorded,
  type Format,
  type MatchCommentaryFeed,
  type MatchResult,
} from "@lcxxvi/contracts";
import { inningsSummary, overContext, wicketContext, type OverRecord } from "./commentary-context.js";
import {
  SECTOR_NAMES,
  battingPlanText,
  bowlingPlanText,
  capitalise,
  choose,
  countWord,
  fieldedStroke,
  fnv1a32,
  lengthLead,
  lengthNoun,
  ordinalWord,
  scoringStroke,
  sixStroke,
  strokeWithBowler,
  type Stroke,
} from "./commentary-phrases.js";

export const DEFAULT_REPETITION_COOLDOWN_WINDOW = 3 as const;

export interface CommittedCommentarySourceEvent {
  readonly sequence: number;
  readonly type: string;
  readonly payload: unknown;
  readonly eventHash?: string;
}

export interface ProjectMatchCommentaryInput {
  readonly format: Format;
  readonly events: readonly CommittedCommentarySourceEvent[];
  readonly playerNames: Readonly<Record<string, string>>;
  readonly teamNames: Readonly<Record<string, string>>;
  readonly teamIds: readonly [string, string];
  readonly groundName?: string;
  readonly presentationKey?: string;
  readonly repetitionCooldownWindow?: number;
}

interface BatterRunningFigures {
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
}

interface BowlerRunningFigures {
  legalBalls: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
  currentOverBowlerRuns: number;
  currentOverLegalBalls: number;
}

interface InningsRunningProjection {
  inningsIndex: number;
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  declared: boolean;
  targetToWin: number | null;
  allocatedBalls: number | null;
  overTeamRuns: number;
  overWickets: number;
  overLegalBalls: number;
  pendingFreeHit: boolean;
  partnershipRuns: number;
  partnershipBalls: number;
  /** Pavilion P07: completed overs of this innings and the legal balls since the last four or six. */
  overHistory: OverRecord[];
  ballsSinceBoundary: number;
  /** CP10: fours and sixes in the current over, legal dot balls in a row, the striker who hit the last ball for a boundary, batters sent in. */
  overBoundaries: number;
  dotStreak: number;
  lastBoundaryStrikerId: string | null;
  battersIn: number;
  batters: Map<string, BatterRunningFigures>;
  bowlers: Map<string, BowlerRunningFigures>;
}

/** Recorded shot sectors by name (ADR 013 convention; the same names the wagon wheel uses). */
const SECTOR_LABELS: readonly string[] = SECTOR_NAMES;

const LENGTH_LABELS: Readonly<Record<string, string>> = {
  YORKER: "yorker",
  FULL: "full",
  GOOD: "good-length",
  SHORT: "short",
  FULL_TOSS: "full-toss",
};

const TRAJECTORY_LABELS: Readonly<Record<string, string>> = {
  GROUND: "along the turf",
  AERIAL: "in the air",
  EDGE: "off the edge",
};

function hex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function ballCoordinateLabel(legalBallsBefore: number): string {
  return `${Math.floor(legalBallsBefore / 6)}.${(legalBallsBefore % 6) + 1}`;
}

/** Bowling figures in the usual order, overs-maidens-runs-wickets ("4-0-18-3", or "2.3-0-14-1" part way through an over). */
function bowlerFiguresText(fig: BowlerRunningFigures): string {
  const oversText = fig.legalBalls % 6 === 0 ? String(fig.legalBalls / 6) : formatOvers(fig.legalBalls);
  return `${oversText}-${fig.maidens}-${fig.runsConceded}-${fig.wickets}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function allocatedBallsForFormat(format: Format): number | null {
  if (format === "T20") return 120;
  if (format === "ODI") return 300;
  return null;
}

/**
 * Chooses a template for one event. The starting choice comes from hashing the presentation key, the event's
 * sequence and hash and the family, so a replay of the same events gives the same text. CP10: a template used for
 * one of the family's recent lines is passed over for the next unused one; the window is per family (so a burst of
 * other lines does not let a dot-ball template come straight back) and covers three quarters of the pool, up to one
 * less than its size, never below the feed's repetition cooldown window.
 */
function pickTemplateWithCooldown<T extends { readonly id: string }>(
  family: string,
  templates: readonly T[],
  presentationKey: string,
  sequence: number,
  eventHash: string,
  recentIds: Map<string, string[]>,
  cooldownWindow: number,
): { selected: T; cooldownApplied: boolean; digest: string } {
  const raw = fnv1a32(`${presentationKey}|${sequence}|${eventHash}|${family}`);
  const digest = hex8(raw);
  const baseIdx = raw % templates.length;
  let chosenIdx = baseIdx;
  let cooldownApplied = false;
  const history = recentIds.get(family) ?? [];
  const span = Math.min(templates.length - 1, Math.max(cooldownWindow, Math.ceil(templates.length * 0.75)));
  if (span > 0) {
    const windowSlice = history.slice(-span);
    if (windowSlice.includes(templates[baseIdx]!.id)) {
      for (let step = 1; step < templates.length; step += 1) {
        const idx = (baseIdx + step) % templates.length;
        if (!windowSlice.includes(templates[idx]!.id)) {
          chosenIdx = idx;
          cooldownApplied = true;
          break;
        }
      }
    }
  }
  const selected = templates[chosenIdx]!;
  history.push(selected.id);
  recentIds.set(family, history.slice(-16));
  return { selected, cooldownApplied, digest };
}

function computeTargetForNewInnings(
  format: Format,
  inningsIndex: number,
  battingTeamId: string,
  completedInnings: readonly InningsRunningProjection[],
): number | null {
  if (format === "T20" || format === "ODI") {
    if (inningsIndex === 1 && completedInnings[0]) {
      return completedInnings[0].runs + 1;
    }
    return null;
  }
  if (inningsIndex === 3 && completedInnings.length >= 3) {
    let battingTotal = 0;
    let bowlingTotal = 0;
    for (const inn of completedInnings) {
      if (inn.battingTeamId === battingTeamId) battingTotal += inn.runs;
      else bowlingTotal += inn.runs;
    }
    const deficit = bowlingTotal - battingTotal;
    return deficit >= 0 ? deficit + 1 : null;
  }
  return null;
}

export function normaliseCommentaryVerbosityPref(
  raw: string | null | undefined,
): "full" | "brief" | "detailed" | "off" {
  if (raw === "brief") return "brief";
  if (raw === "detailed") return "detailed";
  if (raw === "off") return "off";
  if (raw === "full" || raw === "standard") return "full";
  return "full";
}

export function selectCommentaryTextForMode(
  entry: Pick<CommentaryEntry, "short" | "text" | "detailed">,
  mode: CommentaryVerbosityMode | "full" | "brief" | "detailed" | "off",
): string {
  if (mode === "BRIEF" || mode === "brief") return entry.short;
  if (mode === "DETAILED" || mode === "detailed") return entry.detailed;
  if (mode === "OFF" || mode === "off") return "";
  return entry.text;
}

export function projectMatchCommentary(
  input: ProjectMatchCommentaryInput,
): MatchCommentaryFeed {
  const cooldownWindow = Math.max(
    1,
    Math.min(
      12,
      input.repetitionCooldownWindow ?? DEFAULT_REPETITION_COOLDOWN_WINDOW,
    ),
  );
  const presentationKey =
    input.presentationKey ??
    `lcxxvi-commentary:${input.format}:${input.teamIds[0]}:${input.teamIds[1]}:${input.groundName ?? "ground"}`;
  const presentationKeyDigest = hex8(fnv1a32(presentationKey));
  const recentTemplateIds = new Map<string, string[]>();

  const pName = (id: string | null | undefined): string =>
    id ? (input.playerNames[id] ?? id) : "Unknown player";
  const tName = (id: string | null | undefined): string =>
    id ? (input.teamNames[id] ?? id) : "Unknown team";
  const otherTeamId = (teamId: string): string =>
    teamId === input.teamIds[0] ? input.teamIds[1] : input.teamIds[0];

  const inningsByIndex = new Map<number, InningsRunningProjection>();
  let activeInningsIndex = 0;

  const ensureInnings = (
    inningsIndex: number,
    battingTeamIdFallback?: string,
  ): InningsRunningProjection => {
    const existing = inningsByIndex.get(inningsIndex);
    if (existing) return existing;
    const battingTeamId = battingTeamIdFallback ?? input.teamIds[inningsIndex % 2]!;
    const priorCompleted = [...inningsByIndex.values()].filter(
      (inn) => inn.inningsIndex < inningsIndex,
    );
    const created: InningsRunningProjection = {
      inningsIndex,
      battingTeamId,
      bowlingTeamId: otherTeamId(battingTeamId),
      runs: 0,
      wickets: 0,
      legalBalls: 0,
      declared: false,
      targetToWin: computeTargetForNewInnings(
        input.format,
        inningsIndex,
        battingTeamId,
        priorCompleted,
      ),
      allocatedBalls: allocatedBallsForFormat(input.format),
      overTeamRuns: 0,
      overWickets: 0,
      overLegalBalls: 0,
      pendingFreeHit: false,
      partnershipRuns: 0,
      partnershipBalls: 0,
      overHistory: [],
      ballsSinceBoundary: 0,
      overBoundaries: 0,
      dotStreak: 0,
      lastBoundaryStrikerId: null,
      battersIn: 0,
      batters: new Map(),
      bowlers: new Map(),
    };
    inningsByIndex.set(inningsIndex, created);
    return created;
  };

  const getBatter = (
    inn: InningsRunningProjection,
    playerId: string,
  ): BatterRunningFigures => {
    let b = inn.batters.get(playerId);
    if (!b) {
      b = { runs: 0, ballsFaced: 0, fours: 0, sixes: 0 };
      inn.batters.set(playerId, b);
    }
    return b;
  };

  const getBowler = (
    inn: InningsRunningProjection,
    playerId: string,
  ): BowlerRunningFigures => {
    let bw = inn.bowlers.get(playerId);
    if (!bw) {
      bw = {
        legalBalls: 0,
        maidens: 0,
        runsConceded: 0,
        wickets: 0,
        currentOverBowlerRuns: 0,
        currentOverLegalBalls: 0,
      };
      inn.bowlers.set(playerId, bw);
    }
    return bw;
  };

  const entries: CommentaryEntry[] = [];

  for (let evIdx = 0; evIdx < input.events.length; evIdx += 1) {
    const ev = input.events[evIdx]!;
    const evHash = ev.eventHash ?? `seq-${ev.sequence}`;

    if (ev.type === "DELIVERY_RECORDED") {
      const d = (ev.payload as { event: DeliveryRecorded }).event;
      activeInningsIndex = d.inningsIndex;
      const inn = ensureInnings(d.inningsIndex);
      const wasFreeHit =
        (input.format === "T20" || input.format === "ODI") && inn.pendingFreeHit;
      const coord = ballCoordinateLabel(inn.legalBalls);
      const bowler = pName(d.bowlerId);
      const striker = pName(d.strikerId);
      const nonStriker = pName(d.nonStrikerId);

      const extrasTotal =
        d.extras.wides +
        d.extras.noBalls +
        d.extras.byes +
        d.extras.legByes +
        d.extras.penalties;
      const totalRuns = d.batRuns + extrasTotal;
      const bowlerRunsDelta = d.batRuns + d.extras.wides + d.extras.noBalls;

      const batterFig = getBatter(inn, d.strikerId);
      const batterRunsBefore = batterFig.runs;
      if (d.countsAsBallFaced) batterFig.ballsFaced += 1;
      batterFig.runs += d.batRuns;
      if (d.boundary === "FOUR") batterFig.fours += 1;
      if (d.boundary === "SIX") batterFig.sixes += 1;

      const bowlerFig = getBowler(inn, d.bowlerId);
      const bowlerWicketsBefore = bowlerFig.wickets;
      bowlerFig.runsConceded += bowlerRunsDelta;
      bowlerFig.currentOverBowlerRuns += bowlerRunsDelta;
      if (d.legalBall) {
        bowlerFig.legalBalls += 1;
        bowlerFig.currentOverLegalBalls += 1;
      }
      if (d.dismissal && d.dismissal.creditedBowlerId === d.bowlerId) {
        bowlerFig.wickets += 1;
      }

      const partRunsBefore = inn.partnershipRuns;
      inn.runs += totalRuns;
      inn.overTeamRuns += totalRuns;
      if (d.legalBall) {
        inn.legalBalls += 1;
        inn.overLegalBalls += 1;
      }
      if (d.boundary === "FOUR" || d.boundary === "SIX") inn.ballsSinceBoundary = 0;
      else if (d.legalBall) inn.ballsSinceBoundary += 1;
      // CP10: boundaries in this over, back-to-back boundaries by one striker, and legal dot balls in a row.
      const isBoundary = d.boundary === "FOUR" || d.boundary === "SIX";
      if (isBoundary) inn.overBoundaries += 1;
      const boundariesThisOver = inn.overBoundaries;
      const backToBack = isBoundary && inn.lastBoundaryStrikerId === d.strikerId;
      inn.lastBoundaryStrikerId = isBoundary ? d.strikerId : null;
      if (d.legalBall && totalRuns === 0) inn.dotStreak += 1;
      else if (d.legalBall || totalRuns > 0) inn.dotStreak = 0;
      const dotStreak = inn.dotStreak;
      const deliveryNotes: string[] = [];
      inn.partnershipRuns += totalRuns;
      if (d.legalBall || d.legality === "NO_BALL") {
        inn.partnershipBalls += 1;
      }

      const milestoneTags: CommentaryMilestoneTag[] = [];
      const milestoneNotes: string[] = [];
      const factSlots: CommentaryFactSlot[] = [
        {
          slot: "inningsNumber",
          value: String(d.inningsIndex + 1),
          sourceKind: "EVENT_FIELD",
          sourceRef: "delivery.inningsIndex",
        },
        {
          slot: "ballCoord",
          value: coord,
          sourceKind: "INNINGS_PROJECTION",
          sourceRef: "innings.legalBallsBefore",
        },
        {
          slot: "bowlerName",
          value: bowler,
          sourceKind: "EVENT_FIELD",
          sourceRef: "delivery.bowlerId",
        },
        {
          slot: "strikerName",
          value: striker,
          sourceKind: "EVENT_FIELD",
          sourceRef: "delivery.strikerId",
        },
        {
          slot: "teamRuns",
          value: `${inn.runs}/${d.dismissal ? inn.wickets + 1 : inn.wickets}`,
          sourceKind: "INNINGS_PROJECTION",
          sourceRef: "innings.scoreAfter",
        },
        // CP09: the delivery's bat runs and boundary, copied from the record, so a reader of the feed alone (the
        // audio cue projection without events) classifies the ball from recorded facts rather than from wording.
        {
          slot: "runs",
          value: String(d.batRuns),
          sourceKind: "EVENT_FIELD",
          sourceRef: "delivery.batRuns",
        },
      ];
      if (d.boundary === "FOUR" || d.boundary === "SIX") {
        factSlots.push({
          slot: "boundary",
          value: d.boundary === "SIX" ? "6" : "4",
          sourceKind: "EVENT_FIELD",
          sourceRef: "delivery.boundary",
        });
      }

      // Batter milestones
      if (d.batRuns > 0) {
        if (batterRunsBefore < 200 && batterFig.runs >= 200) {
          milestoneTags.push("BATTER_DOUBLE_CENTURY");
          milestoneNotes.push(
            `${striker} reaches a double century (${batterFig.runs} off ${batterFig.ballsFaced} balls).`,
          );
        } else if (batterRunsBefore < 150 && batterFig.runs >= 150) {
          milestoneTags.push("BATTER_150");
          milestoneNotes.push(
            `${striker} brings up 150 (${batterFig.runs} off ${batterFig.ballsFaced} balls).`,
          );
        } else if (batterRunsBefore < 100 && batterFig.runs >= 100) {
          milestoneTags.push("BATTER_CENTURY");
          milestoneNotes.push(
            `Century for ${striker} (${batterFig.runs} off ${batterFig.ballsFaced} balls).`,
          );
        } else if (batterRunsBefore < 50 && batterFig.runs >= 50) {
          milestoneTags.push("BATTER_FIFTY");
          milestoneNotes.push(
            `Fifty for ${striker} (${batterFig.runs} off ${batterFig.ballsFaced} balls).`,
          );
        }
      }

      // Partnership milestones (only if wicket did not fall on this ball)
      if (!d.dismissal && totalRuns > 0) {
        if (partRunsBefore < 150 && inn.partnershipRuns >= 150) {
          milestoneTags.push("PARTNERSHIP_150");
          milestoneNotes.push(
            `150-run partnership (${inn.partnershipRuns} off ${inn.partnershipBalls} balls).`,
          );
        } else if (partRunsBefore < 100 && inn.partnershipRuns >= 100) {
          milestoneTags.push("PARTNERSHIP_CENTURY");
          milestoneNotes.push(
            `100-run stand (${inn.partnershipRuns} off ${inn.partnershipBalls} balls).`,
          );
        } else if (partRunsBefore < 50 && inn.partnershipRuns >= 50) {
          milestoneTags.push("PARTNERSHIP_FIFTY");
          milestoneNotes.push(
            `50-run partnership (${inn.partnershipRuns} off ${inn.partnershipBalls} balls).`,
          );
        }
      }

      // Bowler wicket milestones
      if (bowlerWicketsBefore < 5 && bowlerFig.wickets >= 5) {
        milestoneTags.push("BOWLER_FIVE_FOR");
        milestoneNotes.push(
          `Five-wicket haul for ${bowler} (${bowlerFig.wickets}/${bowlerFig.runsConceded}).`,
        );
      } else if (bowlerWicketsBefore < 3 && bowlerFig.wickets >= 3) {
        milestoneTags.push("BOWLER_THREE_FOR");
        milestoneNotes.push(
          `Third wicket for ${bowler} (${bowlerFig.wickets}/${bowlerFig.runsConceded}).`,
        );
      }

      const standBeforeWicket = {
        runs: inn.partnershipRuns,
        balls: inn.partnershipBalls,
      };
      if (d.dismissal) {
        inn.wickets += 1;
        inn.overWickets += 1;
        inn.partnershipRuns = 0;
        inn.partnershipBalls = 0;
        if (inn.wickets === 10) {
          milestoneTags.push("ALL_OUT");
          milestoneNotes.push(
            `${tName(inn.battingTeamId)} are all out for ${inn.runs}.`,
          );
        }
      }

      const isWinningShot =
        inn.targetToWin !== null && inn.runs >= inn.targetToWin;
      if (isWinningShot) {
        milestoneTags.push("WINNING_DELIVERY");
        milestoneNotes.push(
          `Winning runs! ${tName(inn.battingTeamId)} reach ${inn.runs}/${inn.wickets} to pass the target of ${inn.targetToWin}.`,
        );
        factSlots.push({
          slot: "targetToWin",
          value: String(inn.targetToWin),
          sourceKind: "CHASE_PROJECTION",
          sourceRef: "innings.targetToWin",
        });
      }

      const sectorPhrase =
        d.shotSector !== null && SECTOR_LABELS[d.shotSector]
          ? SECTOR_LABELS[d.shotSector]!
          : null;
      const lengthPhrase =
        d.executedLength !== null
          ? (LENGTH_LABELS[d.executedLength] ?? d.executedLength.toLowerCase())
          : null;
      const trajectoryPhrase =
        d.trajectory !== null
          ? (TRAJECTORY_LABELS[d.trajectory] ?? d.trajectory.toLowerCase())
          : null;

      if (sectorPhrase) {
        factSlots.push({
          slot: "shotSector",
          value: sectorPhrase,
          sourceKind: "EVENT_FIELD",
          sourceRef: "delivery.shotSector",
        });
      }
      if (lengthPhrase) {
        factSlots.push({
          slot: "executedLength",
          value: lengthPhrase,
          sourceKind: "EVENT_FIELD",
          sourceRef: "delivery.executedLength",
        });
      }

      factSlots.push(
        {
          slot: "batterScore",
          value: `${batterFig.runs} (${batterFig.ballsFaced})`,
          sourceKind: "BATTER_PROJECTION",
          sourceRef: `batter.${d.strikerId}`,
        },
        {
          slot: "bowlerFigures",
          value: bowlerFiguresText(bowlerFig),
          sourceKind: "BOWLER_PROJECTION",
          sourceRef: `bowler.${d.bowlerId}`,
        },
      );

      // Format-specific Free Hit notice & carryover (never eligible in RED_BALL)
      const freeHitEligible =
        (input.format === "T20" || input.format === "ODI") &&
        (d.freeHitNext || d.legality === "NO_BALL");
      if (wasFreeHit) {
        factSlots.push({
          slot: "isFreeHit",
          value: "true",
          sourceKind: "FORMAT_RULE",
          sourceRef: `${input.format}.freeHitDelivery`,
        });
      }
      if (freeHitEligible) {
        inn.pendingFreeHit = true;
        factSlots.push({
          slot: "freeHitNext",
          value: "FREE_HIT",
          sourceKind: "FORMAT_RULE",
          sourceRef: `${input.format}.freeHitNext`,
        });
      } else if (d.legalBall) {
        inn.pendingFreeHit = false;
      }

      // Cross-format maiden & over reset when no separate OVER_COMPLETED event follows (e.g. RED_BALL)
      const nextEventIsOverCompleted =
        input.events[evIdx + 1]?.type === "OVER_COMPLETED";
      if (d.legalBall && inn.overLegalBalls === 6 && !nextEventIsOverCompleted) {
        if (
          bowlerFig.currentOverLegalBalls === 6 &&
          bowlerFig.currentOverBowlerRuns === 0
        ) {
          bowlerFig.maidens += 1;
          milestoneTags.push("MAIDEN_OVER");
          milestoneNotes.push(`Maiden over completed by ${bowler}.`);
        }
        inn.overTeamRuns = 0;
        inn.overWickets = 0;
        inn.overLegalBalls = 0;
        inn.overBoundaries = 0;
        bowlerFig.currentOverBowlerRuns = 0;
        bowlerFig.currentOverLegalBalls = 0;
      }

      let family = "DELIVERY_DOT";
      let category: CommentaryCategory = "DELIVERY";
      let short = String(totalRuns);
      let bodyTemplates: readonly { id: string; render: () => string }[] = [];

      // CP10: every phrase below is drawn from what this delivery records (length, how it came off the bat, the
      // recorded sector, the field outcome) and the running figures; variants are chosen by hashing event data.
      const phraseKey = `${presentationKey}|${ev.sequence}|${evHash}`;
      const lead = lengthLead(phraseKey, d.executedLength);
      const bowls = lead ? `${bowler} ${lead}` : `${bowler} bowls`;
      const t = (id: string, render: () => string) => ({ id, render });
      const when = (cond: boolean, ...items: { id: string; render: () => string }[]) => (cond ? items : []);
      const sameWhere = (stroke: Stroke | null) => (stroke ? ` ${stroke.where}` : "");

      if (d.dismissal) {
        category = "DISMISSAL";
        const outPlayerId = d.dismissal.playerId;
        const outName = pName(outPlayerId);
        const outBatterFig = getBatter(inn, outPlayerId);
        const isNonStrikerOut = outPlayerId === d.nonStrikerId;
        const fielderName = d.dismissal.fielderId
          ? pName(d.dismissal.fielderId)
          : null;
        short = isNonStrikerOut ? `W (run out NS)` : "W";
        factSlots.push(
          {
            slot: "dismissedBatter",
            value: outName,
            sourceKind: "EVENT_FIELD",
            sourceRef: "delivery.dismissal.playerId",
          },
          {
            slot: "dismissalKind",
            value: d.dismissal.kind,
            sourceKind: "EVENT_FIELD",
            sourceRef: "delivery.dismissal.kind",
          },
          {
            slot: "dismissedScore",
            value: `${outBatterFig.runs} (${outBatterFig.ballsFaced})`,
            sourceKind: "BATTER_PROJECTION",
            sourceRef: `batter.${outPlayerId}`,
          },
        );
        if (fielderName) {
          factSlots.push({
            slot: "fielderName",
            value: fielderName,
            sourceKind: "EVENT_FIELD",
            sourceRef: "delivery.dismissal.fielderId",
          });
        }
        const forScore = `for ${outBatterFig.runs} (${outBatterFig.ballsFaced})`;
        const stroke = fieldedStroke(phraseKey, d.shotSector, d.trajectory, d.executedLength);

        if (d.dismissal.kind === "RUN_OUT" && isNonStrikerOut) {
          family = "WICKET_RUN_OUT_NON_STRIKER";
          const throwCredit = fielderName ? ` by ${fielderName}` : "";
          const endLabel = d.dismissal.wicketEnd.toLowerCase();
          bodyTemplates = [
            t("W_RO_NS_1", () => `${bowler} to ${striker}. Non-striker ${outName} is run out${throwCredit} at the ${endLabel} end ${forScore}!`),
            t("W_RO_NS_2", () => `${bowler} to ${striker}. Mix-up in the running: non-striker ${outName} is caught short${throwCredit} at the ${endLabel} end, out ${forScore}.`),
            t("W_RO_NS_3", () => `${bowler} to ${striker}. Trouble at the ${endLabel} end: non-striker ${outName} run out${throwCredit} ${forScore}.`),
            ...when(stroke !== null,
              t("W_RO_NS_4", () => `${striker} ${stroke!.act} ${stroke!.where} and they go for a run, but non-striker ${outName} is short at the ${endLabel} end: run out${throwCredit} ${forScore}.`)),
          ];
        } else if (d.dismissal.kind === "BOWLED") {
          family = "WICKET_BOWLED";
          bodyTemplates = [
            t("W_BWL_1", () => `${bowler} bowls ${outName} ${forScore}!`),
            t("W_BWL_2", () => `Bowled! ${bowls} and ${outName} is gone ${forScore}.`),
            t("W_BWL_3", () => `${bowler} hits the stumps. ${outName} departs, bowled ${forScore}.`),
            t("W_BWL_4", () => `Timber! ${outName} is bowled by ${bowler} ${forScore}.`),
            ...when(d.executedLength === "YORKER",
              t("W_BWL_YK", () => `Yorked! ${bowler} spears it into the base of the stumps and ${outName} goes ${forScore}.`)),
            ...when(d.executedLength === "GOOD",
              t("W_BWL_GD", () => `${bowler} hits a good length and beats the defence: ${outName} bowled ${forScore}.`)),
            ...when(d.executedLength === "FULL",
              t("W_BWL_FL", () => `${bowler} pitches it up and the stumps are broken. ${outName} bowled ${forScore}.`)),
          ];
        } else if (d.dismissal.kind === "LBW") {
          family = "WICKET_LBW";
          bodyTemplates = [
            t("W_LBW_1", () => `${bowler} traps ${outName} lbw ${forScore}!`),
            t("W_LBW_2", () => `Pinned in front! ${outName} is lbw to ${bowler} ${forScore}.`),
            t("W_LBW_3", () => `Up goes the finger: ${bowler} has ${outName} lbw ${forScore}.`),
            ...when(d.executedLength === "YORKER",
              t("W_LBW_YK", () => `${bowler} fires in the yorker and hits ${outName} on the boot in front. Lbw ${forScore}.`)),
            ...when(d.executedLength === "FULL" || d.executedLength === "GOOD",
              t("W_LBW_PD", () => `${bowls} and ${outName} is struck on the pad in front: lbw ${forScore}.`)),
          ];
        } else if (d.dismissal.kind === "CAUGHT") {
          family = "WICKET_CAUGHT";
          const catcher = fielderName ? `caught by ${fielderName}` : "caught";
          const returnCatch = d.dismissal.fielderId !== null && d.dismissal.fielderId === d.bowlerId;
          const taker = fielderName ?? "the fielder";
          bodyTemplates = returnCatch
            ? [
                t("W_CB_1", () => `Caught and bowled! ${bowler} takes the return catch and ${outName} goes ${forScore}.`),
                t("W_CB_2", () => `${outName} hits it back to ${bowler}, who holds on: caught and bowled ${forScore}.`),
                t("W_CB_3", () => `${bowler} does it all: caught and bowled, and ${outName} is out ${forScore}.`),
              ]
            : [
                t("W_CT_1", () => `${bowler} strikes: ${outName} ${catcher} ${forScore}!`),
                t("W_CT_2", () => `Taken! ${bowler} has ${outName} ${catcher} ${forScore}.`),
                t("W_CT_3", () => `Wicket for ${bowler}: ${outName} departs, ${catcher}, ${forScore}.`),
                t("W_CT_4", () => `Gone! ${outName} ${catcher} off ${bowler} ${forScore}.`),
                ...when(stroke !== null,
                  t("W_CT_5", () => `${outName} ${stroke!.act} ${stroke!.where} and is ${catcher} ${forScore}.`)),
                ...when(d.trajectory === "EDGE",
                  t("W_CT_ED", () => `${outName} edges ${bowler} and ${taker} takes the catch. Out ${forScore}.`),
                  t("W_CT_ED2", () => `${bowler} finds the edge, and ${taker} does the rest: ${outName} out ${forScore}.`)),
                ...when(d.trajectory === "AERIAL",
                  t("W_CT_AR", () => `${outName} goes in the air off ${bowler} and is ${catcher} ${forScore}.`),
                  t("W_CT_AR2", () => `${outName} goes aerial${stroke ? ` ${stroke.where.replace("in the air ", "")}` : ""} and ${taker} holds on. Gone ${forScore}.`)),
              ];
        } else if (d.dismissal.kind === "STUMPED") {
          family = "WICKET_STUMPED";
          const keeperCredit = fielderName
            ? `stumped by ${fielderName}`
            : "stumped";
          bodyTemplates = [
            t("W_ST_1", () => `${bowler} deceives ${outName}: ${keeperCredit} ${forScore}!`),
            t("W_ST_2", () => `Sharp work behind the stumps! ${outName} is ${keeperCredit} off ${bowler} ${forScore}.`),
            t("W_ST_3", () => `${bowler} draws ${outName} out of the crease, ${keeperCredit} ${forScore}.`),
            ...when(fielderName !== null,
              t("W_ST_4", () => `${outName} is out of the crease and ${fielderName} whips off the bails. Stumped ${forScore}.`)),
          ];
        } else if (d.dismissal.kind === "RUN_OUT") {
          family = "WICKET_RUN_OUT_STRIKER";
          const throwCredit = fielderName ? ` (${fielderName})` : "";
          bodyTemplates = [
            t("W_RO_S_1", () => `${bowler} to ${striker}: ${outName} run out${throwCredit} ${forScore}!`),
            t("W_RO_S_2", () => `Quick work in the field${throwCredit}! ${outName} is run out ${forScore}.`),
            t("W_RO_S_3", () => `Short of the ground! ${outName} departs run out${throwCredit} ${forScore}.`),
            ...when(stroke !== null,
              t("W_RO_S_4", () => `${outName} ${stroke!.act} ${stroke!.where} and goes for the run, but is short of the ground: run out${throwCredit} ${forScore}.`)),
          ];
        } else {
          family = "WICKET_HIT_WICKET";
          bodyTemplates = [
            t("W_HW_1", () => `${bowler} to ${striker}: ${outName} is out hit wicket ${forScore}!`),
            t("W_HW_2", () => `Unfortunate dismissal: ${outName} disturbs the stumps, out hit wicket off ${bowler} ${forScore}.`),
            t("W_HW_3", () => `${outName} falls hit wicket to ${bowler} ${forScore}.`),
          ];
        }
        if (outBatterFig.runs === 0) {
          const duck = outBatterFig.ballsFaced === 0
            ? "A diamond duck: out without facing a ball."
            : outBatterFig.ballsFaced === 1 && !isNonStrikerOut
              ? "A golden duck, first ball."
              : choose(`${phraseKey}|duck`, ["Out for a duck.", "No score for the batter.", "A duck."]);
          deliveryNotes.push(duck);
        }
        if (d.dismissal.creditedBowlerId === d.bowlerId && (bowlerFig.wickets === 2 || bowlerFig.wickets === 4)) {
          deliveryNotes.push(`That is ${bowler}'s ${ordinalWord(bowlerFig.wickets)} wicket.`);
        }
      } else if (d.legality === "WIDE") {
        family = "DELIVERY_WIDE";
        short = `${totalRuns}wd`;
        factSlots.push({
          slot: "wides",
          value: String(d.extras.wides),
          sourceKind: "EVENT_FIELD",
          sourceRef: "delivery.extras.wides",
        });
        const wides = plural(totalRuns, "wide");
        bodyTemplates = [
          t("DLV_WD_1", () => `${bowler} strays wide of ${striker}; ${wides} added, and the ball is bowled again.`),
          t("DLV_WD_2", () => `${bowler} misses the radar against ${striker}: called wide (${plural(totalRuns, "extra")}).`),
          t("DLV_WD_3", () => `Wide signalled off ${bowler} to ${striker}: ${plural(totalRuns, "run")} to the total.`),
          ...when(lead !== null,
            t("DLV_WD_4", () => `${bowls}, but it is called wide. ${capitalise(plural(totalRuns, "extra"))}.`)),
          ...when(totalRuns > 1,
            t("DLV_WD_5", () => `A wide from ${bowler}, and they add ${countWord(totalRuns - 1)} more: ${wides} in all.`)),
        ];
      } else if (d.legality === "NO_BALL") {
        family = "DELIVERY_NO_BALL";
        short = freeHitEligible ? `${totalRuns}nb (FH)` : `${totalRuns}nb`;
        factSlots.push({
          slot: "noBalls",
          value: String(d.extras.noBalls),
          sourceKind: "EVENT_FIELD",
          sourceRef: "delivery.extras.noBalls",
        });
        const fhSuffix = freeHitEligible
          ? ` ${choose(`${phraseKey}|fh`, ["Free hit to come.", "Free hit next ball.", "That brings a free hit."])}`
          : "";
        const batNote =
          d.batRuns > 0
            ? ` plus ${d.batRuns} off the bat`
            : extrasTotal > d.extras.noBalls
              ? ` plus ${plural(extrasTotal - d.extras.noBalls, "extra")}`
              : "";
        const stroke = d.batRuns > 0 ? scoringStroke(phraseKey, d.shotSector, d.trajectory, d.executedLength) : null;
        bodyTemplates = [
          t("DLV_NB_1", () => `No-ball called on ${bowler} to ${striker} (${plural(totalRuns, "run")}${batNote}).${fhSuffix}`),
          t("DLV_NB_2", () => `${bowler} bowls a no-ball to ${striker}: it costs ${plural(totalRuns, "run")}${batNote}.${fhSuffix}`),
          t("DLV_NB_3", () => `No-ball from ${bowler}, ${totalRuns} added${batNote}.${fhSuffix}`),
          ...when(stroke !== null,
            t("DLV_NB_4", () => `No-ball from ${bowler}, and ${striker} ${stroke!.act} ${stroke!.where} for ${plural(d.batRuns, "run")} as well; ${totalRuns} in all.${fhSuffix}`)),
        ];
      } else if (d.boundary === "SIX") {
        family = "DELIVERY_SIX";
        short = "6";
        const six = sixStroke(phraseKey, d.shotSector, d.trajectory, d.executedLength);
        bodyTemplates = six
          ? [
              t("DLV_SIX_1", () => `Six! ${striker} ${strokeWithBowler(six, bowler)}.`),
              t("DLV_SIX_2", () => `${capitalise(six.part)} ${six.where} for six by ${striker}.`),
              t("DLV_SIX_3", () => `${bowls}, and ${striker} sends it ${six.where} for six.`),
              t("DLV_SIX_4", () => `${striker} clears the rope, ${six.part} ${six.where}.`),
              t("DLV_SIX_5", () => `Maximum! ${striker} ${six.act} it ${six.where}.`),
              t("DLV_SIX_6", () => `${striker} goes big against ${bowler}: ${six.part} ${six.where} for six.`),
              ...when(d.trajectory === "EDGE",
                t("DLV_SIX_ED", () => `Off the top edge and all the way: ${striker} ${six.act} ${bowler} ${six.where} for six.`)),
            ]
          : [
              t("DLV_SIX_7", () => `Six! ${striker} clears the rope off ${bowler}.`),
              t("DLV_SIX_8", () => `${bowls}, and ${striker} hits it for six.`),
              t("DLV_SIX_9", () => `Maximum for ${striker} off ${bowler}.`),
            ];
      } else if (d.boundary === "FOUR") {
        family = "DELIVERY_FOUR";
        short = "4";
        const four = scoringStroke(phraseKey, d.shotSector, d.trajectory, d.executedLength);
        bodyTemplates = four
          ? [
              t("DLV_FOUR_1", () => `Four! ${striker} ${strokeWithBowler(four, bowler)}.`),
              t("DLV_FOUR_2", () => `${capitalise(four.part)} ${four.where} for four by ${striker}.`),
              t("DLV_FOUR_3", () => `${bowls}, and ${striker} ${four.act} ${four.where} for four.`),
              t("DLV_FOUR_4", () => `${striker} finds the boundary, ${four.part} ${four.where}.`),
              t("DLV_FOUR_5", () => `Boundary. ${striker} ${four.act} ${four.where} and it races away.`),
              ...when(d.trajectory === "GROUND",
                t("DLV_FOUR_GR", () => `${striker} times it: ${four.part} ${four.where}, and nobody is stopping that. Four.`)),
              ...when(d.trajectory === "EDGE",
                t("DLV_FOUR_ED", () => `${bowler} finds the edge of the bat, but it runs away ${four.where} for four.`)),
              ...when(d.trajectory === "AERIAL",
                t("DLV_FOUR_AR", () => `${striker} takes the aerial route, ${four.part} ${four.where} for four.`)),
            ]
          : [
              t("DLV_FOUR_6", () => `Four! ${striker} finds the rope off ${bowler}.`),
              t("DLV_FOUR_7", () => `${bowls}, and ${striker} hits it to the boundary.`),
              t("DLV_FOUR_8", () => `Boundary for ${striker} off ${bowler}.`),
            ];
      } else if (totalRuns === 0) {
        family = "DELIVERY_DOT";
        short = "0";
        const stroke = fieldedStroke(phraseKey, d.shotSector, d.trajectory, d.executedLength);
        const noun = lengthNoun(phraseKey, d.executedLength);
        const fielded = d.fieldOutcome === "STOP";
        const safe = d.fieldOutcome !== "DROP";
        bodyTemplates = stroke
          ? [
              t("DLV_DOT_C1", () => `${striker} ${stroke.act} ${stroke.where}; no run.`),
              t("DLV_DOT_C2", () => `${capitalise(stroke.part)} ${stroke.where}${fielded ? ", and it is fielded" : ""}. Dot ball.`),
              t("DLV_DOT_C3", () => `${bowls}; ${striker} ${stroke.act} ${stroke.where}, no run.`),
              t("DLV_DOT_C4", () => `Dot ball. ${striker} ${stroke.act} ${stroke.where}.`),
              t("DLV_DOT_C5", () => `${bowler} gives ${striker} nothing: ${stroke.part} ${stroke.where}, no run.`),
              t("DLV_DOT_C6", () => `${noun === "that one" ? "That one" : capitalise(noun)} from ${bowler}, ${stroke.part} ${stroke.where} by ${striker}. No run.`),
              ...when(fielded,
                t("DLV_DOT_ST", () => `${striker} ${stroke.act} ${stroke.where}, but it is stopped. No run.`)),
              ...when(d.trajectory === "EDGE" && safe,
                t("DLV_DOT_ED", () => `${striker} ${stroke.act} ${stroke.where}, but it falls safe. No run.`)),
              ...when(d.trajectory === "AERIAL" && safe,
                t("DLV_DOT_AR", () => `${striker} ${stroke.act} ${stroke.where}, but it is safe, and there is no run.`)),
              ...when(d.executedLength === "YORKER",
                t("DLV_DOT_YK", () => `${bowler} nails the yorker; ${striker} ${stroke.act} ${stroke.where}.`)),
            ]
          : [
              t("DLV_DOT_N1", () => `${bowls}, and ${striker} does not get bat on it.`),
              t("DLV_DOT_N2", () => `Nothing off the bat from ${striker}: ${noun} from ${bowler}.`),
              t("DLV_DOT_N3", () => `${bowler} to ${striker}, ${noun}, and no bat on it. Dot ball.`),
              t("DLV_DOT_5", () => `Another dot: ${bowler} keeps ${striker} quiet.`),
              t("DLV_DOT_6", () => `No run. ${bowler} to ${striker}, ${noun}.`),
              ...when(d.executedLength === "YORKER",
                t("DLV_DOT_YK2", () => `${bowler} lands the yorker and ${striker} cannot get bat on it.`)),
              ...when(d.executedLength === "SHORT",
                t("DLV_DOT_SH", () => `${bowler} goes short and there is no bat on it from ${striker}.`)),
              ...when(d.executedLength === "GOOD",
                t("DLV_DOT_GD", () => `Good length from ${bowler}, and ${striker} is kept honest: no bat on it.`)),
              ...when(d.executedLength === "FULL_TOSS",
                t("DLV_DOT_FT", () => `A full toss from ${bowler}, but ${striker} cannot cash in.`)),
            ];
        if (input.format !== "RED_BALL" && dotStreak >= 6 && dotStreak % 3 === 0) {
          deliveryNotes.push(`That is ${countWord(dotStreak)} dot balls in a row.`);
        }
      } else if (d.batRuns === 0 && (d.extras.byes > 0 || d.extras.legByes > 0)) {
        family = "DELIVERY_BYES_LEGBYES";
        const legBye = d.extras.legByes > 0;
        const kindLabel = legBye ? "lb" : "b";
        const kindWord = legBye ? "leg bye" : "bye";
        const extras = plural(totalRuns, kindWord);
        short = `${totalRuns}${kindLabel}`;
        bodyTemplates = [
          t("DLV_BLB_1", () => `${bowler} to ${striker}: ${extras}.`),
          t("DLV_BLB_2", () => `${legBye ? "Off the body" : "Past the bat"} off ${bowler}; ${striker} and ${nonStriker} cross for ${extras}.`),
          t("DLV_BLB_3", () => `${capitalise(extras)} signalled from ${bowler}'s delivery to ${striker}.`),
          ...when(lead !== null,
            t("DLV_BLB_4", () => `${bowls}; nothing off the bat, but they take ${extras}.`)),
        ];
      } else if (totalRuns === 1) {
        family = "DELIVERY_SINGLE";
        short = "1";
        const stroke = scoringStroke(phraseKey, d.shotSector, d.trajectory, d.executedLength);
        bodyTemplates = stroke
          ? [
              t("DLV_ONE_1", () => `${striker} ${stroke.act} ${stroke.where} for a single.`),
              t("DLV_ONE_2", () => `${capitalise(stroke.part)} ${stroke.where}, and ${striker} takes one.`),
              t("DLV_ONE_3", () => `${bowls}; ${striker} ${stroke.act} ${stroke.where} for one.`),
              t("DLV_ONE_4", () => `Single. ${striker} ${stroke.act} ${stroke.where}.`),
              t("DLV_ONE_5", () => `${striker} keeps the strike moving, ${stroke.part} ${stroke.where}.`),
              t("DLV_ONE_6", () => `One more for ${striker}, ${stroke.part} ${stroke.where}.`),
              t("DLV_ONE_7", () => `${striker} and ${nonStriker} swap ends: ${stroke.part} ${stroke.where} for one.`),
              ...when(stroke.object,
                t("DLV_ONE_8", () => `${striker} ${strokeWithBowler(stroke, bowler)} for one.`)),
            ]
          : [
              t("DLV_ONE_9", () => `${striker} takes a single off ${bowler}.`),
              t("DLV_ONE_10", () => `One run for ${striker}.`),
              t("DLV_ONE_11", () => `${bowls}; ${striker} picks up a single.`),
            ];
      } else {
        family = "DELIVERY_MULTI_RUN";
        short = String(totalRuns);
        const stroke = scoringStroke(phraseKey, d.shotSector, d.trajectory, d.executedLength);
        const n = countWord(totalRuns);
        bodyTemplates = stroke
          ? [
              t("DLV_MULTI_1", () => `${striker} ${stroke.act} ${stroke.where} and they come back for ${n}.`),
              t("DLV_MULTI_2", () => `Good running: ${stroke.part} ${stroke.where}, and ${striker} and ${nonStriker} take ${n}.`),
              t("DLV_MULTI_3", () => `${bowls}; ${striker} ${stroke.act} ${stroke.where} for ${n}.`),
              t("DLV_MULTI_4", () => `${capitalise(n)} runs: ${striker} ${stroke.act} ${stroke.where}.`),
              t("DLV_MULTI_5", () => `${capitalise(stroke.part)}${sameWhere(stroke)} by ${striker}, and they run ${n}.`),
              ...when(stroke.object,
                t("DLV_MULTI_6", () => `${striker} ${strokeWithBowler(stroke, bowler)} for ${n}.`)),
            ]
          : [
              t("DLV_MULTI_7", () => `${striker} and ${nonStriker} run ${n} off ${bowler}.`),
              t("DLV_MULTI_8", () => `${capitalise(n)} runs for ${striker}.`),
              t("DLV_MULTI_9", () => `${bowls}; ${striker} picks up ${n}.`),
            ];
      }

      if ((d.boundary === "FOUR" || d.boundary === "SIX") && !d.dismissal && d.legality !== "WIDE") {
        if (boundariesThisOver >= 3) deliveryNotes.push(`That is the ${ordinalWord(boundariesThisOver)} boundary of the over.`);
        else if (backToBack) deliveryNotes.push(`Back-to-back boundaries for ${striker}.`);
        else if (milestoneNotes.length === 0 && choose(`${phraseKey}|score`, [true, false]))
          deliveryNotes.push(`Up to ${batterFig.runs} from ${plural(batterFig.ballsFaced, "ball")}.`);
      }

      if (milestoneTags.length > 0 && category === "DELIVERY") {
        category = "MILESTONE";
      }

      const picked = pickTemplateWithCooldown(
        family,
        bodyTemplates,
        presentationKey,
        ev.sequence,
        evHash,
        recentTemplateIds,
        cooldownWindow,
      );

      const at = sectorPhrase ? ` at ${sectorPhrase}` : "";
      const dropNotice =
        !d.dismissal && d.fieldOutcome === "DROP"
          ? ` ${choose(`${phraseKey}|drop`, [`Dropped! ${striker} is given a life.`, `Put down! A chance goes begging${at}.`, `A catch goes down${at}, and ${striker} survives.`])}`
          : !d.dismissal && d.fieldOutcome === "MISS"
            ? totalRuns > 0
              ? ` A misfield${at} helps them on their way.`
              : ` Fumbled${at}, but no run.`
            : "";
      const milestoneSuffix =
        milestoneNotes.length > 0 ? ` ${milestoneNotes.join(" ")}` : "";
      const notesSuffix = deliveryNotes.length > 0 ? ` ${deliveryNotes.join(" ")}` : "";

      // Pavilion P07: at a wicket, one line on the stand it broke, the new batter's task or the wickets left.
      const wicketLine = d.dismissal
        ? wicketContext({ format: input.format, standRuns: standBeforeWicket.runs, standBalls: standBeforeWicket.balls,
            runs: inn.runs, wickets: inn.wickets, legalBalls: inn.legalBalls, targetToWin: inn.targetToWin })
        : null;
      if (wicketLine) factSlots.push({ slot: wicketLine.slot, value: wicketLine.text, sourceKind: "PARTNERSHIP_PROJECTION", sourceRef: "innings.partnership" });
      // Keep `Innings X, ...` prefix strictly on DELIVERY_RECORDED for match-ui invariant compatibility
      const freeHitLead = wasFreeHit ? "Free hit. " : "";
      const standardText = `Innings ${d.inningsIndex + 1}, ${coord}: ${freeHitLead}${picked.selected.render()}${dropNotice}${notesSuffix}${milestoneSuffix}${wicketLine ? ` ${wicketLine.text}` : ""}`;

      const techParts: string[] = [];
      if (wasFreeHit) techParts.push("free-hit delivery");
      if (lengthPhrase) techParts.push(`${lengthPhrase} length`);
      if (trajectoryPhrase) techParts.push(trajectoryPhrase);
      if (sectorPhrase) techParts.push(`towards ${sectorPhrase}`);
      const techClause = techParts.length > 0 ? ` [${techParts.join(", ")}]` : "";

      const standClause = d.dismissal
        ? `Stand ended on ${standBeforeWicket.runs} (${standBeforeWicket.balls}b)`
        : `Stand ${inn.partnershipRuns} (${inn.partnershipBalls}b)`;
      const ballsLeft = inn.allocatedBalls !== null ? Math.max(0, inn.allocatedBalls - inn.legalBalls) : null;
      const chaseClause =
        inn.targetToWin !== null && inn.runs < inn.targetToWin && ballsLeft !== 0
          ? ballsLeft !== null
            ? `. Need ${inn.targetToWin - inn.runs} off ${ballsLeft}b`
            : `. Need ${inn.targetToWin - inn.runs} more to win`
          : "";

      const detailedText = `${standardText}${techClause} Score ${inn.runs}/${inn.wickets}; ${striker} ${batterFig.runs} (${batterFig.ballsFaced}), ${bowler} ${bowlerFiguresText(bowlerFig)}. ${standClause}${chaseClause}.`;

      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category,
        templateId: picked.selected.id,
        templateFamily: family,
        cooldownApplied: picked.cooldownApplied,
        presentationDigest: picked.digest,
        milestoneTags,
        short: `${coord} · ${short}`,
        text: standardText,
        detailed: detailedText,
        factSlots,
      });
      continue;
    }

    if (ev.type === "OVER_COMPLETED") {
      const p = ev.payload as { bowlerId: string };
      const inn = ensureInnings(activeInningsIndex);
      const overNum = Math.floor(inn.legalBalls / 6);
      const bowler = pName(p.bowlerId);
      const bowlerFig = getBowler(inn, p.bowlerId);
      const isMaiden =
        bowlerFig.currentOverLegalBalls === 6 &&
        bowlerFig.currentOverBowlerRuns === 0;
      if (isMaiden) {
        bowlerFig.maidens += 1;
      }
      const overRuns = inn.overTeamRuns;
      const overWkts = inn.overWickets;
      inn.overHistory.push({ runs: overRuns, wickets: overWkts });
      inn.overTeamRuns = 0;
      inn.overWickets = 0;
      inn.overLegalBalls = 0;
      inn.overBoundaries = 0;
      bowlerFig.currentOverBowlerRuns = 0;
      bowlerFig.currentOverLegalBalls = 0;

      const milestoneTags: CommentaryMilestoneTag[] = isMaiden
        ? ["MAIDEN_OVER"]
        : [];
      const teamName = tName(inn.battingTeamId);
      const figs = bowlerFiguresText(bowlerFig);
      const ballsLeft = inn.allocatedBalls !== null ? Math.max(0, inn.allocatedBalls - inn.legalBalls) : null;
      // No equation once the overs are used up: the innings is over, and "needed from 0 balls" says nothing.
      const chaseTail =
        inn.targetToWin !== null && inn.runs < inn.targetToWin && ballsLeft !== 0
          ? ballsLeft !== null
            ? ` (${inn.targetToWin - inn.runs} needed from ${plural(ballsLeft, "ball")})`
            : ` (${inn.targetToWin - inn.runs} needed to win)`
          : "";
      const score = `${inn.runs}/${inn.wickets}`;
      const offOver = `${plural(overRuns, "run")}${overWkts > 0 ? ` and ${overWkts === 1 ? "a wicket" : `${countWord(overWkts)} wickets`}` : ""}`;

      const family = isMaiden ? "OVER_MAIDEN" : "OVER_SUMMARY";
      const templates = isMaiden
        ? [
            { id: "OV_MDN_1", render: () => `End of over ${overNum} (maiden from ${bowler}): ${teamName} ${score}${chaseTail}.` },
            { id: "OV_MDN_2", render: () => `Maiden over! ${bowler} closes over ${overNum} without conceding a run. ${teamName} ${score}${chaseTail}.` },
            { id: "OV_MDN_3", render: () => `Over ${overNum} complete, a probing maiden by ${bowler}. ${teamName} stand at ${score}${chaseTail}.` },
            { id: "OV_MDN_4", render: () => `A maiden from ${bowler}, who is now ${figs}. ${teamName} ${score}${chaseTail}.` },
          ]
        : [
            { id: "OV_SUM_1", render: () => `End of over ${overNum}: ${offOver}. ${teamName} ${score}${chaseTail}.` },
            { id: "OV_SUM_2", render: () => `Over ${overNum} done, ${offOver} from it. ${teamName} are ${score}${chaseTail}.` },
            { id: "OV_SUM_3", render: () => `After ${plural(overNum, "over")}, ${teamName} are ${score} (${overRuns} from ${bowler}'s over)${chaseTail}.` },
            { id: "OV_SUM_4", render: () => `${capitalise(offOver)} from the over. ${teamName} ${score} after ${overNum}${chaseTail}.` },
            { id: "OV_SUM_5", render: () => `${bowler}'s over costs ${overRuns}${overWkts > 0 ? ` but brings ${overWkts === 1 ? "a wicket" : `${countWord(overWkts)} wickets`}` : ""}; ${teamName} are ${score}${chaseTail}.` },
            { id: "OV_SUM_6", render: () => `That is over ${overNum}: ${offOver} off it, ${teamName} on ${score}${chaseTail}.` },
            { id: "OV_SUM_7", render: () => `${bowler} finishes the over with figures of ${figs}. ${teamName} ${score}${chaseTail}.` },
            ...(overRuns >= 1 && overRuns <= 3 && overWkts === 0
              ? [{ id: "OV_SUM_TIGHT", render: () => `A tight over from ${bowler}, just ${plural(overRuns, "run")}. ${teamName} ${score}${chaseTail}.` }]
              : []),
            ...(overRuns >= 12
              ? [{ id: "OV_SUM_DEAR", render: () => `${overRuns} from the over: a costly one for ${bowler}. ${teamName} ${score}${chaseTail}.` }]
              : []),
          ];

      const picked = pickTemplateWithCooldown(
        family,
        templates,
        presentationKey,
        ev.sequence,
        evHash,
        recentTemplateIds,
        cooldownWindow,
      );
      // Pavilion P07: one line of match context when the innings has a story to tell.
      const context = overContext({
        format: input.format, overs: inn.overHistory, runs: inn.runs, wickets: inn.wickets, legalBalls: inn.legalBalls, targetToWin: inn.targetToWin,
        bowlerName: bowler, bowlerFigures: figs, bowlerLegalBalls: bowlerFig.legalBalls, ballsSinceBoundary: inn.ballsSinceBoundary,
      });
      const standardText = context ? `${picked.selected.render()} ${context.text}` : picked.selected.render();
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "OVER",
        templateId: picked.selected.id,
        templateFamily: family,
        cooldownApplied: picked.cooldownApplied,
        presentationDigest: picked.digest,
        milestoneTags,
        short: `Ov ${overNum}: ${inn.runs}/${inn.wickets}${isMaiden ? " (M)" : ""}`,
        text: standardText,
        detailed: `${standardText} ${bowler} figures: ${figs}; current stand ${inn.partnershipRuns} (${inn.partnershipBalls}b).`,
        factSlots: [
          {
            slot: "overNumber",
            value: String(overNum),
            sourceKind: "INNINGS_PROJECTION",
            sourceRef: "innings.completedOvers",
          },
          {
            slot: "overRuns",
            value: String(overRuns),
            sourceKind: "INNINGS_PROJECTION",
            sourceRef: "innings.overTeamRuns",
          },
          {
            slot: "inningsScore",
            value: `${inn.runs}/${inn.wickets}`,
            sourceKind: "INNINGS_PROJECTION",
            sourceRef: "innings.scoreAfter",
          },
          {
            slot: "bowlerFigures",
            value: figs,
            sourceKind: "BOWLER_PROJECTION",
            sourceRef: `bowler.${p.bowlerId}`,
          },
          ...(context ? [{ slot: context.slot, value: context.text, sourceKind: "INNINGS_PROJECTION" as const, sourceRef: "innings.overHistory" }] : []),
        ],
      });
      continue;
    }

    if (ev.type === "INNINGS_STARTED") {
      const p = ev.payload as { inningsIndex: number; battingTeamId: string };
      activeInningsIndex = p.inningsIndex;
      const inn = ensureInnings(p.inningsIndex, p.battingTeamId);
      const teamName = tName(inn.battingTeamId);
      const targetClause =
        inn.targetToWin !== null
          ? inn.allocatedBalls !== null
            ? ` chasing ${inn.targetToWin} from ${Math.floor(inn.allocatedBalls / 6)} overs`
            : ` requiring ${inn.targetToWin} to win`
          : "";
      const picked = pickTemplateWithCooldown(
        "INNINGS_STARTED",
        [
          {
            id: "INN_START_1",
            render: () =>
              `Start of innings ${p.inningsIndex + 1}: ${teamName} begin batting${targetClause}.`,
          },
          {
            id: "INN_START_2",
            render: () =>
              `Innings ${p.inningsIndex + 1} under way: ${teamName} take the crease${targetClause}.`,
          },
          ...(inn.targetToWin !== null
            ? [{ id: "INN_START_3", render: () => `${teamName} need ${inn.targetToWin} to win${inn.allocatedBalls !== null ? ` from ${Math.floor(inn.allocatedBalls / 6)} overs` : ""}. Innings ${p.inningsIndex + 1} begins.` }]
            : []),
        ],
        presentationKey,
        ev.sequence,
        evHash,
        recentTemplateIds,
        cooldownWindow,
      );
      const standardText = picked.selected.render();
      const factSlots: CommentaryFactSlot[] = [
        {
          slot: "inningsNumber",
          value: String(p.inningsIndex + 1),
          sourceKind: "EVENT_FIELD",
          sourceRef: "event.inningsIndex",
        },
        {
          slot: "battingTeam",
          value: teamName,
          sourceKind: "EVENT_FIELD",
          sourceRef: "event.battingTeamId",
        },
      ];
      if (inn.targetToWin !== null) {
        factSlots.push({
          slot: "targetToWin",
          value: String(inn.targetToWin),
          sourceKind: "CHASE_PROJECTION",
          sourceRef: "innings.targetToWin",
        });
      }
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "INNINGS",
        templateId: picked.selected.id,
        templateFamily: "INNINGS_STARTED",
        cooldownApplied: picked.cooldownApplied,
        presentationDigest: picked.digest,
        milestoneTags: [],
        short: `Inn ${p.inningsIndex + 1}: ${teamName}`,
        text: standardText,
        detailed: `${standardText} Format: ${input.format}.`,
        factSlots,
      });
      continue;
    }

    if (ev.type === "INNINGS_COMPLETED") {
      const p = ev.payload as { inningsIndex: number };
      const inn = ensureInnings(p.inningsIndex);
      const teamName = tName(inn.battingTeamId);
      const oversStr = formatOvers(inn.legalBalls);
      const allOut = inn.wickets >= 10;
      // Pavilion P07: the innings in one more line, its top score and best bowling.
      const summary = inningsSummary({ format: input.format, batters: inn.batters, bowlers: inn.bowlers, names: input.playerNames });
      const closeText = allOut
        ? `End of innings ${p.inningsIndex + 1}: ${teamName} all out for ${inn.runs} in ${oversStr} overs.`
        : `End of innings ${p.inningsIndex + 1}: ${teamName} close on ${inn.runs}/${inn.wickets} (${oversStr} overs).`;
      const standardText = summary ? `${closeText} ${summary}` : closeText;
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "INNINGS",
        templateId: allOut ? "INN_END_ALL_OUT" : "INN_END_CLOSED",
        templateFamily: "INNINGS_COMPLETED",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|INN_END`)),
        milestoneTags: allOut ? ["ALL_OUT"] : [],
        short: `End Inn ${p.inningsIndex + 1}: ${inn.runs}/${inn.wickets}`,
        text: standardText,
        detailed: `${standardText} Legal deliveries: ${inn.legalBalls}.`,
        factSlots: [
          {
            slot: "inningsNumber",
            value: String(p.inningsIndex + 1),
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.inningsIndex",
          },
          {
            slot: "inningsTotal",
            value: `${inn.runs}/${inn.wickets}`,
            sourceKind: "INNINGS_PROJECTION",
            sourceRef: "innings.scoreAfter",
          },
          {
            slot: "overs",
            value: oversStr,
            sourceKind: "INNINGS_PROJECTION",
            sourceRef: "innings.legalBalls",
          },
          ...(summary ? [{ slot: "inningsSummary", value: summary.slice(0, 160), sourceKind: "INNINGS_PROJECTION" as const, sourceRef: "innings.batters+bowlers" }] : []),
        ],
      });
      continue;
    }

    if (ev.type === "MATCH_COMPLETED") {
      const r = (ev.payload as { result: MatchResult | null }).result;
      let short = "Match complete";
      let standardText = "Match completed.";
      const factSlots: CommentaryFactSlot[] = [];
      if (r) {
        factSlots.push({
          slot: "resultKind",
          value: r.kind,
          sourceKind: "MATCH_RESULT",
          sourceRef: "result.kind",
        });
        if (r.kind === "WIN") {
          const winner = tName(r.winnerTeamId);
          factSlots.push({
            slot: "winnerTeam",
            value: winner,
            sourceKind: "MATCH_RESULT",
            sourceRef: "result.winnerTeamId",
          });
          if (r.marginType === "RUNS") {
            short = `${winner} won by ${r.marginRuns} run${r.marginRuns === 1 ? "" : "s"}`;
            standardText = `Result: ${winner} win by ${r.marginRuns} run${r.marginRuns === 1 ? "" : "s"}.`;
            factSlots.push({
              slot: "marginRuns",
              value: String(r.marginRuns),
              sourceKind: "MATCH_RESULT",
              sourceRef: "result.marginRuns",
            });
          } else if (r.marginType === "WICKETS") {
            short = `${winner} won by ${r.marginWickets} wkt${r.marginWickets === 1 ? "" : "s"}`;
            standardText = `Result: ${winner} win by ${r.marginWickets} wicket${r.marginWickets === 1 ? "" : "s"}.`;
            factSlots.push({
              slot: "marginWickets",
              value: String(r.marginWickets),
              sourceKind: "MATCH_RESULT",
              sourceRef: "result.marginWickets",
            });
          } else {
            short = `${winner} won by innings & ${r.marginRuns}`;
            standardText = `Result: ${winner} win by an innings and ${r.marginRuns} run${r.marginRuns === 1 ? "" : "s"}.`;
            factSlots.push({
              slot: "marginRuns",
              value: String(r.marginRuns),
              sourceKind: "MATCH_RESULT",
              sourceRef: "result.marginRuns",
            });
          }
        } else if (r.kind === "TIE") {
          short = "Match tied";
          standardText = `Result: Match tied (${r.completionReason}).`;
        } else if (r.kind === "DRAW") {
          short = "Match drawn";
          standardText = `Result: Match drawn (${r.completionReason}).`;
        } else {
          short = "No result";
          standardText = `Result: No result (${r.completionReason}).`;
        }
      } else {
        factSlots.push({
          slot: "eventType",
          value: ev.type,
          sourceKind: "EVENT_FIELD",
          sourceRef: "event.type",
        });
      }
      const inningsBreakdown = [...inningsByIndex.values()]
        .sort((a, b) => a.inningsIndex - b.inningsIndex)
        .map(
          (inn) =>
            `${tName(inn.battingTeamId)} ${inn.runs}/${inn.wickets}${inn.declared ? "d" : ""} (${formatOvers(inn.legalBalls)} ov)`,
        )
        .join("; ");
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "RESULT",
        templateId: `RESULT_${r?.kind ?? "COMPLETE"}`,
        templateFamily: "MATCH_COMPLETED",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|RESULT`)),
        milestoneTags: [],
        short,
        text: standardText,
        detailed: inningsBreakdown
          ? `${standardText} Final scores: ${inningsBreakdown}.`
          : standardText,
        factSlots,
      });
      continue;
    }

    if (ev.type === "TOSS_RESOLVED") {
      const p = ev.payload as { winnerId: string; coin: string; callerId?: string; call?: string };
      const winner = tName(p.winnerId);
      const coin = p.coin.toLowerCase();
      const text = `Toss: ${coin}. ${winner} won the toss.`;
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "SELECTION",
        templateId: "TOSS_RESOLVED_1",
        templateFamily: "TOSS_RESOLVED",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|TOSS`)),
        milestoneTags: [],
        short: `Toss: ${winner} (${coin})`,
        text,
        detailed:
          p.callerId && p.call
            ? `${text} (${tName(p.callerId)} called ${p.call.toLowerCase()}).`
            : text,
        factSlots: [
          {
            slot: "coin",
            value: coin,
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.coin",
          },
          {
            slot: "winnerTeam",
            value: winner,
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.winnerId",
          },
        ],
      });
      continue;
    }

    if (ev.type === "BATTER_SELECTED") {
      const playerId = (ev.payload as { playerId: string }).playerId;
      const batter = pName(playerId);
      const inn = ensureInnings(activeInningsIndex);
      // CP10: the batting position comes from the order of selections in this innings.
      inn.battersIn += 1;
      const position = inn.battersIn;
      const score = `${inn.runs}/${inn.wickets}`;
      const picked = pickTemplateWithCooldown(
        "BATTER_SELECTED",
        position <= 2 && inn.legalBalls === 0
          ? [
              { id: "BAT_SEL_O1", render: () => `${batter} opens the batting.` },
              { id: "BAT_SEL_O2", render: () => `${batter} walks out to open.` },
              { id: "BAT_SEL_O3", render: () => `${batter} will open for ${tName(inn.battingTeamId)}.` },
            ]
          : [
              { id: "BAT_SEL_1", render: () => `${batter} comes in to bat at number ${position}.` },
              { id: "BAT_SEL_2", render: () => `${batter} walks to the crease.` },
              { id: "BAT_SEL_3", render: () => `In comes ${batter}, with the score ${score}.` },
              { id: "BAT_SEL_4", render: () => `${batter} makes the walk out at ${score}.` },
              { id: "BAT_SEL_5", render: () => `${batter} is next in, at number ${position}, with ${tName(inn.battingTeamId)} ${score}.` },
            ],
        presentationKey,
        ev.sequence,
        evHash,
        recentTemplateIds,
        cooldownWindow,
      );
      const text = picked.selected.render();
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "SELECTION",
        templateId: picked.selected.id,
        templateFamily: "BATTER_SELECTED",
        cooldownApplied: picked.cooldownApplied,
        presentationDigest: picked.digest,
        milestoneTags: [],
        short: `In: ${batter}`,
        text,
        detailed: `${text} (${tName(inn.battingTeamId)} ${inn.runs}/${inn.wickets}).`,
        factSlots: [
          {
            slot: "batterName",
            value: batter,
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.playerId",
          },
        ],
      });
      continue;
    }

    if (ev.type === "BOWLER_SELECTED") {
      const playerId = (ev.payload as { playerId: string }).playerId;
      const bowler = pName(playerId);
      const inn = ensureInnings(activeInningsIndex);
      const bowlerSoFar = getBowler(inn, playerId);
      const figs = bowlerFiguresText(bowlerSoFar);
      // Pavilion P07: a returning bowler is introduced with the figures so far; a new one as new to the attack.
      // CP10: and the over they are to bowl, the new ball, or the last over of their allowance.
      const returning = bowlerSoFar.legalBalls > 0;
      const nextOver = Math.floor(inn.legalBalls / 6) + 1;
      const quotaBalls = input.format === "T20" ? 24 : input.format === "ODI" ? 60 : null;
      const lastOver = quotaBalls !== null && bowlerSoFar.legalBalls === quotaBalls - 6;
      const picked = pickTemplateWithCooldown(
        "BOWLER_SELECTED",
        returning
          ? [
              { id: "BWL_SEL_1", render: () => `${bowler} will bowl.` },
              { id: "BWL_SEL_R1", render: () => `${bowler} returns (${figs}).` },
              { id: "BWL_SEL_R2", render: () => `Back comes ${bowler}, ${figs} so far.` },
              { id: "BWL_SEL_R3", render: () => `${bowler} has the ball again (${figs}).` },
              { id: "BWL_SEL_R4", render: () => `${bowler} is back for over ${nextOver}, with figures of ${figs}.` },
              ...(lastOver ? [{ id: "BWL_SEL_LAST", render: () => `${bowler} to bowl the last over of the allowance (${figs}).` }] : []),
            ]
          : nextOver <= 2
            ? [
                { id: "BWL_SEL_NEW1", render: () => `${bowler} ${nextOver === 1 ? "will open the bowling" : "shares the new ball"}.` },
                { id: "BWL_SEL_NEW2", render: () => `${bowler} ${nextOver === 1 ? "takes the new ball" : "will bowl from the other end"}.` },
                { id: "BWL_SEL_N2", render: () => `First over of the innings for ${bowler}.` },
              ]
            : [
                { id: "BWL_SEL_2", render: () => `${bowler} comes into the attack.` },
                { id: "BWL_SEL_N1", render: () => `${bowler} into the attack for the first time.` },
                { id: "BWL_SEL_N3", render: () => `Change of bowling: ${bowler} to bowl over ${nextOver}.` },
                { id: "BWL_SEL_N4", render: () => `A first over for ${bowler}, the ${ordinalWord(nextOver)} of the innings.` },
              ],
        presentationKey,
        ev.sequence,
        evHash,
        recentTemplateIds,
        cooldownWindow,
      );
      const text = picked.selected.render();
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "SELECTION",
        templateId: picked.selected.id,
        templateFamily: "BOWLER_SELECTED",
        cooldownApplied: picked.cooldownApplied,
        presentationDigest: picked.digest,
        milestoneTags: [],
        short: `Bowl: ${bowler}`,
        text,
        detailed: `${text} Current figures: ${figs}.`,
        factSlots: [
          {
            slot: "bowlerName",
            value: bowler,
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.playerId",
          },
          {
            slot: "bowlerFigures",
            value: figs,
            sourceKind: "BOWLER_PROJECTION",
            sourceRef: `bowler.${playerId}`,
          },
        ],
      });
      continue;
    }

    if (ev.type === "RAIN_DELAY") {
      const secs = (ev.payload as { seconds: number }).seconds;
      const mins = Math.round(secs / 60);
      const text = `Weather delay: ${mins} minute${mins === 1 ? "" : "s"} lost to rain.`;
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "CONDITIONS",
        templateId: "RAIN_DELAY_1",
        templateFamily: "RAIN_DELAY",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|RAIN`)),
        milestoneTags: [],
        short: `Rain (${mins}m)`,
        text,
        detailed: `${text} (${secs} seconds deducted from playing time).`,
        factSlots: [
          {
            slot: "lostMinutes",
            value: `${mins} minute${mins === 1 ? "" : "s"}`,
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.seconds",
          },
        ],
      });
      continue;
    }

    if (ev.type === "DECLARED") {
      const teamId = (ev.payload as { teamId: string }).teamId;
      const teamName = tName(teamId);
      const inn = ensureInnings(activeInningsIndex);
      inn.declared = true;
      const text = `${teamName} declared the innings at ${inn.runs}/${inn.wickets}.`;
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "TACTICAL",
        templateId: "DECLARED_1",
        templateFamily: "DECLARED",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|DECL`)),
        milestoneTags: [],
        short: `Declared (${inn.runs}/${inn.wickets}d)`,
        text,
        detailed: `${text} (${formatOvers(inn.legalBalls)} overs bowled).`,
        factSlots: [
          {
            slot: "declaringTeam",
            value: teamName,
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.teamId",
          },
          {
            slot: "declaredTotal",
            value: `${inn.runs}/${inn.wickets}`,
            sourceKind: "INNINGS_PROJECTION",
            sourceRef: "innings.scoreAfter",
          },
        ],
      });
      continue;
    }

    if (ev.type === "FOLLOW_ON_CHOSEN") {
      const enforced = !!(ev.payload as { enforce: boolean }).enforce;
      const text = enforced ? "Follow-on enforced." : "Follow-on declined.";
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "TACTICAL",
        templateId: enforced ? "FOLLOW_ON_ENFORCED" : "FOLLOW_ON_DECLINED",
        templateFamily: "FOLLOW_ON_CHOSEN",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|FO`)),
        milestoneTags: [],
        short: text,
        text,
        detailed: enforced
          ? `${text} The trailing side will bat again immediately.`
          : `${text} The leading side elects to bat again.`,
        factSlots: [
          {
            slot: "followOnEnforced",
            value: String(enforced),
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.enforce",
          },
        ],
      });
      continue;
    }

    if (ev.type === "NEW_BALL_TAKEN") {
      const inn = ensureInnings(activeInningsIndex);
      const text = "New ball taken.";
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "TACTICAL",
        templateId: "NEW_BALL_TAKEN_1",
        templateFamily: "NEW_BALL_TAKEN",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|NB`)),
        milestoneTags: [],
        short: "New ball",
        text,
        detailed: `${text} Taken after ${formatOvers(inn.legalBalls)} overs with the score at ${inn.runs}/${inn.wickets}.`,
        factSlots: [
          {
            slot: "oversAtNewBall",
            value: formatOvers(inn.legalBalls),
            sourceKind: "INNINGS_PROJECTION",
            sourceRef: "innings.legalBalls",
          },
        ],
      });
      continue;
    }

    if (ev.type === "BATTING_PLAN_CHANGED") {
      const p = ev.payload as {
        playerId: string;
        aggression: number;
        intent: string;
      };
      const batter = pName(p.playerId);
      const text = battingPlanText(batter, p.aggression, p.intent);
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "TACTICAL",
        templateId: "BAT_PLAN_1",
        templateFamily: "BATTING_PLAN_CHANGED",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|BATP`)),
        milestoneTags: [],
        short: `Bat plan: ${batter}`,
        text,
        detailed: text,
        factSlots: [
          {
            slot: "batterName",
            value: batter,
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.playerId",
          },
          {
            slot: "aggression",
            value: String(p.aggression),
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.aggression",
          },
        ],
      });
      continue;
    }

    if (ev.type === "BOWLING_PLAN_CHANGED") {
      const p = ev.payload as {
        bowlerId: string;
        line: string;
        length: string;
        effort: string;
      };
      const bowler = pName(p.bowlerId);
      const text = bowlingPlanText(bowler, p.line, p.length, p.effort);
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "TACTICAL",
        templateId: "BWL_PLAN_1",
        templateFamily: "BOWLING_PLAN_CHANGED",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|BWLP`)),
        milestoneTags: [],
        short: `Bowl plan: ${bowler}`,
        text,
        detailed: text,
        factSlots: [
          {
            slot: "bowlerName",
            value: bowler,
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.bowlerId",
          },
          {
            slot: "line",
            value: p.line.toLowerCase(),
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.line",
          },
          {
            slot: "length",
            value: p.length.toLowerCase(),
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.length",
          },
        ],
      });
      continue;
    }

    if (ev.type === "FIELD_CHANGED") {
      const slots = (ev.payload as { fieldSlots: { slotId: string }[] }).fieldSlots;
      const text = "Field placement adjusted.";
      const slotSummary = slots
        .slice(0, 4)
        .map((s) => s.slotId.toLowerCase().replaceAll("_", " "))
        .join(", ");
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "TACTICAL",
        templateId: "FIELD_CHANGED_1",
        templateFamily: "FIELD_CHANGED",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|FLD`)),
        milestoneTags: [],
        short: "Field adjusted",
        text,
        detailed: slotSummary
          ? `${text} Fielders now include ${slotSummary}.`
          : text,
        factSlots: [
          {
            slot: "slotCount",
            value: String(slots.length),
            sourceKind: "EVENT_FIELD",
            sourceRef: "event.fieldSlots",
          },
        ],
      });
      continue;
    }

    if (ev.type === "TEAMS_CONFIRMED") {
      const t0 = tName(input.teamIds[0]);
      const t1 = tName(input.teamIds[1]);
      const text = `Teams confirmed: ${t0} vs ${t1}.`;
      entries.push({
        adapterVersion: COMMENTARY_ADAPTER_VERSION,
        sequence: ev.sequence,
        eventType: ev.type,
        category: "SELECTION",
        templateId: "TEAMS_CONFIRMED_1",
        templateFamily: "TEAMS_CONFIRMED",
        cooldownApplied: false,
        presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|TC`)),
        milestoneTags: [],
        short: `${t0} v ${t1}`,
        text,
        detailed:
          input.groundName
            ? `${text} Venue: ${input.groundName} (${input.format}).`
            : `${text} Format: ${input.format}.`,
        factSlots: [
          {
            slot: "homeTeam",
            value: t0,
            sourceKind: "INNINGS_PROJECTION",
            sourceRef: "match.teamIds[0]",
          },
          {
            slot: "awayTeam",
            value: t1,
            sourceKind: "INNINGS_PROJECTION",
            sourceRef: "match.teamIds[1]",
          },
        ],
      });
      continue;
    }

    // Deterministic factual fallback for any other committed event
    const fallbackText = ev.type.replaceAll("_", " ").toLowerCase();
    entries.push({
      adapterVersion: COMMENTARY_ADAPTER_VERSION,
      sequence: ev.sequence,
      eventType: ev.type,
      category: "SELECTION",
      templateId: "EVENT_GENERIC_FALLBACK",
      templateFamily: "EVENT_GENERIC",
      cooldownApplied: false,
      presentationDigest: hex8(fnv1a32(`${presentationKey}|${ev.sequence}|${evHash}|GEN`)),
      milestoneTags: [],
      short: fallbackText,
      text: fallbackText,
      detailed: fallbackText,
      factSlots: [
        {
          slot: "eventType",
          value: ev.type,
          sourceKind: "EVENT_FIELD",
          sourceRef: "event.type",
        },
      ],
    });
  }

  return {
    adapterVersion: COMMENTARY_ADAPTER_VERSION,
    format: input.format,
    presentationKeyDigest,
    repetitionCooldownWindow: cooldownWindow,
    entries,
  };
}
