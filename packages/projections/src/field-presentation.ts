import {
  DeliveryHighlightCueSchema,
  FIELD_PRESENTATION_VERSION,
  FieldPlacementLegalityReportSchema,
  LiveFieldPresentationSchema,
  type DeliveryHighlightCue,
  type DeliveryRecorded,
  type FieldLegalityViolation,
  type FieldPlacementLegalityReport,
  type FieldPointX10,
  type FieldPositionView,
  type FieldSlot,
  type Format,
  type Hand,
  type HighlightMomentKind,
  type HighlightPacingMode,
  type InningsLedger,
  type LiveFieldPresentation,
} from "@lcxxvi/contracts";

export const FIELD_TRACKING_DISCLAIMER =
  "Illustrative highlight from committed event categories — no measured ball speed, distance, or tracking coordinates." as const;

type CanonicalFieldSlotMeta = {
  readonly slotId: string;
  readonly label: string;
  readonly sector: number;
  readonly depth: "INNER" | "MIDDLE" | "DEEP";
  readonly insideCircle: boolean;
  readonly legSideRhb: boolean;
  readonly behindSquare: boolean;
  readonly rhbPoint: FieldPointX10;
  readonly odiOnly?: boolean;
};

/**
 * Canonical RHB geometry in tenths of a 200x200 SVG viewport (center 1000,1000;
 * circle radius 480; boundary radius 840; bowler at 1000,740; striker at 1000,1180).
 * LHB reflects horizontally around x10 = 1000 (x10_L = 2000 - x10_R).
 */
const CANONICAL_POSITIONS: readonly CanonicalFieldSlotMeta[] = [
  {
    slotId: "slip-1",
    label: "First slip",
    sector: 7,
    depth: "INNER",
    insideCircle: true,
    legSideRhb: false,
    behindSquare: true,
    rhbPoint: { x10: 1135, y10: 1315 },
  },
  {
    slotId: "slip-2",
    label: "Second slip",
    sector: 7,
    depth: "INNER",
    insideCircle: true,
    legSideRhb: false,
    behindSquare: true,
    rhbPoint: { x10: 1225, y10: 1275 },
  },
  {
    slotId: "point",
    label: "Point",
    sector: 6,
    depth: "MIDDLE",
    insideCircle: true,
    legSideRhb: false,
    behindSquare: false,
    rhbPoint: { x10: 1380, y10: 1080 },
  },
  {
    slotId: "cover",
    label: "Cover",
    sector: 5,
    depth: "MIDDLE",
    insideCircle: true,
    legSideRhb: false,
    behindSquare: false,
    rhbPoint: { x10: 1320, y10: 820 },
  },
  {
    slotId: "mid-off",
    label: "Mid-off",
    sector: 4,
    depth: "MIDDLE",
    insideCircle: true,
    legSideRhb: false,
    behindSquare: false,
    rhbPoint: { x10: 1145, y10: 650 },
  },
  {
    slotId: "mid-on",
    label: "Mid-on",
    sector: 4,
    depth: "MIDDLE",
    insideCircle: true,
    legSideRhb: true,
    behindSquare: false,
    rhbPoint: { x10: 855, y10: 650 },
  },
  {
    slotId: "midwicket",
    label: "Midwicket",
    sector: 3,
    depth: "MIDDLE",
    insideCircle: true,
    legSideRhb: true,
    behindSquare: false,
    rhbPoint: { x10: 680, y10: 820 },
  },
  {
    slotId: "deep-square-leg",
    label: "Deep square leg",
    sector: 2,
    depth: "DEEP",
    insideCircle: false,
    legSideRhb: true,
    behindSquare: false,
    rhbPoint: { x10: 245, y10: 1050 },
  },
  {
    slotId: "fine-leg",
    label: "Fine leg",
    sector: 1,
    depth: "DEEP",
    insideCircle: false,
    legSideRhb: true,
    behindSquare: true,
    rhbPoint: { x10: 460, y10: 1530 },
  },
  {
    slotId: "deep-cover",
    label: "Deep cover",
    sector: 5,
    depth: "DEEP",
    insideCircle: false,
    legSideRhb: false,
    behindSquare: false,
    rhbPoint: { x10: 1560, y10: 480 },
  },
  {
    slotId: "long-on",
    label: "Long-on",
    sector: 4,
    depth: "DEEP",
    insideCircle: false,
    legSideRhb: true,
    behindSquare: false,
    rhbPoint: { x10: 790, y10: 240 },
  },
  {
    slotId: "long-off",
    label: "Long-off",
    sector: 4,
    depth: "DEEP",
    insideCircle: false,
    legSideRhb: false,
    behindSquare: false,
    rhbPoint: { x10: 1210, y10: 240 },
    odiOnly: true,
  },
];

const POSITION_BY_ID = new Map(
  CANONICAL_POSITIONS.map((position) => [position.slotId, position]),
);

const BOWLER_RELEASE_POINT: FieldPointX10 = { x10: 1000, y10: 740 };
const STRIKER_CREASE_POINT: FieldPointX10 = { x10: 1000, y10: 1180 };
const KEEPER_POINT: FieldPointX10 = { x10: 1000, y10: 1340 };

export function reflectSectorForHand(sector: number, hand: Hand): number {
  if (!Number.isInteger(sector) || sector < 0 || sector > 7) {
    throw new Error("INVALID_PRESENTATION_SECTOR");
  }
  return hand === "L" ? 7 - sector : sector;
}

export function reflectPointForHand(
  rhbPoint: FieldPointX10,
  hand: Hand,
): FieldPointX10 {
  return {
    x10: hand === "L" ? 2000 - rhbPoint.x10 : rhbPoint.x10,
    y10: rhbPoint.y10,
  };
}

export function positionsForFormat(format: Format): readonly CanonicalFieldSlotMeta[] {
  return format === "ODI"
    ? CANONICAL_POSITIONS
    : CANONICAL_POSITIONS.filter((pos) => !pos.odiOnly);
}

function maxOutsideCircleForState(format: Format, legalBalls: number): {
  maxOutsideCircle: number;
  phaseLabel: string;
} {
  if (format === "T20") {
    return legalBalls < 36
      ? {
          maxOutsideCircle: 2,
          phaseLabel: "T20 Powerplay (overs 1–6): max 2 outside circle",
        }
      : {
          maxOutsideCircle: 5,
          phaseLabel: "T20 Overs 7–20: max 5 outside circle",
        };
  }
  if (format === "ODI") {
    if (legalBalls < 60) {
      return {
        maxOutsideCircle: 2,
        phaseLabel: "ODI Powerplay 1 (overs 1–10): max 2 outside circle",
      };
    }
    if (legalBalls < 240) {
      return {
        maxOutsideCircle: 4,
        phaseLabel: "ODI Powerplay 2 (overs 11–40): max 4 outside circle",
      };
    }
    return {
      maxOutsideCircle: 5,
      phaseLabel: "ODI Powerplay 3 (overs 41–50): max 5 outside circle",
    };
  }
  return {
    maxOutsideCircle: 9,
    phaseLabel:
      "Five-day red-ball: outer circle unrestricted, max 5 leg side, max 2 behind square leg",
  };
}

export function evaluateFieldPlacementLegality(input: {
  format: Format;
  strikerHand: Hand;
  legalBalls: number;
  fieldSlots: readonly FieldSlot[];
  outfieldIds: readonly string[];
}): FieldPlacementLegalityReport {
  const { format, strikerHand, legalBalls, fieldSlots, outfieldIds } = input;
  const { maxOutsideCircle, phaseLabel } = maxOutsideCircleForState(
    format,
    legalBalls,
  );
  const allowed = new Set(positionsForFormat(format).map((p) => p.slotId));
  const violations: FieldLegalityViolation[] = [];

  if (fieldSlots.length !== 9) {
    violations.push({
      code: "SLOT_COUNT",
      message: `Exactly 9 outfielders must be placed (currently ${fieldSlots.length}).`,
      affectedSlotIds: [],
    });
  }

  if (outfieldIds.length === 9) {
    const sortedActual = [...fieldSlots.map((s) => s.playerId)].sort().join("|");
    const sortedExpected = [...outfieldIds].sort().join("|");
    if (sortedActual !== sortedExpected) {
      violations.push({
        code: "UNIQUE_PLAYERS",
        message: "Every active outfielder must be assigned to exactly one field position.",
        affectedSlotIds: [],
      });
    }
  } else if (new Set(fieldSlots.map((s) => s.playerId)).size !== fieldSlots.length) {
    violations.push({
      code: "UNIQUE_PLAYERS",
      message: "Each outfielder may occupy only one position.",
      affectedSlotIds: [],
    });
  }

  const slotCounts = new Map<string, number>();
  for (const slot of fieldSlots) {
    slotCounts.set(slot.slotId, (slotCounts.get(slot.slotId) ?? 0) + 1);
  }
  const duplicateSlotIds = [...slotCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([slotId]) => slotId);
  if (duplicateSlotIds.length > 0) {
    const labels = duplicateSlotIds.map(
      (id) => POSITION_BY_ID.get(id)?.label ?? id,
    );
    violations.push({
      code: "DUPLICATE_POSITION",
      message: `Duplicate field position${duplicateSlotIds.length > 1 ? "s" : ""}: ${labels.join(", ")}.`,
      affectedSlotIds: duplicateSlotIds.slice(0, 9),
    });
  }

  const unsupportedSlotIds = [
    ...new Set(fieldSlots.map((s) => s.slotId).filter((id) => !allowed.has(id))),
  ];
  if (unsupportedSlotIds.length > 0) {
    violations.push({
      code: "UNSUPPORTED_POSITION",
      message: `Unsupported position for ${format}: ${unsupportedSlotIds.join(", ")}.`,
      affectedSlotIds: unsupportedSlotIds.slice(0, 9),
    });
  }

  let outsideCircleCount = 0;
  let legSideCount = 0;
  let behindSquareLegCount = 0;
  const outsideSlots: string[] = [];
  const legSlots: string[] = [];
  const behindSquareLegSlots: string[] = [];

  for (const slot of fieldSlots) {
    const meta = POSITION_BY_ID.get(slot.slotId);
    if (!meta) continue;
    if (!meta.insideCircle) {
      outsideCircleCount += 1;
      outsideSlots.push(slot.slotId);
    }
    const isLegForStriker =
      strikerHand === "R" ? meta.legSideRhb : !meta.legSideRhb;
    if (isLegForStriker) {
      legSideCount += 1;
      legSlots.push(slot.slotId);
      if (meta.behindSquare) {
        behindSquareLegCount += 1;
        behindSquareLegSlots.push(slot.slotId);
      }
    }
  }

  if (outsideCircleCount > maxOutsideCircle) {
    violations.push({
      code: "CIRCLE_RESTRICTION",
      message: `Too many fielders outside the 30-yard circle (${outsideCircleCount}/${maxOutsideCircle} allowed in this phase).`,
      affectedSlotIds: [...new Set(outsideSlots)].slice(0, 9),
    });
  }
  if (legSideCount > 5) {
    violations.push({
      code: "LEG_SIDE_LIMIT",
      message: `Too many leg-side fielders for ${strikerHand === "L" ? "left-hand" : "right-hand"} striker (${legSideCount}/5 maximum).`,
      affectedSlotIds: [...new Set(legSlots)].slice(0, 9),
    });
  }
  if (behindSquareLegCount > 2) {
    violations.push({
      code: "BEHIND_SQUARE_LEG_LIMIT",
      message: `Too many fielders behind square on the leg side (${behindSquareLegCount}/2 maximum).`,
      affectedSlotIds: [...new Set(behindSquareLegSlots)].slice(0, 9),
    });
  }

  const isLegal = violations.length === 0;
  const summaryText = isLegal
    ? `Legal field (${strikerHand}HB): ${outsideCircleCount}/${maxOutsideCircle} outside circle · ${legSideCount}/5 leg side · ${behindSquareLegCount}/2 behind square leg.`
    : violations.map((v) => v.message).join(" ");

  return FieldPlacementLegalityReportSchema.parse({
    isLegal,
    format,
    strikerHand,
    phaseLabel,
    outsideCircleCount,
    maxOutsideCircle,
    legSideCount,
    maxLegSide: 5,
    behindSquareLegCount,
    maxBehindSquareLeg: 2,
    duplicateSlotIds,
    violations,
    summaryText: summaryText.slice(0, 320),
  });
}

/**
 * Presentation-only deterministic variation derived strictly from the committed
 * eventHash and sequence. Never calls or advances simulation RNG.
 */
function presentationVariationByte(eventHash: string, sequence: number): number {
  const hexSlice = eventHash.slice(0, 8);
  const parsed = Number.parseInt(hexSlice, 16);
  const mixed = ((Number.isFinite(parsed) ? parsed : 0) ^ Math.imul(sequence, 2654435761)) >>> 0;
  return mixed & 0xff;
}

function pitchBouncePointForLength(
  executedLength: DeliveryRecorded["executedLength"],
  variationByte: number,
): FieldPointX10 {
  const lateralOffset = ((variationByte % 5) - 2) * 5;
  const y10 =
    executedLength === "YORKER"
      ? 1155
      : executedLength === "FULL_TOSS"
        ? 1170
        : executedLength === "FULL"
          ? 1095
          : executedLength === "SHORT"
            ? 925
            : 1020;
  return {
    x10: 1000 + lateralOffset,
    y10,
  };
}

function sectorTargetPointX10(input: {
  displaySector: number;
  boundary: DeliveryRecorded["boundary"];
  fieldOutcome: DeliveryRecorded["fieldOutcome"];
  runsScored: number;
  variationByte: number;
}): FieldPointX10 {
  const { displaySector, boundary, fieldOutcome, runsScored, variationByte } =
    input;
  const jitterSteps = ((variationByte >> 3) % 7) - 3;
  const jitterRad = jitterSteps * 0.045;
  const baseAngle = (displaySector - 3.5) * (Math.PI / 4) + jitterRad;

  const radiusX10 =
    boundary === "SIX"
      ? 895
      : boundary === "FOUR"
        ? 840
        : fieldOutcome === "CATCH"
          ? 530 + (variationByte % 150)
          : fieldOutcome === "STOP" || runsScored === 0
            ? 370 + (variationByte % 70)
            : runsScored === 1
              ? 520 + (variationByte % 80)
              : 670 + (variationByte % 90);

  const rawX = Math.round(1000 + Math.sin(baseAngle) * radiusX10);
  const rawY = Math.round(1000 - Math.cos(baseAngle) * radiusX10);
  return {
    x10: Math.max(40, Math.min(1960, rawX)),
    y10: Math.max(40, Math.min(1960, rawY)),
  };
}

function classifyMoment(d: DeliveryRecorded): {
  momentKind: HighlightMomentKind;
  isKeyMoment: boolean;
} {
  if (d.dismissal) return { momentKind: "WICKET", isKeyMoment: true };
  if (d.boundary === "SIX") return { momentKind: "SIX", isKeyMoment: true };
  if (d.boundary === "FOUR") return { momentKind: "FOUR", isKeyMoment: true };
  if (d.freeHitNext) return { momentKind: "FREE_HIT", isKeyMoment: true };
  const extrasTotal =
    d.extras.wides +
    d.extras.noBalls +
    d.extras.byes +
    d.extras.legByes +
    d.extras.penalties;
  if (d.legality !== "LEGAL" || extrasTotal > 0) {
    return { momentKind: "EXTRA", isKeyMoment: false };
  }
  if (d.batRuns + d.completedRuns > 0) {
    return { momentKind: "RUNS", isKeyMoment: false };
  }
  return { momentKind: "DOT", isKeyMoment: false };
}

export type CommittedEventEnvelopeLike = {
  readonly sequence: number;
  readonly type: string;
  readonly payload: unknown;
  readonly eventHash: string;
};

export function buildDeliveryHighlightCues(input: {
  events: readonly CommittedEventEnvelopeLike[];
  names: Readonly<Record<string, string>>;
  hands: Readonly<Record<string, Hand>>;
  maxRecent?: number;
}): DeliveryHighlightCue[] {
  const { events, names, hands } = input;
  const legalBallsByInnings = new Map<number, number>();
  const cues: DeliveryHighlightCue[] = [];

  for (const env of events) {
    if (env.type !== "DELIVERY_RECORDED") continue;
    const payload = env.payload as { event?: DeliveryRecorded } | null;
    const d = payload?.event;
    if (!d || d.type !== "DELIVERY_RECORDED") continue;

    const prevLegal = legalBallsByInnings.get(d.inningsIndex) ?? 0;
    const nextLegal = d.legalBall ? prevLegal + 1 : prevLegal;
    legalBallsByInnings.set(d.inningsIndex, nextLegal);

    const overNumber = Math.floor((d.legalBall ? nextLegal - 1 : prevLegal) / 6);
    const ballInOver = d.legalBall
      ? ((nextLegal - 1) % 6) + 1
      : (prevLegal % 6) + 1;
    const overBallLabel =
      d.legality === "WIDE"
        ? `${overNumber}.${ballInOver}wd`
        : d.legality === "NO_BALL"
          ? `${overNumber}.${ballInOver}nb`
          : `${overNumber}.${ballInOver}`;

    const strikerHand: Hand = hands[d.strikerId] ?? "R";
    const strikerName = names[d.strikerId] ?? d.strikerId;
    const bowlerName = names[d.bowlerId] ?? d.bowlerId;
    const dismissedPlayerName = d.dismissal
      ? (names[d.dismissal.playerId] ?? d.dismissal.playerId)
      : null;

    const extrasTotal =
      d.extras.wides +
      d.extras.noBalls +
      d.extras.byes +
      d.extras.legByes +
      d.extras.penalties;
    const runsScored = d.batRuns + extrasTotal;
    const { momentKind, isKeyMoment } = classifyMoment(d);
    const variationByte = presentationVariationByte(env.eventHash, env.sequence);
    const pitchBouncePoint = pitchBouncePointForLength(
      d.executedLength,
      variationByte,
    );

    const hasSector =
      typeof d.shotSector === "number" &&
      Number.isInteger(d.shotSector) &&
      d.shotSector >= 0 &&
      d.shotSector <= 7;
    const recordedSector = hasSector ? d.shotSector : null;
    const displaySector =
      recordedSector !== null
        ? reflectSectorForHand(recordedSector, strikerHand)
        : null;
    const sectorStatus =
      displaySector !== null ? "RECORDED_SECTOR" : "PITCH_CHANNEL_ONLY";

    const targetPoint: FieldPointX10 =
      displaySector !== null
        ? sectorTargetPointX10({
            displaySector,
            boundary: d.boundary,
            fieldOutcome: d.fieldOutcome,
            runsScored,
            variationByte,
          })
        : d.dismissal &&
            ["BOWLED", "LBW", "HIT_WICKET"].includes(d.dismissal.kind)
          ? { x10: 1000, y10: 1190 }
          : { x10: 1000, y10: 1330 };

    const headline = d.dismissal
      ? `WICKET · ${dismissedPlayerName} (${d.dismissal.kind.toLowerCase().replaceAll("_", " ")})`
      : d.boundary === "SIX"
        ? `SIX · ${strikerName} off ${bowlerName}`
        : d.boundary === "FOUR"
          ? `FOUR · ${strikerName} off ${bowlerName}`
          : d.freeHitNext
            ? `NO-BALL (Free hit next) · ${runsScored} run${runsScored === 1 ? "" : "s"}`
            : `${overBallLabel} · ${bowlerName} to ${strikerName}: ${runsScored} run${runsScored === 1 ? "" : "s"}`;

    const sectorNote =
      recordedSector !== null
        ? `Recorded sector ${recordedSector + 1} (${strikerHand}HB display sector ${(displaySector ?? recordedSector) + 1})`
        : "No shot sector recorded (pitch/keeper channel only)";
    const lengthNote = d.executedLength
      ? `${d.executedLength.toLowerCase().replaceAll("_", " ")} length`
      : "unrecorded length";
    const trajectoryNote = d.trajectory
      ? `, ${d.trajectory.toLowerCase()} trajectory`
      : "";
    const detailText = `${overBallLabel}: ${lengthNote}${trajectoryNote}. ${sectorNote}.`;

    cues.push(
      DeliveryHighlightCueSchema.parse({
        sequence: env.sequence,
        eventHash: env.eventHash,
        inningsIndex: d.inningsIndex,
        deliveryIndex: d.deliveryIndex,
        overBallLabel,
        strikerId: d.strikerId,
        strikerName,
        strikerHand,
        bowlerId: d.bowlerId,
        bowlerName,
        momentKind,
        isKeyMoment,
        runsScored,
        batRuns: d.batRuns,
        boundary: d.boundary,
        legality: d.legality,
        dismissalKind: d.dismissal ? d.dismissal.kind : null,
        dismissedPlayerName,
        fieldOutcome: d.fieldOutcome,
        executedLength: d.executedLength,
        trajectory: d.trajectory,
        recordedSector,
        displaySector,
        sectorStatus,
        releasePoint: BOWLER_RELEASE_POINT,
        pitchBouncePoint,
        strikerCreasePoint: STRIKER_CREASE_POINT,
        targetPoint,
        headline: headline.slice(0, 160),
        detailText: detailText.slice(0, 280),
        trackingDisclaimer: FIELD_TRACKING_DISCLAIMER,
      }),
    );
  }

  if (typeof input.maxRecent === "number" && input.maxRecent > 0) {
    return cues.slice(-input.maxRecent);
  }
  return cues;
}

/**
 * Selects which committed delivery cues from [fromSequence..toSequence] should
 * animate in the presentation layer for the user's chosen HighlightPacingMode.
 */
export function selectHighlightReelForMode(input: {
  cues: readonly DeliveryHighlightCue[];
  fromSequence: number;
  toSequence: number;
  mode: HighlightPacingMode;
}): DeliveryHighlightCue[] {
  const { cues, fromSequence, toSequence, mode } = input;
  if (mode === "FAST" || toSequence < fromSequence) return [];
  const windowCues = cues.filter(
    (cue) => cue.sequence >= fromSequence && cue.sequence <= toSequence,
  );
  if (mode === "EVERY_BALL") return windowCues;
  return windowCues.filter((cue) => cue.isKeyMoment);
}

export function projectLiveFieldPresentation(input: {
  format: Format;
  phase: string;
  innings: readonly InningsLedger[];
  activeIndex: number;
  fieldSlots: readonly FieldSlot[];
  events: readonly CommittedEventEnvelopeLike[];
  names: Readonly<Record<string, string>>;
  hands: Readonly<Record<string, Hand>>;
}): LiveFieldPresentation {
  const { format, phase, innings, activeIndex, fieldSlots, events, names, hands } =
    input;
  const activeLedger = innings[activeIndex] ?? innings[innings.length - 1] ?? null;
  const activeInnings = activeLedger?.innings ?? null;

  const strikerId =
    activeInnings === null
      ? null
      : activeInnings.strikerEnd === "NORTH"
        ? activeInnings.northBatterId
        : activeInnings.southBatterId;
  const nonStrikerId =
    activeInnings === null
      ? null
      : activeInnings.strikerEnd === "NORTH"
        ? activeInnings.southBatterId
        : activeInnings.northBatterId;
  const bowlerId = activeInnings?.bowlerId ?? null;
  const keeperId = activeLedger?.keeperId ?? null;
  const strikerHand: Hand = (strikerId && hands[strikerId]) || "R";

  const occupantBySlot = new Map(
    fieldSlots.map((slot) => [slot.slotId, slot.playerId]),
  );

  const positions: FieldPositionView[] = positionsForFormat(format).map((meta) => {
    const occupiedByPlayerId = occupantBySlot.get(meta.slotId) ?? null;
    return {
      slotId: meta.slotId,
      label: meta.label,
      sector: meta.sector,
      displaySector: reflectSectorForHand(meta.sector, strikerHand),
      depth: meta.depth,
      insideCircle: meta.insideCircle,
      legSideForStriker:
        strikerHand === "R" ? meta.legSideRhb : !meta.legSideRhb,
      behindSquare: meta.behindSquare,
      point: reflectPointForHand(meta.rhbPoint, strikerHand),
      occupiedByPlayerId,
      occupiedByName: occupiedByPlayerId
        ? (names[occupiedByPlayerId] ?? occupiedByPlayerId)
        : null,
    };
  });

  const legality = evaluateFieldPlacementLegality({
    format,
    strikerHand,
    legalBalls: activeInnings?.legalBalls ?? 0,
    fieldSlots,
    outfieldIds: activeLedger?.outfieldIds ?? fieldSlots.map((s) => s.playerId),
  });

  const recentHighlights = buildDeliveryHighlightCues({
    events,
    names,
    hands,
    maxRecent: 24,
  });
  const latestHighlight =
    recentHighlights.length > 0
      ? recentHighlights[recentHighlights.length - 1]!
      : null;

  const orientationNote =
    strikerHand === "L"
      ? "Left-hand batter on strike: off side is on the left, leg side is on the right."
      : "Right-hand batter on strike: off side is on the right, leg side is on the left.";

  return LiveFieldPresentationSchema.parse({
    version: FIELD_PRESENTATION_VERSION,
    format,
    phase,
    activeInningsIndex: Math.min(3, Math.max(0, activeIndex)),
    strikerId,
    strikerName: strikerId ? (names[strikerId] ?? strikerId) : null,
    strikerHand,
    nonStrikerId,
    nonStrikerName: nonStrikerId ? (names[nonStrikerId] ?? nonStrikerId) : null,
    bowlerId,
    bowlerName: bowlerId ? (names[bowlerId] ?? bowlerId) : null,
    keeperId,
    keeperName: keeperId ? (names[keeperId] ?? keeperId) : null,
    keeperPoint: KEEPER_POINT,
    bowlerReleasePoint: BOWLER_RELEASE_POINT,
    strikerPoint: STRIKER_CREASE_POINT,
    nonStrikerPoint: reflectPointForHand({ x10: 935, y10: 755 }, strikerHand),
    boundaryRadiusX10: 840,
    circleRadiusX10: 480,
    positions,
    legality,
    recentHighlights,
    latestHighlight,
    orientationNote,
    trackingDisclaimer: FIELD_TRACKING_DISCLAIMER,
  });
}
