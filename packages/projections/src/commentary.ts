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
import { overContext, type OverRecord } from "./commentary-context.js";

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
  batters: Map<string, BatterRunningFigures>;
  bowlers: Map<string, BowlerRunningFigures>;
}

const SECTOR_LABELS: readonly string[] = [
  "third man",
  "point",
  "cover",
  "mid-off",
  "mid-on",
  "mid-wicket",
  "square leg",
  "fine leg",
];

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

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function ballCoordinateLabel(legalBallsBefore: number): string {
  return `${Math.floor(legalBallsBefore / 6)}.${(legalBallsBefore % 6) + 1}`;
}

function bowlerFiguresText(fig: BowlerRunningFigures): string {
  return `${formatOvers(fig.legalBalls)}-${fig.maidens}-${fig.runsConceded}-${fig.wickets}`;
}

function allocatedBallsForFormat(format: Format): number | null {
  if (format === "T20") return 120;
  if (format === "ODI") return 300;
  return null;
}

function pickTemplateWithCooldown<T extends { readonly id: string }>(
  family: string,
  templates: readonly T[],
  presentationKey: string,
  sequence: number,
  eventHash: string,
  recentIds: string[],
  cooldownWindow: number,
): { selected: T; cooldownApplied: boolean; digest: string } {
  const raw = fnv1a32(`${presentationKey}|${sequence}|${eventHash}|${family}`);
  const digest = hex8(raw);
  const baseIdx = raw % templates.length;
  let chosenIdx = baseIdx;
  let cooldownApplied = false;
  if (templates.length > 1 && cooldownWindow > 0) {
    const windowSlice = recentIds.slice(-cooldownWindow);
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
  recentIds.push(selected.id);
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
  const recentTemplateIds: string[] = [];

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
      ];

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
        bowlerFig.currentOverBowlerRuns = 0;
        bowlerFig.currentOverLegalBalls = 0;
      }

      let family = "DELIVERY_DOT";
      let category: CommentaryCategory = "DELIVERY";
      let short = String(totalRuns);
      let bodyTemplates: readonly { id: string; render: () => string }[] = [];

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

        if (d.dismissal.kind === "RUN_OUT" && isNonStrikerOut) {
          family = "WICKET_RUN_OUT_NON_STRIKER";
          const throwCredit = fielderName ? ` by ${fielderName}` : "";
          const endLabel = d.dismissal.wicketEnd.toLowerCase();
          bodyTemplates = [
            {
              id: "W_RO_NS_1",
              render: () =>
                `${bowler} to ${striker}. Non-striker ${outName} is run out${throwCredit} at the ${endLabel} end for ${outBatterFig.runs} (${outBatterFig.ballsFaced})!`,
            },
            {
              id: "W_RO_NS_2",
              render: () =>
                `${bowler} to ${striker}. Mix-up in the running — non-striker ${outName} caught short${throwCredit} at the ${endLabel} end, out for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
            {
              id: "W_RO_NS_3",
              render: () =>
                `${bowler} to ${striker}. Direct trouble at the ${endLabel} end: non-striker ${outName} run out${throwCredit} for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
          ];
        } else if (d.dismissal.kind === "BOWLED") {
          family = "WICKET_BOWLED";
          bodyTemplates = [
            {
              id: "W_BWL_1",
              render: () =>
                `${bowler} bowls ${outName} for ${outBatterFig.runs} (${outBatterFig.ballsFaced})!`,
            },
            {
              id: "W_BWL_2",
              render: () =>
                `${bowler} to ${striker} — through the defence, ${outName} bowled for ${outBatterFig.runs} (${outBatterFig.ballsFaced})!`,
            },
            {
              id: "W_BWL_3",
              render: () =>
                `${bowler} hits the stumps! ${outName} departs bowled for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
          ];
        } else if (d.dismissal.kind === "LBW") {
          family = "WICKET_LBW";
          bodyTemplates = [
            {
              id: "W_LBW_1",
              render: () =>
                `${bowler} traps ${outName} lbw for ${outBatterFig.runs} (${outBatterFig.ballsFaced})!`,
            },
            {
              id: "W_LBW_2",
              render: () =>
                `${bowler} to ${striker} — pinned in front, ${outName} out lbw for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
            {
              id: "W_LBW_3",
              render: () =>
                `Up goes the finger! ${bowler} strikes as ${outName} falls lbw for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
          ];
        } else if (d.dismissal.kind === "CAUGHT") {
          family = "WICKET_CAUGHT";
          const catcher = fielderName ? `caught by ${fielderName}` : "caught";
          bodyTemplates = [
            {
              id: "W_CT_1",
              render: () =>
                `${bowler} to ${striker} — ${outName} ${catcher} for ${outBatterFig.runs} (${outBatterFig.ballsFaced})!`,
            },
            {
              id: "W_CT_2",
              render: () =>
                `Taken! ${bowler} induces the mistake and ${outName} is ${catcher} for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
            {
              id: "W_CT_3",
              render: () =>
                `Wicket for ${bowler}: ${outName} departs, ${catcher}, for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
          ];
        } else if (d.dismissal.kind === "STUMPED") {
          family = "WICKET_STUMPED";
          const keeperCredit = fielderName
            ? `stumped by ${fielderName}`
            : "stumped";
          bodyTemplates = [
            {
              id: "W_ST_1",
              render: () =>
                `${bowler} deceives ${outName} — ${keeperCredit} for ${outBatterFig.runs} (${outBatterFig.ballsFaced})!`,
            },
            {
              id: "W_ST_2",
              render: () =>
                `Sharp work behind the stumps! ${outName} is ${keeperCredit} off ${bowler} for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
            {
              id: "W_ST_3",
              render: () =>
                `${bowler} draws ${outName} out of the crease, ${keeperCredit} for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
          ];
        } else if (d.dismissal.kind === "RUN_OUT") {
          family = "WICKET_RUN_OUT_STRIKER";
          const throwCredit = fielderName ? ` (${fielderName})` : "";
          bodyTemplates = [
            {
              id: "W_RO_S_1",
              render: () =>
                `${bowler} to ${striker} — ${outName} run out${throwCredit} for ${outBatterFig.runs} (${outBatterFig.ballsFaced})!`,
            },
            {
              id: "W_RO_S_2",
              render: () =>
                `Quick throw${throwCredit}! ${outName} is run out for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
            {
              id: "W_RO_S_3",
              render: () =>
                `Short of the ground! ${outName} departs run out${throwCredit} for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
          ];
        } else {
          family = "WICKET_HIT_WICKET";
          bodyTemplates = [
            {
              id: "W_HW_1",
              render: () =>
                `${bowler} to ${striker} — ${outName} is out hit wicket for ${outBatterFig.runs} (${outBatterFig.ballsFaced})!`,
            },
            {
              id: "W_HW_2",
              render: () =>
                `Unfortunate dismissal: ${outName} disturbs the stumps, out hit wicket off ${bowler} for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
            {
              id: "W_HW_3",
              render: () =>
                `${outName} falls hit wicket to ${bowler} for ${outBatterFig.runs} (${outBatterFig.ballsFaced}).`,
            },
          ];
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
        bodyTemplates = [
          {
            id: "DLV_WD_1",
            render: () =>
              `${bowler} strays wide to ${striker}; ${totalRuns} wide${totalRuns === 1 ? "" : "s"} added, ball to be re-bowled.`,
          },
          {
            id: "DLV_WD_2",
            render: () =>
              `${bowler} misses the radar against ${striker} — called wide (${totalRuns} extra${totalRuns === 1 ? "" : "s"}).`,
          },
          {
            id: "DLV_WD_3",
            render: () =>
              `Wide signalled off ${bowler} to ${striker}: ${totalRuns} run${totalRuns === 1 ? "" : "s"} to the total.`,
          },
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
        const fhSuffix = freeHitEligible ? " Free Hit coming up next." : "";
        const batNote =
          d.batRuns > 0
            ? ` plus ${d.batRuns} off the bat`
            : extrasTotal > d.extras.noBalls
              ? ` plus ${extrasTotal - d.extras.noBalls} extra${extrasTotal - d.extras.noBalls === 1 ? "" : "s"}`
              : "";
        bodyTemplates = [
          {
            id: "DLV_NB_1",
            render: () =>
              `No-ball called on ${bowler} to ${striker} (${totalRuns} run${totalRuns === 1 ? "" : "s"}${batNote}).${fhSuffix}`,
          },
          {
            id: "DLV_NB_2",
            render: () =>
              `${bowler} oversteps against ${striker}: no-ball costs ${totalRuns} run${totalRuns === 1 ? "" : "s"}${batNote}.${fhSuffix}`,
          },
          {
            id: "DLV_NB_3",
            render: () =>
              `Front-foot no-ball from ${bowler} to ${striker}, ${totalRuns} added${batNote}.${fhSuffix}`,
          },
        ];
      } else if (d.boundary === "SIX") {
        family = "DELIVERY_SIX";
        short = "6";
        const where = sectorPhrase ? ` over ${sectorPhrase}` : "";
        bodyTemplates = [
          {
            id: "DLV_SIX_1",
            render: () =>
              `${bowler} to ${striker} — launched${where} for SIX!`,
          },
          {
            id: "DLV_SIX_2",
            render: () =>
              `SIX! ${striker} clears the rope${where} off ${bowler}.`,
          },
          {
            id: "DLV_SIX_3",
            render: () =>
              `${striker} gets hold of ${bowler} and sends it sailing${where} for 6.`,
          },
          {
            id: "DLV_SIX_4",
            render: () =>
              `Maximum! Clean strike by ${striker}${where} off ${bowler} for six runs.`,
          },
        ];
      } else if (d.boundary === "FOUR") {
        family = "DELIVERY_FOUR";
        short = "4";
        const where = sectorPhrase ? ` through ${sectorPhrase}` : "";
        bodyTemplates = [
          {
            id: "DLV_FOUR_1",
            render: () =>
              `${bowler} to ${striker} — crisp stroke${where} for FOUR!`,
          },
          {
            id: "DLV_FOUR_2",
            render: () =>
              `FOUR! ${striker} pierces the gap${where} off ${bowler}.`,
          },
          {
            id: "DLV_FOUR_3",
            render: () =>
              `${striker} leans on ${bowler} and races it away${where} to the boundary for 4.`,
          },
          {
            id: "DLV_FOUR_4",
            render: () =>
              `Boundary for ${striker}! Timed neatly${where} off ${bowler}.`,
          },
        ];
      } else if (totalRuns === 0) {
        family = "DELIVERY_DOT";
        short = "0";
        const stopNote =
          d.fieldOutcome === "STOP"
            ? sectorPhrase
              ? `, tidy stop at ${sectorPhrase}`
              : ", tidy stop in the ring"
            : "";
        bodyTemplates = [
          {
            id: "DLV_DOT_1",
            render: () =>
              `${bowler} to ${striker}, defended solidly — no run${stopNote}.`,
          },
          {
            id: "DLV_DOT_2",
            render: () =>
              `Dot ball from ${bowler}; ${striker} watchful at the crease${stopNote}.`,
          },
          {
            id: "DLV_DOT_3",
            render: () =>
              `${bowler} hits the spot to ${striker}, no scoring opportunity${stopNote}.`,
          },
          {
            id: "DLV_DOT_4",
            render: () =>
              `${striker} plays ${bowler} back safely — dot ball${stopNote}.`,
          },
        ];
      } else if (d.batRuns === 0 && (d.extras.byes > 0 || d.extras.legByes > 0)) {
        family = "DELIVERY_BYES_LEGBYES";
        const kindLabel = d.extras.legByes > 0 ? "lb" : "b";
        const kindWord = d.extras.legByes > 0 ? "leg-bye" : "bye";
        short = `${totalRuns}${kindLabel}`;
        bodyTemplates = [
          {
            id: "DLV_BLB_1",
            render: () =>
              `${bowler} to ${striker}: ${totalRuns} ${kindWord}${totalRuns === 1 ? "" : "s"} scampered through.`,
          },
          {
            id: "DLV_BLB_2",
            render: () =>
              `Past the bat off ${bowler}; ${striker} and ${nonStriker} cross for ${totalRuns} ${kindWord}${totalRuns === 1 ? "" : "s"}.`,
          },
          {
            id: "DLV_BLB_3",
            render: () =>
              `${totalRuns} ${kindWord}${totalRuns === 1 ? "" : "s"} signalled as ${bowler} goes past ${striker}.`,
          },
        ];
      } else if (totalRuns === 1) {
        family = "DELIVERY_SINGLE";
        short = "1";
        const where = sectorPhrase ? ` toward ${sectorPhrase}` : "";
        bodyTemplates = [
          {
            id: "DLV_ONE_1",
            render: () =>
              `${bowler} to ${striker}, worked${where} for a single.`,
          },
          {
            id: "DLV_ONE_2",
            render: () =>
              `${striker} nudges ${bowler}${where} to rotate the strike — 1 run.`,
          },
          {
            id: "DLV_ONE_3",
            render: () =>
              `Quick single taken by ${striker}${where} off ${bowler}.`,
          },
          {
            id: "DLV_ONE_4",
            render: () =>
              `${striker} taps ${bowler}${where} and crosses cleanly for 1.`,
          },
        ];
      } else {
        family = "DELIVERY_MULTI_RUN";
        short = String(totalRuns);
        const where = sectorPhrase ? ` into ${sectorPhrase}` : "";
        bodyTemplates = [
          {
            id: "DLV_MULTI_1",
            render: () =>
              `${bowler} to ${striker}, placed${where} and they come back for ${totalRuns} runs.`,
          },
          {
            id: "DLV_MULTI_2",
            render: () =>
              `Good running between ${striker} and ${nonStriker}${where} off ${bowler} — ${totalRuns} runs.`,
          },
          {
            id: "DLV_MULTI_3",
            render: () =>
              `${striker} works ${bowler}${where} in the gap for ${totalRuns} runs.`,
          },
        ];
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

      const dropNotice =
        !d.dismissal && d.fieldOutcome === "DROP"
          ? " Dropped chance in the field!"
          : !d.dismissal && d.fieldOutcome === "MISS"
            ? " Misfield concedes extra ground."
            : "";
      const milestoneSuffix =
        milestoneNotes.length > 0 ? ` ${milestoneNotes.join(" ")}` : "";

      // Keep `Innings X, ...` prefix strictly on DELIVERY_RECORDED for match-ui invariant compatibility
      const standardText = `Innings ${d.inningsIndex + 1}, ${coord}: ${picked.selected.render()}${dropNotice}${milestoneSuffix}`;

      const techParts: string[] = [];
      if (wasFreeHit) techParts.push("free-hit delivery");
      if (lengthPhrase) techParts.push(`${lengthPhrase} length`);
      if (trajectoryPhrase) techParts.push(trajectoryPhrase);
      if (sectorPhrase) techParts.push(`sector: ${sectorPhrase}`);
      const techClause = techParts.length > 0 ? ` [${techParts.join(", ")}]` : "";

      const standClause = d.dismissal
        ? `Stand ended on ${standBeforeWicket.runs} (${standBeforeWicket.balls}b)`
        : `Stand ${inn.partnershipRuns} (${inn.partnershipBalls}b)`;
      const chaseClause =
        inn.targetToWin !== null && inn.runs < inn.targetToWin
          ? inn.allocatedBalls !== null
            ? ` · Need ${inn.targetToWin - inn.runs} off ${Math.max(0, inn.allocatedBalls - inn.legalBalls)}b`
            : ` · Need ${inn.targetToWin - inn.runs} more to win`
          : "";

      const detailedText = `${standardText}${techClause} — Score ${inn.runs}/${inn.wickets}; ${striker} ${batterFig.runs} (${batterFig.ballsFaced}), ${bowler} ${bowlerFiguresText(bowlerFig)}, ${standClause}${chaseClause}.`;

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
      bowlerFig.currentOverBowlerRuns = 0;
      bowlerFig.currentOverLegalBalls = 0;

      const milestoneTags: CommentaryMilestoneTag[] = isMaiden
        ? ["MAIDEN_OVER"]
        : [];
      const teamName = tName(inn.battingTeamId);
      const figs = bowlerFiguresText(bowlerFig);
      const chaseTail =
        inn.targetToWin !== null && inn.runs < inn.targetToWin
          ? inn.allocatedBalls !== null
            ? ` (${inn.targetToWin - inn.runs} needed from ${Math.max(0, inn.allocatedBalls - inn.legalBalls)} balls)`
            : ` (${inn.targetToWin - inn.runs} needed to win)`
          : "";

      const family = isMaiden ? "OVER_MAIDEN" : "OVER_SUMMARY";
      const templates = isMaiden
        ? [
            {
              id: "OV_MDN_1",
              render: () =>
                `End of over ${overNum} (maiden from ${bowler}): ${teamName} ${inn.runs}/${inn.wickets}${chaseTail}.`,
            },
            {
              id: "OV_MDN_2",
              render: () =>
                `Maiden over! ${bowler} closes over ${overNum} without conceding off the bat or bowling extras — ${teamName} ${inn.runs}/${inn.wickets}${chaseTail}.`,
            },
            {
              id: "OV_MDN_3",
              render: () =>
                `Over ${overNum} complete, a probing maiden by ${bowler}. ${teamName} stand at ${inn.runs}/${inn.wickets}${chaseTail}.`,
            },
          ]
        : [
            {
              id: "OV_SUM_1",
              render: () =>
                `End of over ${overNum} (${overRuns} run${overRuns === 1 ? "" : "s"}${overWkts > 0 ? `, ${overWkts} wkt${overWkts === 1 ? "" : "s"}` : ""}): ${teamName} ${inn.runs}/${inn.wickets}${chaseTail}.`,
            },
            {
              id: "OV_SUM_2",
              render: () =>
                `Over ${overNum} complete — ${overRuns} off it${overWkts > 0 ? ` and ${overWkts} wicket${overWkts === 1 ? "" : "s"}` : ""}. ${teamName} are ${inn.runs}/${inn.wickets}${chaseTail}.`,
            },
            {
              id: "OV_SUM_3",
              render: () =>
                `After ${overNum} over${overNum === 1 ? "" : "s"}, ${teamName} move to ${inn.runs}/${inn.wickets} (${overRuns} from ${bowler}'s over)${chaseTail}.`,
            },
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
        format: input.format, overs: inn.overHistory, runs: inn.runs, legalBalls: inn.legalBalls, targetToWin: inn.targetToWin,
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
              `Opening innings ${p.inningsIndex + 1} — ${teamName} take the crease${targetClause}.`,
          },
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
      const standardText = allOut
        ? `End of innings ${p.inningsIndex + 1}: ${teamName} all out for ${inn.runs} in ${oversStr} overs.`
        : `End of innings ${p.inningsIndex + 1}: ${teamName} close on ${inn.runs}/${inn.wickets} (${oversStr} overs).`;
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
      const picked = pickTemplateWithCooldown(
        "BATTER_SELECTED",
        [
          { id: "BAT_SEL_1", render: () => `${batter} comes in to bat.` },
          { id: "BAT_SEL_2", render: () => `${batter} walks to the crease.` },
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
      const figs = bowlerFiguresText(getBowler(inn, playerId));
      const picked = pickTemplateWithCooldown(
        "BOWLER_SELECTED",
        [
          { id: "BWL_SEL_1", render: () => `${bowler} will bowl.` },
          { id: "BWL_SEL_2", render: () => `${bowler} comes into the attack.` },
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
      const text = `Batting plan updated for ${batter}: aggression ${p.aggression}, ${p.intent.toLowerCase()} intent.`;
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
      const text = `Bowling plan for ${bowler}: ${p.line.toLowerCase()} line, ${p.length.toLowerCase().replaceAll("_", " ")} length (${p.effort.toLowerCase()} effort).`;
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
          ? `${text} Key ring/slip posts include ${slotSummary}.`
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
