import {
  InMatchTacticalAssistantViewSchema,
  PreMatchBriefingSchema,
  TACTICAL_BRIEFING_VERSION,
  type BattingPlan,
  type BattingStintReview,
  type BowlingPlan,
  type BowlingSpellReview,
  type BowlingStyle,
  type DeliveryRecorded,
  type FieldSlot,
  type Format,
  type InningsLedger,
  type InMatchTacticalAssistantView,
  type PitchTendency,
  type PlayerConditionBand,
  type PreMatchBriefing,
  type PreMatchPlayerAvailability,
  type PreMatchTeamReadiness,
  type OpponentObservationSummary,
  type TacticalControlTradeOff,
  type TacticalPresetOption,
  type T20TeamSelection,
} from "@lcxxvi/contracts";

const INSIDE_CIRCLE_SLOT_IDS = new Set([
  "slip-1",
  "slip-2",
  "point",
  "cover",
  "mid-off",
  "mid-on",
  "midwicket",
]);

const CLOSE_CATCHER_SLOT_IDS = new Set(["slip-1", "slip-2"]);

export type PublicSquadPlayerInput = {
  readonly playerId: string;
  readonly name: string;
  readonly role: "BATTER" | "BOWLER" | "ALLROUNDER" | "KEEPER";
  readonly batHand: "R" | "L";
  readonly bowlingStyle: BowlingStyle | null;
};

export type PreMatchTeamInput = {
  readonly teamId: string;
  readonly teamName: string;
  readonly players: readonly PublicSquadPlayerInput[];
};

export type PreMatchConditionInput = {
  readonly fatigueBp: number;
  readonly readinessDelta: number;
};

export type BuildPreMatchBriefingInput = {
  readonly format: Format;
  readonly ground: {
    readonly groundId: string;
    readonly name: string;
    readonly pitchPrior: {
      readonly seamBp: number;
      readonly turnBp: number;
    };
  };
  readonly teams: readonly [PreMatchTeamInput, PreMatchTeamInput];
  readonly selections?: readonly [T20TeamSelection, T20TeamSelection] | null;
  readonly conditionsByPlayerId?: Readonly<Record<string, PreMatchConditionInput>>;
};

function isPaceStyle(style: BowlingStyle | null): boolean {
  return style === "FAST" || style === "MEDIUM";
}

function isSpinStyle(style: BowlingStyle | null): boolean {
  return style !== null && !isPaceStyle(style);
}

export function classifyPitchTendency(seamBp: number, turnBp: number): PitchTendency {
  if (seamBp >= 5600 && turnBp >= 5600) return "LIVE_BOTH";
  if (seamBp >= 5600 && seamBp >= turnBp + 300) return "SEAM_FRIENDLY";
  if (turnBp >= 5600 && turnBp >= seamBp + 300) return "SPIN_FRIENDLY";
  if (seamBp <= 4500 && turnBp <= 4500) return "FLAT";
  return "BALANCED";
}

export function classifyConditionBand(
  fatigueBp: number,
  readinessDelta: number,
): PlayerConditionBand {
  if (fatigueBp >= 5500) return "TIRED";
  if (fatigueBp >= 2500) return "WORKED";
  if (fatigueBp === 0 && readinessDelta >= 0) return "FRESH";
  return "READY";
}

function formatPitchSummary(
  tendency: PitchTendency,
  seamBp: number,
  turnBp: number,
): string {
  const seam = (seamBp / 100).toFixed(2);
  const turn = (turnBp / 100).toFixed(2);
  switch (tendency) {
    case "SEAM_FRIENDLY":
      return `Seam-leaning surface (seam ${seam}/100, spin ${turn}/100): pace movement gets above-neutral assistance while spin starts closer to neutral.`;
    case "SPIN_FRIENDLY":
      return `Spin-leaning surface (seam ${seam}/100, spin ${turn}/100): spin turn starts above 50/100 and increases further if pitch wear accumulates.`;
    case "LIVE_BOTH":
      return `Bowler-friendly surface (seam ${seam}/100, spin ${turn}/100): both pace movement and spin turn sit above the 50/100 neutral baseline.`;
    case "FLAT":
      return `Batting-friendly surface (seam ${seam}/100, spin ${turn}/100): both seam and spin assistance sit below the 50/100 neutral baseline.`;
    case "BALANCED":
      return `Balanced surface (seam ${seam}/100, spin ${turn}/100): pace and spin assistance both start near the 50/100 neutral baseline.`;
  }
}

function formatRulesSummaryFor(format: Format): string {
  if (format === "T20") {
    return "20 overs per side · max 4 overs (24 balls) per bowler · Powerplay overs 0.0–5.5 allow at most 2 fielders outside the circle (max 5 thereafter).";
  }
  if (format === "ODI") {
    return "50 overs per side · max 10 overs (60 balls) per bowler · Field-circle limits: max 2 outside (0.0–9.5), max 4 (10.0–39.5), max 5 (40.0–49.5).";
  }
  return "Five-day red-ball (up to 90 overs/day) · no bowler over cap or 30-yard circle restriction · new ball available at 80.0 overs · follow-on threshold 200+ runs.";
}

function buildTeamReadiness(
  team: PreMatchTeamInput,
  selection: T20TeamSelection | null,
  conditionsByPlayerId: Readonly<Record<string, PreMatchConditionInput>>,
): PreMatchTeamReadiness {
  const selectedIds = new Set(
    selection?.teamId === team.teamId ? selection.playerIds : team.players.slice(0, 11).map((p) => p.playerId),
  );
  const players: PreMatchPlayerAvailability[] = team.players.map((p) => {
    const cond = conditionsByPlayerId[p.playerId] ?? { fatigueBp: 0, readinessDelta: 0 };
    const fatigueBp = Math.max(0, Math.min(10000, Math.round(cond.fatigueBp)));
    const readinessDelta = Math.max(-20, Math.min(20, Math.round(cond.readinessDelta)));
    return {
      playerId: p.playerId,
      name: p.name,
      role: p.role,
      batHand: p.batHand,
      bowlingStyle: p.bowlingStyle,
      canBowl: p.bowlingStyle !== null,
      selectedInXI: selectedIds.has(p.playerId),
      fatigueBp,
      readinessDelta,
      conditionBand: classifyConditionBand(fatigueBp, readinessDelta),
    };
  });
  const xi = players.filter((p) => p.selectedInXI);
  const selectedKeepers = xi.filter((p) => p.role === "KEEPER").length;
  const selectedPaceOptions = xi.filter((p) => isPaceStyle(p.bowlingStyle)).length;
  const selectedSpinOptions = xi.filter((p) => isSpinStyle(p.bowlingStyle)).length;
  const selectedBowlingOptions = selectedPaceOptions + selectedSpinOptions;
  const selectedLeftHandBatters = xi.filter((p) => p.batHand === "L").length;
  const freshInXI = xi.filter((p) => p.conditionBand === "FRESH" || p.conditionBand === "READY").length;
  const tiredInXI = xi.filter((p) => p.conditionBand === "TIRED").length;

  const notes: string[] = [
    `${xi.length}/11 selected · ${selectedKeepers} keeper${selectedKeepers === 1 ? "" : "s"} · ${selectedBowlingOptions} bowling options (${selectedPaceOptions} pace, ${selectedSpinOptions} spin).`,
  ];
  if (selectedKeepers < 1) {
    notes.push("Select at least 1 designated wicketkeeper before starting.");
  }
  if (selectedBowlingOptions < 5) {
    notes.push("Fewer than 5 bowling options selected; limited-overs quotas require at least 5 bowlers to cover all overs.");
  } else if (tiredInXI > 0) {
    notes.push(`${tiredInXI} selected player${tiredInXI === 1 ? " carries" : "s carry"} high fatigue (>= 55%), which reduces movement and length accuracy.`);
  } else {
    notes.push(`${freshInXI}/${xi.length} selected players enter fresh or ready.`);
  }

  return {
    teamId: team.teamId,
    teamName: team.teamName,
    squadSize: players.length,
    selectedCount: xi.length,
    selectedKeepers,
    selectedBowlingOptions,
    selectedPaceOptions,
    selectedSpinOptions,
    selectedLeftHandBatters,
    freshInXI,
    tiredInXI,
    balanceSummary: notes.join(" "),
    players,
  };
}

function buildOpponentObservation(
  opponent: PreMatchTeamInput,
  selection: T20TeamSelection | null,
): OpponentObservationSummary {
  const selectedSet =
    selection && selection.teamId === opponent.teamId
      ? new Set(selection.playerIds)
      : null;
  const pool =
    selectedSet && selectedSet.size === 11
      ? opponent.players.filter((p) => selectedSet.has(p.playerId))
      : opponent.players;
  const poolLabel = selectedSet && selectedSet.size === 11 ? "SELECTED_XI" : "AVAILABLE_SQUAD";
  const leftHandBatters = pool.filter((p) => p.batHand === "L").length;
  const rightHandBatters = pool.filter((p) => p.batHand === "R").length;
  const keepers = pool.filter((p) => p.role === "KEEPER").length;
  const paceOptions = pool.filter((p) => isPaceStyle(p.bowlingStyle)).length;
  const spinOptions = pool.filter((p) => isSpinStyle(p.bowlingStyle)).length;
  const styleSet = new Set<BowlingStyle>();
  for (const p of pool) {
    if (p.bowlingStyle) styleSet.add(p.bowlingStyle);
  }
  const bowlingStyles = [...styleSet];
  const observations: string[] = [
    `${poolLabel === "SELECTED_XI" ? "Selected XI" : "Squad pool"} batting handedness: ${rightHandBatters} RHB / ${leftHandBatters} LHB.`,
    `Bowling options: ${paceOptions} pace and ${spinOptions} spin (${bowlingStyles.length > 0 ? bowlingStyles.join(", ") : "none"}).`,
  ];
  if (leftHandBatters > 0 && rightHandBatters > 0) {
    observations.push(
      "Mixed RHB/LHB batting lineup: rotating strike flips off/leg field orientation, so keep <= 5 fielders on both sides to avoid mid-over field resets.",
    );
  }
  if (spinOptions >= 3) {
    observations.push(
      "Spin-heavy opposition attack: middle-over strike rotation and spin matchups will carry extra weight if pitch turn rises.",
    );
  } else if (paceOptions >= 4) {
    observations.push(
      "Pace-heavy opposition attack: new-ball seam movement and yorker/short-ball pace plans are prominent threats.",
    );
  }

  return {
    opponentTeamId: opponent.teamId,
    opponentTeamName: opponent.teamName,
    poolLabel,
    leftHandBatters,
    rightHandBatters,
    keepers,
    paceOptions,
    spinOptions,
    bowlingStyles,
    observations,
  };
}

/** Pure public-data pre-match briefing. Never reads hidden ratings, youth ceilings, or match seeds. */
export function buildPreMatchBriefing(
  input: BuildPreMatchBriefingInput,
): PreMatchBriefing {
  const conditions = input.conditionsByPlayerId ?? {};
  const sel0 = input.selections?.[0] ?? null;
  const sel1 = input.selections?.[1] ?? null;
  const tendency = classifyPitchTendency(
    input.ground.pitchPrior.seamBp,
    input.ground.pitchPrior.turnBp,
  );
  const result: PreMatchBriefing = {
    version: TACTICAL_BRIEFING_VERSION,
    format: input.format,
    ground: {
      groundId: input.ground.groundId,
      groundName: input.ground.name,
      seamBp: input.ground.pitchPrior.seamBp,
      turnBp: input.ground.pitchPrior.turnBp,
      pitchTendency: tendency,
      pitchSummary: formatPitchSummary(
        tendency,
        input.ground.pitchPrior.seamBp,
        input.ground.pitchPrior.turnBp,
      ),
      formatRulesSummary: formatRulesSummaryFor(input.format),
      modelLimitsDisclosure:
        "Moisture, bounce variability, and outfield speed have no effect in the current SYNTHETIC_ALPHA model; no hidden statistical bonuses apply.",
    },
    teams: [
      buildTeamReadiness(input.teams[0], sel0, conditions),
      buildTeamReadiness(input.teams[1], sel1, conditions),
    ],
    opponentObservations: [
      buildOpponentObservation(input.teams[1], sel1),
      buildOpponentObservation(input.teams[0], sel0),
    ],
  };
  return PreMatchBriefingSchema.parse(result);
}

export const projectPreMatchBriefing = buildPreMatchBriefing;

export type MatchEventLike = {
  readonly sequence: number;
  readonly type: string;
  readonly payload: unknown;
};

export type ProjectTacticalAssistantInput = {
  readonly format: Format;
  readonly phase: string;
  readonly innings: readonly InningsLedger[];
  readonly activeIndex: number;
  readonly events: readonly MatchEventLike[];
  readonly names: Readonly<Record<string, string>>;
  readonly hands: Readonly<Record<string, "L" | "R">>;
  readonly pitch: {
    readonly seamBp: number;
    readonly turnBp: number;
    readonly wearPoints: number;
  };
  readonly fatigueBpByPlayerId: Readonly<Record<string, number>>;
  readonly activeBattingPlans: Readonly<
    Record<string, Pick<BattingPlan, "aggression" | "intent">>
  >;
  readonly activeBowlingPlan: BowlingPlan | null;
  readonly activeFieldSlots: readonly FieldSlot[];
  readonly outfieldIds: readonly string[];
  readonly bowlerVariationsByPlayerId: Readonly<Record<string, readonly string[]>>;
  readonly redBallDay?: number;
};

function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function countFieldBreakdown(slots: readonly FieldSlot[]) {
  let ring = 0;
  let boundary = 0;
  let closeCatchers = 0;
  for (const s of slots) {
    if (INSIDE_CIRCLE_SLOT_IDS.has(s.slotId)) ring += 1;
    else boundary += 1;
    if (CLOSE_CATCHER_SLOT_IDS.has(s.slotId)) closeCatchers += 1;
  }
  return { ring, boundary, closeCatchers };
}

function selectLegalPresetSlotIds(
  format: Format,
  legalBalls: number,
  preset: "SLIP_ATTACK" | "BALANCED_RING" | "BOUNDARY_PROTECT",
): readonly string[] {
  // Every returned 9-slot list uses 4 or 5 off-side slots and 5 or 4 leg-side slots
  // with <= 2 behind-square on both sides, so it stays legal for both RHB and LHB.
  const powerplay =
    (format === "T20" && legalBalls < 36) || (format === "ODI" && legalBalls < 60);

  if (preset === "SLIP_ATTACK") {
    return [
      "slip-1",
      "slip-2",
      "point",
      "cover",
      "mid-off",
      "mid-on",
      "midwicket",
      "deep-square-leg",
      "fine-leg",
    ];
  }
  if (powerplay) {
    return [
      "slip-1",
      "slip-2",
      "point",
      "cover",
      "mid-off",
      "mid-on",
      "midwicket",
      "deep-square-leg",
      "long-on",
    ];
  }
  if (preset === "BALANCED_RING") {
    return [
      "slip-1",
      "point",
      "cover",
      "mid-off",
      "deep-cover",
      "mid-on",
      "midwicket",
      "deep-square-leg",
      "long-on",
    ];
  }
  if (format === "ODI" && legalBalls >= 240) {
    return [
      "point",
      "cover",
      "deep-cover",
      "long-off",
      "mid-on",
      "midwicket",
      "deep-square-leg",
      "fine-leg",
      "long-on",
    ];
  }
  return [
    "point",
    "cover",
    "mid-off",
    "deep-cover",
    "mid-on",
    "midwicket",
    "deep-square-leg",
    "fine-leg",
    "long-on",
  ];
}

function assignPresetField(
  outfieldIds: readonly string[],
  slotIds: readonly string[],
): FieldSlot[] {
  const sorted = [...outfieldIds].sort();
  return sorted.map((playerId, idx) => ({
    slotId: slotIds[idx]!,
    playerId,
  }));
}

function sameFieldSlots(
  a: readonly FieldSlot[],
  b: readonly FieldSlot[],
): boolean {
  if (a.length !== b.length) return false;
  const sig = (list: readonly FieldSlot[]) =>
    [...list]
      .sort((x, y) => x.playerId.localeCompare(y.playerId))
      .map((s) => `${s.playerId}:${s.slotId}`)
      .join("|");
  return sig(a) === sig(b);
}

function buildControlGuide(
  strikerPlan: { aggression: number; intent: "NORMAL" | "ROTATE" | "PROTECT" } | null,
  bowlingPlan: BowlingPlan | null,
  fieldSlots: readonly FieldSlot[],
): TacticalControlTradeOff[] {
  const fieldCounts = countFieldBreakdown(fieldSlots);
  return [
    {
      controlId: "BATTING_AGGRESSION",
      side: "BATTING",
      label: "Batting aggression (0–4)",
      currentSetting: strikerPlan ? `Level ${strikerPlan.aggression} / 4` : "Awaiting striker",
      upside:
        "Higher aggression shifts contact toward scoring strokes and boundaries when chasing or accelerating late.",
      tradeOff:
        "Higher aggression increases aerial, edge, and miss contact; lower levels lean on defence at a slower scoring rate.",
    },
    {
      controlId: "BATTING_INTENT",
      side: "BATTING",
      label: "Batting intent",
      currentSetting: strikerPlan ? strikerPlan.intent : "Awaiting striker",
      upside:
        "ROTATE boosts single-taking to turn strike over; PROTECT suppresses risky singles to shield a partner or survive a spell.",
      tradeOff:
        "ROTATE adds run-out exposure against sharp ring fielders; PROTECT passes up singles and can stall scoreboard momentum.",
    },
    {
      controlId: "BOWLING_LINE",
      side: "BOWLING",
      label: "Bowling line",
      currentSetting: bowlingPlan ? bowlingPlan.line : "Awaiting bowler",
      upside:
        "STUMPS brings bowled and LBW into play and narrows straight sectors; OFF channels strokes into off-side catchers and ring stops.",
      tradeOff:
        "LEG line disables LBW dismissals and raises wide risk under the legality model.",
    },
    {
      controlId: "BOWLING_LENGTH",
      side: "BOWLING",
      label: "Intended bowling length",
      currentSetting: bowlingPlan ? bowlingPlan.length : "Awaiting bowler",
      upside:
        "GOOD balances control; YORKER raises misses and suppresses lofted contact; SHORT tests batters with higher aerial and edge rates.",
      tradeOff:
        "Execution depends on control and low fatigue: missed YORKER or FULL balls spill into high-scoring full tosses.",
    },
    {
      controlId: "BOWLING_EFFORT",
      side: "BOWLING",
      label: "Bowling effort",
      currentSetting: bowlingPlan ? bowlingPlan.effort : "Awaiting bowler",
      upside:
        "CONSERVE lowers wide/no-ball risk and slows fatigue across longer spells; MAXIMUM pushes effort in short bursts.",
      tradeOff:
        "MAXIMUM raises wide/no-ball risk and accelerates bowler fatigue, degrading movement and length accuracy later in the spell.",
    },
    {
      controlId: "BOWLING_VARIATION",
      side: "BOWLING",
      label: "Delivery variation",
      currentSetting: bowlingPlan ? bowlingPlan.variationId : "Awaiting bowler",
      upside:
        "Stock ball uses baseline control; selecting a bowler's supported variation changes pace or turn mix when batters settle.",
      tradeOff:
        "Only variations listed on the active bowler are legal; overusing effort alongside variations still accumulates spell fatigue.",
    },
    {
      controlId: "FIELD_PLACEMENT",
      side: "FIELDING",
      label: "Named 9-man field",
      currentSetting:
        fieldSlots.length === 9
          ? `${fieldCounts.ring} in ring · ${fieldCounts.boundary} outside · ${fieldCounts.closeCatchers} slip${fieldCounts.closeCatchers === 1 ? "" : "s"}`
          : "Awaiting innings",
      upside:
        "Slips maximize edge catches; ring fielders cut singles and create run-out pressure; deep riders suppress fours and sixes.",
      tradeOff:
        "Pushing fielders to the boundary opens single-taking gaps in the ring; circle and leg-side limits apply by format and striker hand.",
    },
  ];
}

type InternalSpell = {
  inningsIndex: number;
  spellNumberInInnings: number;
  endParity: 0 | 1 | null;
  bowlerId: string;
  status: "IN_PROGRESS" | "BETWEEN_OVERS" | "COMPLETED";
  startOver: number;
  endOver: number;
  planCounts: Map<string, { plan: Omit<BowlingPlan, "bowlerId">; balls: number }>;
  initialPlan: Omit<BowlingPlan, "bowlerId">;
  planChangesCount: number;
  fieldChangesCount: number;
  latestFieldSlots: FieldSlot[];
  legalBalls: number;
  deliveryAttempts: number;
  runsConceded: number;
  wickets: number;
  dots: number;
  singles: number;
  boundaries: number;
  fours: number;
  sixes: number;
  wides: number;
  noBalls: number;
  intendedLengthMatches: number;
  intendedLengthEvaluatedBalls: number;
  executedLengths: {
    YORKER: number;
    FULL: number;
    GOOD: number;
    SHORT: number;
    FULL_TOSS: number;
  };
  trajectories: {
    GROUND: number;
    AERIAL: number;
    EDGE: number;
    NO_CONTACT: number;
  };
  fieldOutcomes: {
    STOP: number;
    CATCH: number;
    DROP: number;
    MISS: number;
    RUN_OUT: number;
  };
};

type InternalBattingStint = {
  inningsIndex: number;
  playerId: string;
  dismissed: boolean;
  initialPlan: { aggression: number; intent: "NORMAL" | "ROTATE" | "PROTECT" };
  planCounts: Map<
    string,
    { plan: { aggression: number; intent: "NORMAL" | "ROTATE" | "PROTECT" }; balls: number }
  >;
  planChangesCount: number;
  ballsFaced: number;
  runs: number;
  dots: number;
  singles: number;
  boundaries: number;
};

const DEFAULT_PLAN: Omit<BowlingPlan, "bowlerId"> = {
  line: "STUMPS",
  length: "GOOD",
  variationId: "stock",
  effort: "NORMAL",
};

const DEFAULT_BAT_PLAN: { aggression: number; intent: "NORMAL" | "ROTATE" | "PROTECT" } = {
  aggression: 2,
  intent: "NORMAL",
};

const BOWLER_CREDITED_DISMISSALS = new Set([
  "BOWLED",
  "LBW",
  "CAUGHT",
  "STUMPED",
  "HIT_WICKET",
]);

/** Deterministic projection of bowling spells and batting stints from committed match events. */
export function projectSpellAndStintReviews(
  events: readonly MatchEventLike[],
  names: Readonly<Record<string, string>>,
  initialFieldSlots: readonly FieldSlot[] = [],
): {
  spellReviews: BowlingSpellReview[];
  battingStintReviews: BattingStintReview[];
} {
  let currentInnings = 0;
  let inningsLegalBalls = 0;
  let spellCounter = 0;
  let currentBowlingPlan: Omit<BowlingPlan, "bowlerId"> = { ...DEFAULT_PLAN };
  let currentField: FieldSlot[] = [...initialFieldSlots];
  const battingPlans = new Map<
    string,
    { aggression: number; intent: "NORMAL" | "ROTATE" | "PROTECT" }
  >();

  const allSpells: InternalSpell[] = [];
  const openSpellByEnd: Record<0 | 1, InternalSpell | null> = { 0: null, 1: null };
  let activeSpell: InternalSpell | null = null;

  const allStints: InternalBattingStint[] = [];
  const stintsByInningsAndPlayer = new Map<string, InternalBattingStint>();

  function ensureStint(inningsIdx: number, playerId: string): InternalBattingStint {
    const key = `${inningsIdx}:${playerId}`;
    const existing = stintsByInningsAndPlayer.get(key);
    if (existing) return existing;
    const plan = battingPlans.get(playerId) ?? { ...DEFAULT_BAT_PLAN };
    const created: InternalBattingStint = {
      inningsIndex: inningsIdx,
      playerId,
      dismissed: false,
      initialPlan: { ...plan },
      planCounts: new Map(),
      planChangesCount: 0,
      ballsFaced: 0,
      runs: 0,
      dots: 0,
      singles: 0,
      boundaries: 0,
    };
    stintsByInningsAndPlayer.set(key, created);
    allStints.push(created);
    return created;
  }

  function closeInningsSpells() {
    for (const end of [0, 1] as const) {
      if (openSpellByEnd[end]) {
        openSpellByEnd[end]!.status = "COMPLETED";
        openSpellByEnd[end] = null;
      }
    }
    if (activeSpell) {
      activeSpell.status = "COMPLETED";
      activeSpell = null;
    }
  }

  for (const ev of events) {
    const p =
      typeof ev.payload === "object" && ev.payload !== null && !Array.isArray(ev.payload)
        ? (ev.payload as Record<string, unknown>)
        : {};
    if (ev.type === "INNINGS_STARTED") {
      closeInningsSpells();
      currentInnings =
        typeof p.inningsIndex === "number" ? p.inningsIndex : currentInnings + 1;
      inningsLegalBalls = 0;
      spellCounter = 0;
      currentBowlingPlan = { ...DEFAULT_PLAN };
      battingPlans.clear();
      continue;
    }
    if (ev.type === "INNINGS_COMPLETED" || ev.type === "DECLARED" || ev.type === "MATCH_COMPLETED") {
      closeInningsSpells();
      continue;
    }
    if (ev.type === "BATTER_SELECTED") {
      const playerId = String(p.playerId ?? "");
      if (playerId) ensureStint(currentInnings, playerId);
      continue;
    }
    if (ev.type === "BATTING_PLAN_CHANGED") {
      const playerId = String(p.playerId ?? "");
      const aggression = typeof p.aggression === "number" ? p.aggression : 2;
      const intent =
        p.intent === "ROTATE" || p.intent === "PROTECT" ? p.intent : "NORMAL";
      if (playerId) {
        battingPlans.set(playerId, { aggression, intent });
        const stint = ensureStint(currentInnings, playerId);
        stint.planChangesCount += 1;
        if (stint.ballsFaced === 0) {
          stint.initialPlan = { aggression, intent };
        }
      }
      continue;
    }
    if (ev.type === "BOWLER_SELECTED") {
      const bowlerId = String(p.playerId ?? "");
      const overNumber = Math.floor(inningsLegalBalls / 6);
      const parity = (overNumber % 2) as 0 | 1;
      currentBowlingPlan = { ...DEFAULT_PLAN };
      const prevAtEnd = openSpellByEnd[parity];
      if (prevAtEnd && prevAtEnd.bowlerId === bowlerId) {
        prevAtEnd.status = "IN_PROGRESS";
        prevAtEnd.endOver = overNumber + 1;
        activeSpell = prevAtEnd;
      } else {
        if (prevAtEnd) {
          prevAtEnd.status = "COMPLETED";
        }
        // If this bowler had an open spell at the opposite end, close it before starting a new end spell.
        const otherParity = (1 - parity) as 0 | 1;
        if (openSpellByEnd[otherParity]?.bowlerId === bowlerId) {
          openSpellByEnd[otherParity]!.status = "COMPLETED";
          openSpellByEnd[otherParity] = null;
        }
        spellCounter += 1;
        const nextSpell: InternalSpell = {
          inningsIndex: currentInnings,
          spellNumberInInnings: spellCounter,
          endParity: parity,
          bowlerId,
          status: "IN_PROGRESS",
          startOver: overNumber + 1,
          endOver: overNumber + 1,
          planCounts: new Map(),
          initialPlan: { ...currentBowlingPlan },
          planChangesCount: 0,
          fieldChangesCount: 0,
          latestFieldSlots: [...currentField],
          legalBalls: 0,
          deliveryAttempts: 0,
          runsConceded: 0,
          wickets: 0,
          dots: 0,
          singles: 0,
          boundaries: 0,
          fours: 0,
          sixes: 0,
          wides: 0,
          noBalls: 0,
          intendedLengthMatches: 0,
          intendedLengthEvaluatedBalls: 0,
          executedLengths: { YORKER: 0, FULL: 0, GOOD: 0, SHORT: 0, FULL_TOSS: 0 },
          trajectories: { GROUND: 0, AERIAL: 0, EDGE: 0, NO_CONTACT: 0 },
          fieldOutcomes: { STOP: 0, CATCH: 0, DROP: 0, MISS: 0, RUN_OUT: 0 },
        };
        openSpellByEnd[parity] = nextSpell;
        activeSpell = nextSpell;
        allSpells.push(nextSpell);
      }
      continue;
    }
    if (ev.type === "BOWLING_PLAN_CHANGED") {
      const line = p.line === "OFF" || p.line === "LEG" ? p.line : "STUMPS";
      const length =
        p.length === "YORKER" || p.length === "FULL" || p.length === "SHORT"
          ? p.length
          : "GOOD";
      const effort =
        p.effort === "CONSERVE" || p.effort === "MAXIMUM" ? p.effort : "NORMAL";
      const variationId =
        typeof p.variationId === "string" && p.variationId.length > 0
          ? p.variationId
          : "stock";
      currentBowlingPlan = { line, length, variationId, effort };
      if (activeSpell) {
        activeSpell.planChangesCount += 1;
        if (activeSpell.deliveryAttempts === 0) {
          activeSpell.initialPlan = { ...currentBowlingPlan };
        }
      }
      continue;
    }
    if (ev.type === "FIELD_CHANGED") {
      if (Array.isArray(p.fieldSlots)) {
        currentField = (p.fieldSlots as FieldSlot[]).map((s) => ({
          slotId: s.slotId,
          playerId: s.playerId,
        }));
        if (activeSpell) {
          activeSpell.fieldChangesCount += 1;
          activeSpell.latestFieldSlots = [...currentField];
        }
      }
      continue;
    }
    if (ev.type === "OVER_COMPLETED") {
      if (activeSpell && activeSpell.status === "IN_PROGRESS") {
        activeSpell.status = "BETWEEN_OVERS";
      }
      continue;
    }
    if (ev.type === "DELIVERY_RECORDED") {
      const d = (p as { event?: DeliveryRecorded }).event;
      if (!d) continue;
      const overNumber = Math.floor(inningsLegalBalls / 6);
      if (!activeSpell || activeSpell.bowlerId !== d.bowlerId) {
        spellCounter += 1;
        activeSpell = {
          inningsIndex: d.inningsIndex,
          spellNumberInInnings: spellCounter,
          endParity: (overNumber % 2) as 0 | 1,
          bowlerId: d.bowlerId,
          status: "IN_PROGRESS",
          startOver: overNumber + 1,
          endOver: overNumber + 1,
          planCounts: new Map(),
          initialPlan: { ...currentBowlingPlan },
          planChangesCount: 0,
          fieldChangesCount: 0,
          latestFieldSlots: [...currentField],
          legalBalls: 0,
          deliveryAttempts: 0,
          runsConceded: 0,
          wickets: 0,
          dots: 0,
          singles: 0,
          boundaries: 0,
          fours: 0,
          sixes: 0,
          wides: 0,
          noBalls: 0,
          intendedLengthMatches: 0,
          intendedLengthEvaluatedBalls: 0,
          executedLengths: { YORKER: 0, FULL: 0, GOOD: 0, SHORT: 0, FULL_TOSS: 0 },
          trajectories: { GROUND: 0, AERIAL: 0, EDGE: 0, NO_CONTACT: 0 },
          fieldOutcomes: { STOP: 0, CATCH: 0, DROP: 0, MISS: 0, RUN_OUT: 0 },
        };
        allSpells.push(activeSpell);
      }
      activeSpell.endOver = Math.max(activeSpell.endOver, overNumber + 1);
      activeSpell.latestFieldSlots =
        currentField.length === 9 ? [...currentField] : activeSpell.latestFieldSlots;
      activeSpell.deliveryAttempts += 1;
      const planKey = `${currentBowlingPlan.line}|${currentBowlingPlan.length}|${currentBowlingPlan.effort}|${currentBowlingPlan.variationId}`;
      const existingPlan = activeSpell.planCounts.get(planKey);
      if (existingPlan) existingPlan.balls += 1;
      else activeSpell.planCounts.set(planKey, { plan: { ...currentBowlingPlan }, balls: 1 });

      if (d.legalBall) {
        activeSpell.legalBalls += 1;
        inningsLegalBalls += 1;
      }
      const bowlerConceded =
        d.batRuns + d.extras.wides + d.extras.noBalls;
      activeSpell.runsConceded += bowlerConceded;
      if (d.legality === "WIDE") activeSpell.wides += d.extras.wides;
      if (d.legality === "NO_BALL") activeSpell.noBalls += d.extras.noBalls;
      if (
        d.legalBall &&
        d.batRuns === 0 &&
        d.extras.wides === 0 &&
        d.extras.noBalls === 0 &&
        d.extras.byes === 0 &&
        d.extras.legByes === 0
      ) {
        activeSpell.dots += 1;
      }
      if (d.batRuns === 1 && d.boundary === "NONE") activeSpell.singles += 1;
      if (d.boundary === "FOUR") {
        activeSpell.boundaries += 1;
        activeSpell.fours += 1;
      } else if (d.boundary === "SIX") {
        activeSpell.boundaries += 1;
        activeSpell.sixes += 1;
      }
      if (d.dismissal && BOWLER_CREDITED_DISMISSALS.has(d.dismissal.kind)) {
        activeSpell.wickets += 1;
      }
      if (d.executedLength) {
        activeSpell.executedLengths[d.executedLength] += 1;
        activeSpell.intendedLengthEvaluatedBalls += 1;
        if (d.executedLength === currentBowlingPlan.length) {
          activeSpell.intendedLengthMatches += 1;
        }
      }
      if (d.trajectory) {
        activeSpell.trajectories[d.trajectory] += 1;
      } else {
        activeSpell.trajectories.NO_CONTACT += 1;
      }
      if (d.fieldOutcome !== "NONE") {
        activeSpell.fieldOutcomes[d.fieldOutcome] += 1;
      }

      // Batter stint update
      const strikerStint = ensureStint(d.inningsIndex, d.strikerId);
      const batPlan = battingPlans.get(d.strikerId) ?? { ...DEFAULT_BAT_PLAN };
      const batKey = `${batPlan.aggression}|${batPlan.intent}`;
      if (d.countsAsBallFaced) {
        strikerStint.ballsFaced += 1;
        const prevBat = strikerStint.planCounts.get(batKey);
        if (prevBat) prevBat.balls += 1;
        else strikerStint.planCounts.set(batKey, { plan: { ...batPlan }, balls: 1 });
        if (d.batRuns === 0) strikerStint.dots += 1;
      }
      strikerStint.runs += d.batRuns;
      if (d.batRuns === 1 && d.boundary === "NONE") strikerStint.singles += 1;
      if (d.boundary === "FOUR" || d.boundary === "SIX") strikerStint.boundaries += 1;
      if (d.dismissal) {
        const outStint = ensureStint(d.inningsIndex, d.dismissal.playerId);
        outStint.dismissed = true;
      }
    }
  }

  const spellReviews: BowlingSpellReview[] = allSpells
    .filter((sp) => sp.deliveryAttempts > 0)
    .map((sp) => {
      let bestPlan = sp.initialPlan;
      let bestBalls = -1;
      for (const entry of sp.planCounts.values()) {
        if (entry.balls > bestBalls) {
          bestBalls = entry.balls;
          bestPlan = entry.plan;
        }
      }
      const fieldCounts = countFieldBreakdown(sp.latestFieldSlots);
      const oversDisplay = formatOvers(sp.legalBalls);
      const economyX100 =
        sp.legalBalls > 0
          ? Math.round((sp.runsConceded * 600) / sp.legalBalls)
          : null;
      const econStr =
        economyX100 === null ? "—" : (economyX100 / 100).toFixed(2);
      const bowlerName = names[sp.bowlerId] ?? sp.bowlerId;
      const statusWord =
        sp.status === "COMPLETED"
          ? "Completed spell"
          : sp.status === "BETWEEN_OVERS"
            ? "Spell between overs"
            : "Current over";
      const factualSummary = `${statusWord} (overs ${sp.startOver}–${sp.endOver}): accepted plan targeted ${bestPlan.length} length on ${bestPlan.line} (${bestPlan.effort} effort, ${bestPlan.variationId}, ${fieldCounts.ring} in ring / ${fieldCounts.boundary} deep). Recorded ${oversDisplay} overs, ${sp.wickets}/${sp.runsConceded} (econ ${econStr}), ${sp.intendedLengthMatches}/${sp.intendedLengthEvaluatedBalls} on intended length, ${sp.dots} dots, ${sp.boundaries} boundaries.`;

      return {
        spellId: `inn${sp.inningsIndex}-spell${sp.spellNumberInInnings}-${sp.bowlerId}`,
        inningsIndex: sp.inningsIndex,
        spellNumberInInnings: sp.spellNumberInInnings,
        bowlerId: sp.bowlerId,
        bowlerName,
        status: sp.status,
        startOver: sp.startOver,
        endOver: sp.endOver,
        acceptedPlan: {
          primaryLine: bestPlan.line,
          primaryLength: bestPlan.length,
          primaryEffort: bestPlan.effort,
          primaryVariationId: bestPlan.variationId,
          latestRingFielders: fieldCounts.ring,
          latestBoundaryFielders: fieldCounts.boundary,
          latestCloseCatchers: fieldCounts.closeCatchers,
          planChangesCount: sp.planChangesCount,
          fieldChangesCount: sp.fieldChangesCount,
        },
        outcomes: {
          legalBalls: sp.legalBalls,
          oversDisplay,
          deliveryAttempts: sp.deliveryAttempts,
          runsConceded: sp.runsConceded,
          wickets: sp.wickets,
          dots: sp.dots,
          singles: sp.singles,
          boundaries: sp.boundaries,
          fours: sp.fours,
          sixes: sp.sixes,
          wides: sp.wides,
          noBalls: sp.noBalls,
          economyX100,
          intendedLengthMatches: sp.intendedLengthMatches,
          intendedLengthEvaluatedBalls: sp.intendedLengthEvaluatedBalls,
          executedLengths: { ...sp.executedLengths },
          trajectories: { ...sp.trajectories },
          fieldOutcomes: { ...sp.fieldOutcomes },
        },
        factualSummary,
      };
    })
    .reverse();

  const battingStintReviews: BattingStintReview[] = allStints
    .filter((st) => st.ballsFaced > 0 || st.runs > 0 || st.dismissed)
    .map((st) => {
      let bestPlan = st.initialPlan;
      let bestBalls = -1;
      for (const entry of st.planCounts.values()) {
        if (entry.balls > bestBalls) {
          bestBalls = entry.balls;
          bestPlan = entry.plan;
        }
      }
      const strikeRateX100 =
        st.ballsFaced > 0 ? Math.round((st.runs * 10000) / st.ballsFaced) : null;
      const srStr =
        strikeRateX100 === null ? "—" : (strikeRateX100 / 100).toFixed(2);
      const playerName = names[st.playerId] ?? st.playerId;
      const factualSummary = `Accepted plan: aggression ${bestPlan.aggression}/4 (${bestPlan.intent}). Recorded ${st.runs}${st.dismissed ? "" : "*"} (${st.ballsFaced}b, SR ${srStr}), ${st.dots} dots, ${st.singles} singles, ${st.boundaries} boundaries.`;
      return {
        stintId: `inn${st.inningsIndex}-bat-${st.playerId}`,
        inningsIndex: st.inningsIndex,
        playerId: st.playerId,
        playerName,
        dismissed: st.dismissed,
        acceptedPlan: {
          primaryAggression: bestPlan.aggression,
          primaryIntent: bestPlan.intent,
          planChangesCount: st.planChangesCount,
        },
        outcomes: {
          ballsFaced: st.ballsFaced,
          runs: st.runs,
          dots: st.dots,
          singles: st.singles,
          boundaries: st.boundaries,
          strikeRateX100,
        },
        factualSummary,
      };
    })
    .reverse();

  return { spellReviews, battingStintReviews };
}

/** Builds the complete Stage 5 in-match tactical assistant projection from public state and committed events. */
export function projectInMatchTacticalAssistant(
  input: ProjectTacticalAssistantInput,
): InMatchTacticalAssistantView {
  const activeLedger = input.innings[input.activeIndex];
  const inn = activeLedger?.innings;
  const legalBalls = inn?.legalBalls ?? 0;
  const runs = inn?.runs ?? 0;
  const wickets = inn?.wickets ?? 0;
  const target = inn?.targetToWin ?? null;
  const strikerId =
    inn == null
      ? null
      : inn.strikerEnd === "NORTH"
        ? inn.northBatterId
        : inn.southBatterId;
  const strikerPlan =
    strikerId != null
      ? (input.activeBattingPlans[strikerId] ?? { aggression: 2, intent: "NORMAL" as const })
      : null;

  let phaseLabel = `${input.format} · ${input.phase}`;
  let fieldRestrictionLabel = "Named 9-man field · max 5 leg-side · max 2 behind square leg.";
  if (input.format === "T20") {
    if (legalBalls < 36) {
      phaseLabel = "T20 Powerplay (Overs 0.0–5.5)";
      fieldRestrictionLabel = "Max 2 fielders outside 30-yard circle · max 5 leg-side · max 2 behind square leg.";
    } else if (legalBalls < 90) {
      phaseLabel = "T20 Middle Overs (Overs 6.0–14.5)";
      fieldRestrictionLabel = "Max 5 fielders outside 30-yard circle · max 5 leg-side · max 2 behind square leg.";
    } else {
      phaseLabel = "T20 Late Overs (Overs 15.0–19.5)";
      fieldRestrictionLabel = "Max 5 fielders outside 30-yard circle · max 5 leg-side · max 2 behind square leg.";
    }
  } else if (input.format === "ODI") {
    if (legalBalls < 60) {
      phaseLabel = "ODI Powerplay 1 (Overs 0.0–9.5)";
      fieldRestrictionLabel = "Max 2 fielders outside 30-yard circle · max 5 leg-side · max 2 behind square leg.";
    } else if (legalBalls < 240) {
      phaseLabel = "ODI Middle Overs (Overs 10.0–39.5)";
      fieldRestrictionLabel = "Max 4 fielders outside 30-yard circle · max 5 leg-side · max 2 behind square leg.";
    } else {
      phaseLabel = "ODI Late Overs (Overs 40.0–49.5)";
      fieldRestrictionLabel = "Max 5 fielders outside 30-yard circle · max 5 leg-side · max 2 behind square leg.";
    }
  } else {
    phaseLabel = `Five-day Red-ball · Day ${input.redBallDay ?? 1} · Innings ${input.activeIndex + 1}`;
    fieldRestrictionLabel = "No circle limit · max 5 leg-side · max 2 behind square leg · new ball at 80.0 overs.";
  }

  const maxBalls = input.format === "T20" ? 120 : input.format === "ODI" ? 300 : null;
  const ballsRemaining = maxBalls === null ? null : Math.max(0, maxBalls - legalBalls);
  const crr = legalBalls > 0 ? ((runs * 6) / legalBalls).toFixed(2) : "0.00";
  const rrr =
    target !== null && ballsRemaining !== null && ballsRemaining > 0
      ? ((Math.max(0, target - runs) * 6) / ballsRemaining).toFixed(2)
      : null;

  let scoreContextLabel = inn
    ? `${runs}/${wickets} (${formatOvers(legalBalls)} ov, CRR ${crr}) · ${10 - wickets} wicket${10 - wickets === 1 ? "" : "s"} in hand.`
    : "Match setup complete; awaiting opening innings.";
  if (inn && target !== null) {
    const needed = Math.max(0, target - runs);
    scoreContextLabel =
      ballsRemaining !== null
        ? `Chasing ${target}: need ${needed} from ${ballsRemaining} balls (RRR ${rrr ?? "—"}, CRR ${crr}, ${10 - wickets} wkts in hand).`
        : `Fourth-innings target ${target}: need ${needed} more runs (${10 - wickets} wkts in hand).`;
  } else if (inn && input.format === "RED_BALL" && input.innings.length > 1) {
    const batTeam = inn.battingTeamId;
    const batTotal = input.innings
      .filter((l) => l.innings.battingTeamId === batTeam)
      .reduce((acc, l) => acc + l.innings.runs, 0);
    const bowlTotal = input.innings
      .filter((l) => l.innings.battingTeamId !== batTeam)
      .reduce((acc, l) => acc + l.innings.runs, 0);
    const diff = batTotal - bowlTotal;
    scoreContextLabel = `${runs}/${wickets} (${formatOvers(legalBalls)} ov) · batting side ${diff >= 0 ? `leads by ${diff}` : `trails by ${Math.abs(diff)}`} overall.`;
  }

  const pitchSummaryLabel = `Seam ${(input.pitch.seamBp / 100).toFixed(2)}/100 · Spin ${(input.pitch.turnBp / 100).toFixed(2)}/100 · Wear ${input.pitch.wearPoints} pts.`;

  let activeBowlerWorkloadLabel = "No active bowler selected.";
  const activeBowlerId = inn?.bowlerId ?? input.activeBowlingPlan?.bowlerId ?? null;
  if (activeBowlerId && activeLedger) {
    const bStats = activeLedger.bowling[activeBowlerId];
    const bBalls = bStats?.legalBalls ?? 0;
    const fatigueBp = input.fatigueBpByPlayerId[activeBowlerId] ?? 0;
    const quotaCap = input.format === "T20" ? 24 : input.format === "ODI" ? 60 : null;
    const quotaText =
      quotaCap === null
        ? "no over cap"
        : `${formatOvers(Math.max(0, quotaCap - bBalls))} ov left in quota`;
    activeBowlerWorkloadLabel = `${input.names[activeBowlerId] ?? activeBowlerId}: ${formatOvers(bBalls)} ov, ${bStats?.wickets ?? 0}/${bStats?.runsConceded ?? 0} · Fatigue ${Math.round(fatigueBp / 100)}% · ${quotaText}.`;
  }

  const controlGuide = buildControlGuide(
    strikerPlan,
    input.activeBowlingPlan,
    input.activeFieldSlots,
  );

  const presets: TacticalPresetOption[] = [];
  const latePhase =
    (input.format === "T20" && legalBalls >= 90) ||
    (input.format === "ODI" && legalBalls >= 240);
  const middlePhase =
    (input.format === "T20" && legalBalls >= 36 && legalBalls < 90) ||
    (input.format === "ODI" && legalBalls >= 60 && legalBalls < 240);
  const rrrNum = rrr === null ? null : Number(rrr);

  if (strikerId && strikerPlan) {
    const collapseRisk = wickets >= 4 && (ballsRemaining === null || ballsRemaining > 24);
    presets.push(
      {
        presetId: "BAT_CONSOLIDATE",
        commandKind: "SET_BATTING_PLAN",
        label: "Consolidate & protect wicket",
        whenToUse: "Rebuild after early wickets, survive a testing spell, or bat time in red-ball.",
        tradeOff: "Lowers boundary frequency and passes up tight singles (aggression 1, PROTECT).",
        contextualMatch: collapseRisk || (input.format === "RED_BALL" && wickets >= 5),
        contextualReason: collapseRisk
          ? `${wickets} wickets down with overs remaining.`
          : "",
        activeNow: strikerPlan.aggression === 1 && strikerPlan.intent === "PROTECT",
        battingPatch: { aggression: 1, intent: "PROTECT" },
      },
      {
        presetId: "BAT_ROTATE_STRIKE",
        commandKind: "SET_BATTING_PLAN",
        label: "Work singles & rotate strike",
        whenToUse: "Keep the scoreboard moving in middle overs or a measured chase.",
        tradeOff: "Increases single attempts and run-out exposure against inner-ring fielders (aggression 2, ROTATE).",
        contextualMatch: middlePhase || (rrrNum !== null && rrrNum >= 5 && rrrNum <= 8),
        contextualReason: middlePhase
          ? "Middle-overs spread field leaves single-taking pockets."
          : rrrNum !== null && rrrNum >= 5 && rrrNum <= 8
            ? `Measured required rate (${rrr}).`
            : "",
        activeNow: strikerPlan.aggression === 2 && strikerPlan.intent === "ROTATE",
        battingPatch: { aggression: 2, intent: "ROTATE" },
      },
      {
        presetId: "BAT_BALANCED_TEMPO",
        commandKind: "SET_BATTING_PLAN",
        label: "Balanced tempo",
        whenToUse: "Default tempo when building an innings platform without extra run-out risk.",
        tradeOff: "Neutral contact and running weights (aggression 2, NORMAL).",
        contextualMatch: !collapseRisk && !middlePhase && !latePhase && (rrrNum === null || rrrNum <= 8),
        contextualReason: !collapseRisk && !middlePhase && !latePhase ? "Opening phase platform." : "",
        activeNow: strikerPlan.aggression === 2 && strikerPlan.intent === "NORMAL",
        battingPatch: { aggression: 2, intent: "NORMAL" },
      },
      {
        presetId: "BAT_BOUNDARY_PUSH",
        commandKind: "SET_BATTING_PLAN",
        label: "Boundary push",
        whenToUse: "Accelerate in death overs or chase a steep required rate with wickets in hand.",
        tradeOff: "Sharply increases aerial, edge, and miss dismissal exposure (aggression 4, NORMAL).",
        contextualMatch: (latePhase && wickets <= 6) || (rrrNum !== null && rrrNum > 8.5),
        contextualReason:
          rrrNum !== null && rrrNum > 8.5
            ? `Required rate is ${rrr} per over.`
            : latePhase
              ? "Death-overs acceleration window."
              : "",
        activeNow: strikerPlan.aggression === 4 && strikerPlan.intent === "NORMAL",
        battingPatch: { aggression: 4, intent: "NORMAL" },
      },
    );
  }

  if (input.activeBowlingPlan) {
    const bp = input.activeBowlingPlan;
    const bowlerFatigue = input.fatigueBpByPlayerId[bp.bowlerId] ?? 0;
    const supportedVars = input.bowlerVariationsByPlayerId[bp.bowlerId] ?? ["stock"];
    const stockVar = supportedVars.includes("stock") ? "stock" : (supportedVars[0] ?? "stock");
    const powerplay =
      (input.format === "T20" && legalBalls < 36) ||
      (input.format === "ODI" && legalBalls < 60);

    presets.push(
      {
        presetId: "BOWL_DISCIPLINED_CHANNEL",
        commandKind: "SET_BOWLING_PLAN",
        label: "Disciplined off-stump channel",
        whenToUse: "Standard containing and wicket-hunting plan feeding off-side ring and slip fielders.",
        tradeOff: "Missed lengths spill to FULL rather than yorkers (OFF, GOOD, NORMAL).",
        contextualMatch: !latePhase && bowlerFatigue < 4500,
        contextualReason: !latePhase && bowlerFatigue < 4500 ? "Controlled channel with fresh bowler." : "",
        activeNow:
          bp.line === "OFF" &&
          bp.length === "GOOD" &&
          bp.effort === "NORMAL" &&
          bp.variationId === stockVar,
        bowlingPatch: {
          line: "OFF",
          length: "GOOD",
          effort: "NORMAL",
          variationId: stockVar,
        },
      },
      {
        presetId: "BOWL_ATTACK_STUMPS",
        commandKind: "SET_BOWLING_PLAN",
        label: "Pitch full at the stumps",
        whenToUse: "Search for bowled/LBW with a new ball, seam/spin movement, or against lower-order batters.",
        tradeOff: "Length errors become high-scoring full tosses (STUMPS, FULL, NORMAL).",
        contextualMatch: powerplay || wickets >= 7 || input.pitch.seamBp >= 5600,
        contextualReason:
          wickets >= 7
            ? "Lower order exposed."
            : powerplay
              ? "Powerplay / new-ball wicket window."
              : input.pitch.seamBp >= 5600
                ? "Above-neutral seam assistance."
                : "",
        activeNow:
          bp.line === "STUMPS" &&
          bp.length === "FULL" &&
          bp.effort === "NORMAL" &&
          bp.variationId === stockVar,
        bowlingPatch: {
          line: "STUMPS",
          length: "FULL",
          effort: "NORMAL",
          variationId: stockVar,
        },
      },
      {
        presetId: "BOWL_CONSERVE_SPELL",
        commandKind: "SET_BOWLING_PLAN",
        label: "Conserve spell accuracy",
        whenToUse: "Extend a tired bowler's spell or cut extras when fatigue rises above 40%.",
        tradeOff: "Uses CONSERVE effort rather than maximum pace effort (OFF, GOOD, CONSERVE).",
        contextualMatch: bowlerFatigue >= 4000,
        contextualReason:
          bowlerFatigue >= 4000
            ? `Active bowler fatigue is ${Math.round(bowlerFatigue / 100)}%.`
            : "",
        activeNow:
          bp.line === "OFF" &&
          bp.length === "GOOD" &&
          bp.effort === "CONSERVE" &&
          bp.variationId === stockVar,
        bowlingPatch: {
          line: "OFF",
          length: "GOOD",
          effort: "CONSERVE",
          variationId: stockVar,
        },
      },
      {
        presetId: "BOWL_YORKER_CLOSE",
        commandKind: "SET_BOWLING_PLAN",
        label: "Death-overs yorker plan",
        whenToUse: "Suppress lofted boundaries in the closing overs with a high-control, rested bowler.",
        tradeOff: "Missed yorkers become full tosses, and MAXIMUM effort adds wide/no-ball and fatigue risk.",
        contextualMatch: latePhase && bowlerFatigue < 4500,
        contextualReason:
          latePhase && bowlerFatigue < 4500 ? "Late overs with rested bowler." : "",
        activeNow:
          bp.line === "STUMPS" &&
          bp.length === "YORKER" &&
          bp.effort === "MAXIMUM" &&
          bp.variationId === stockVar,
        bowlingPatch: {
          line: "STUMPS",
          length: "YORKER",
          effort: "MAXIMUM",
          variationId: stockVar,
        },
      },
      {
        presetId: "BOWL_SHORT_TEST",
        commandKind: "SET_BOWLING_PLAN",
        label: "Short-ball examination",
        whenToUse: "Force aerial and edge contact for a short burst when catchers are in place.",
        tradeOff: "Raises aerial boundary risk plus MAXIMUM effort extras and faster fatigue.",
        contextualMatch: input.format === "RED_BALL" && wickets >= 6 && bowlerFatigue < 3500,
        contextualReason:
          input.format === "RED_BALL" && wickets >= 6 && bowlerFatigue < 3500
            ? "Rested bowler testing lower order."
            : "",
        activeNow:
          bp.line === "OFF" &&
          bp.length === "SHORT" &&
          bp.effort === "MAXIMUM" &&
          bp.variationId === stockVar,
        bowlingPatch: {
          line: "OFF",
          length: "SHORT",
          effort: "MAXIMUM",
          variationId: stockVar,
        },
      },
    );
  }

  if (input.outfieldIds.length === 9) {
    const slipSlots = assignPresetField(
      input.outfieldIds,
      selectLegalPresetSlotIds(input.format, legalBalls, "SLIP_ATTACK"),
    );
    const balancedSlots = assignPresetField(
      input.outfieldIds,
      selectLegalPresetSlotIds(input.format, legalBalls, "BALANCED_RING"),
    );
    const boundarySlots = assignPresetField(
      input.outfieldIds,
      selectLegalPresetSlotIds(input.format, legalBalls, "BOUNDARY_PROTECT"),
    );
    const powerplay =
      (input.format === "T20" && legalBalls < 36) ||
      (input.format === "ODI" && legalBalls < 60);

    presets.push(
      {
        presetId: "FIELD_SLIP_ATTACK",
        commandKind: "SET_FIELD",
        label: "Attacking two-slip cordon",
        whenToUse: "Convert edges with a new ball, live seam/spin pitch, or exposed lower order.",
        tradeOff: "Leaves fewer boundary sweepers if batters clear the infield (7 in ring, 2 slips, 2 deep).",
        contextualMatch: powerplay || wickets >= 7 || input.format === "RED_BALL",
        contextualReason:
          powerplay
            ? "Legal 2-out powerplay cordon."
            : wickets >= 7
              ? "Catching cordon for lower order."
              : "",
        activeNow: sameFieldSlots(input.activeFieldSlots, slipSlots),
        fieldSlots: slipSlots,
      },
      {
        presetId: "FIELD_BALANCED_RING",
        commandKind: "SET_FIELD",
        label: "Balanced slip & ring",
        whenToUse: "Keep 1 slip and ring single-saving cover while posting phase-legal sweepers.",
        tradeOff: "Splits protection between edge catching and deep boundary cover.",
        contextualMatch: middlePhase,
        contextualReason: middlePhase ? "Middle-overs ring + sweeper balance." : "",
        activeNow: sameFieldSlots(input.activeFieldSlots, balancedSlots),
        fieldSlots: balancedSlots,
      },
      {
        presetId: "FIELD_BOUNDARY_PROTECT",
        commandKind: "SET_FIELD",
        label: "Boundary rider defence",
        whenToUse: "Defend a total in late overs or against high-aggression boundary hitting.",
        tradeOff: "Removes slips and opens single-taking space inside the circle.",
        contextualMatch: latePhase || (rrrNum !== null && rrrNum > 8),
        contextualReason:
          latePhase
            ? "Maximum phase-legal boundary protection."
            : rrrNum !== null && rrrNum > 8
              ? "Chasing side needs boundaries."
              : "",
        activeNow: sameFieldSlots(input.activeFieldSlots, boundarySlots),
        fieldSlots: boundarySlots,
      },
    );
  }

  const { spellReviews, battingStintReviews } = projectSpellAndStintReviews(
    input.events,
    input.names,
    input.activeFieldSlots,
  );

  return InMatchTacticalAssistantViewSchema.parse({
    version: TACTICAL_BRIEFING_VERSION,
    format: input.format,
    situation: {
      phaseLabel,
      fieldRestrictionLabel,
      scoreContextLabel,
      pitchSummaryLabel,
      activeBowlerWorkloadLabel,
    },
    controlGuide,
    presets,
    spellReviews,
    battingStintReviews,
  });
}
