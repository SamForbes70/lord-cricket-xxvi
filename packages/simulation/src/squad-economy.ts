import {
  AcceptCounterOfferRequestSchema,
  ClubBudgetStateSchema,
  ContractOfferSchema,
  DEFAULT_ANNUAL_CLUB_WAGE_BUDGET_K,
  DEFAULT_RELEASE_BUYOUT_PERCENT,
  ECONOMY_TRANSACTION_LEDGER_ENTRY_VERSION,
  EconomyDiagnosticSeasonSnapshotSchema,
  EconomyTransactionLedgerEntryCoreSchema,
  EconomyTransactionLedgerEntrySchema,
  FictionalSquadEconomyModelSchema,
  FormatSkillsSchema,
  FreeAgentRecordSchema,
  MAX_ACTIVE_TEAM_SQUAD_SIZE,
  MAX_CONTRACT_TERM_SEASONS,
  MAX_FREE_AGENT_POOL_SIZE,
  MAX_NEGOTIATION_ROUNDS_PER_WINDOW,
  MAX_PLAYER_ANNUAL_WAGE_K,
  MIN_ACTIVE_TEAM_SQUAD_SIZE,
  MIN_CONTRACT_TERM_SEASONS,
  MIN_FREE_AGENT_POOL_SIZE,
  MIN_PLAYER_ANNUAL_WAGE_K,
  NegotiationWindowStateSchema,
  PlayerContractSchema,
  PlayerSchema,
  ReleaseContractedPlayerRequestSchema,
  ResolveNegotiationRoundRequestSchema,
  RetiredPlayerRecordSchema,
  SeasonEconomyTransitionSummarySchema,
  SQUAD_ECONOMY_MODEL_VERSION,
  SQUAD_ECONOMY_STATE_VERSION,
  SquadEconomyStateCoreSchema,
  SquadEconomyStateSchema,
  SubmitContractOfferRequestSchema,
  TARGET_ACTIVE_TEAM_SQUAD_SIZE,
  WithdrawContractOfferRequestSchema,
  YOUTH_ROOKIE_ANNUAL_WAGE_K,
  type ClubBudgetState,
  type ContractOffer,
  type EconomyDiagnosticSeasonSnapshot,
  type EconomyTransactionLedgerEntry,
  type EconomyTransactionType,
  type FictionalSquadEconomyModel,
  type FormatSkills,
  type FreeAgentRecord,
  type LifecycleAbilityBandSummary,
  type NegotiationWindowState,
  type NewGameWorldCopy,
  type PersistentWorldIdentity,
  type Player,
  type PlayerContract,
  type PlayerLifecycleSkillLedgerEntry,
  type PlayerLifecycleState,
  type RetiredPlayerRecord,
  type SeasonEconomyTransitionSummary,
  type SquadEconomyState,
  type TrainingDirective,
  type WorldPack,
} from "@lcxxvi/contracts";
import { isBowlingCapable } from "@lcxxvi/data";
import { canonicalStateBytes, createRandomService, sha256Hex } from "./determinism.js";
import {
  advancePlayerLifecycleAtSeasonClose,
  buildLifecycleRosterPack,
  createInitialPlayerLifecycleState,
  FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1,
  playerAgeInSeason,
  recordElapsedTrainingExposure,
  sealPlayerLifecycleState,
  summarizeT20SkillAverages,
  validatePlayerLifecycleState,
} from "./player-lifecycle.js";
import { advanceRosterCareerDay, createRosterCareerDayState } from "./roster-career-condition.js";
import { simulateRosterOffscreenFixture } from "./roster-offscreen-fixture.js";
import { generateRosterSeasonSchedule } from "./roster-season-schedule.js";

const FREE_AGENT_FIRST_NAMES = [
  "Ansel", "Basten", "Callum", "Darian", "Eamon", "Ferris", "Gideon", "Harlan",
  "Idris", "Jareth", "Kieran", "Lorcan", "Malik", "Nolan", "Oswin", "Piers",
  "Quentin", "Ronan", "Sander", "Tristan", "Ulric", "Vaughn", "Wes", "Zane",
] as const;

const FREE_AGENT_SURNAMES = [
  "Aldridge", "Bannister", "Coldwell", "Davenport", "Eastwood", "Fletcher",
  "Garrison", "Hawthorne", "Ingram", "Jarvis", "Kinsley", "Langford",
  "Mercer", "Northcott", "Overton", "Prescott", "Radcliffe", "Stanmore",
  "Thornton", "Underhill", "Vance", "Whitaker", "Yardley", "Zouch",
] as const;

const BOWLING_STYLES = [
  "FAST",
  "MEDIUM",
  "OFF_SPIN",
  "LEG_SPIN",
  "SLOW_LEFT_ARM",
  "LEFT_ARM_WRIST",
] as const;

export const FICTIONAL_SQUAD_ECONOMY_MODEL_V1: FictionalSquadEconomyModel =
  FictionalSquadEconomyModelSchema.parse({
    modelVersion: SQUAD_ECONOMY_MODEL_VERSION,
    calibrationStatus: "FICTIONAL_PLACEHOLDER",
    disclaimer:
      "Fictional domestic contract system (v1): symmetrical club wage budgets, player market valuations, persistent negotiation rounds, and buyout dead-cap rules use deterministic gameplay parameters. Auctions and international release rules are deferred.",
    annualClubWageBudgetK: DEFAULT_ANNUAL_CLUB_WAGE_BUDGET_K,
    minAnnualWageK: MIN_PLAYER_ANNUAL_WAGE_K,
    maxAnnualWageK: MAX_PLAYER_ANNUAL_WAGE_K,
    youthRookieAnnualWageK: YOUTH_ROOKIE_ANNUAL_WAGE_K,
    minContractTermSeasons: MIN_CONTRACT_TERM_SEASONS,
    maxContractTermSeasons: MAX_CONTRACT_TERM_SEASONS,
    maxNegotiationRounds: MAX_NEGOTIATION_ROUNDS_PER_WINDOW,
    releaseBuyoutPercent: DEFAULT_RELEASE_BUYOUT_PERCENT,
    minFreeAgentPoolSize: MIN_FREE_AGENT_POOL_SIZE,
    maxFreeAgentPoolSize: MAX_FREE_AGENT_POOL_SIZE,
  });

function assertEconomy(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`LC_SQUAD_ECONOMY_${code}`);
}

/**
 * Strictly public player market view. Structurally excludes `fictionalCeilingTier`,
 * academy internal state, or any hidden future development seed.
 */
export interface PublicMarketPlayerView {
  readonly playerId: string;
  readonly role: Player["role"];
  readonly bowlingStyle: Player["bowlingStyle"];
  readonly ageYears: number;
  readonly currentT20Skills: FormatSkills;
  readonly recentMatches: number;
  readonly recentRuns: number;
  readonly recentWickets: number;
}

export interface RecentPlayerSeasonStatsSummary {
  readonly playerId: string;
  readonly matches: number;
  readonly runs: number;
  readonly wickets: number;
  readonly ballsFaced?: number;
  readonly bowlingLegalBalls?: number;
}

export function buildPublicMarketPlayerView(
  player: Player,
  calendarYear: number,
  recent?: RecentPlayerSeasonStatsSummary,
): PublicMarketPlayerView {
  return {
    playerId: player.playerId,
    role: player.role,
    bowlingStyle: player.bowlingStyle,
    ageYears: playerAgeInSeason(player.birthDate, calendarYear),
    currentT20Skills: structuredClone(player.skills.T20!),
    recentMatches: recent?.matches ?? 0,
    recentRuns: recent?.runs ?? 0,
    recentWickets: recent?.wickets ?? 0,
  };
}

export function publicPlayerRoleRating(view: PublicMarketPlayerView): number {
  const s = summarizeT20SkillAverages(view.currentT20Skills);
  if (view.role === "BATTER") {
    return Math.round(s.batting * 0.8 + s.fielding * 0.2);
  }
  if (view.role === "BOWLER") {
    return Math.round(s.bowling * 0.8 + s.fielding * 0.2);
  }
  if (view.role === "ALLROUNDER") {
    const hi = Math.max(s.batting, s.bowling);
    const lo = Math.min(s.batting, s.bowling);
    return Math.round(hi * 0.65 + lo * 0.25 + s.fielding * 0.1);
  }
  return Math.round(s.batting * 0.55 + s.keeping * 0.35 + s.fielding * 0.1);
}

export function estimatePlayerMarketWageK(
  view: PublicMarketPlayerView,
  model: FictionalSquadEconomyModel = FICTIONAL_SQUAD_ECONOMY_MODEL_V1,
): number {
  const rating = publicPlayerRoleRating(view);
  const base =
    model.minAnnualWageK +
    Math.max(0, rating - 46) * 3 +
    Math.max(0, rating - 62) * 3 +
    Math.max(0, rating - 70) * 5;
  let perfDelta = 0;
  if (view.recentMatches >= 4) {
    if (view.recentRuns >= 380) perfDelta += 20;
    else if (view.recentRuns >= 250) perfDelta += 12;
    else if (view.recentRuns >= 160) perfDelta += 6;
    if (view.recentWickets >= 18) perfDelta += 20;
    else if (view.recentWickets >= 12) perfDelta += 12;
    else if (view.recentWickets >= 7) perfDelta += 6;
  }
  const ageDelta = view.ageYears >= 34 ? -8 : view.ageYears <= 21 ? -5 : 0;
  return Math.max(model.minAnnualWageK, Math.min(model.maxAnnualWageK, Math.round(base + perfDelta + ageDelta)));
}

export function preferredContractTermSeasons(ageYears: number): 1 | 2 | 3 {
  if (ageYears >= 33) return 1;
  if (ageYears >= 28) return 2;
  return 3;
}

function uniqueCareerTeams(existing: readonly string[], nextTeamId: string): string[] {
  return existing.includes(nextTeamId) ? [...existing] : [...existing, nextTeamId].slice(0, 8);
}

function computePendingReservedForTeam(
  offers: readonly ContractOffer[],
  contractsByPlayer: ReadonlyMap<string, PlayerContract>,
  teamId: string,
  excludeOfferId?: string,
): { reservedWagesK: number; pendingFreeAgentSignings: number } {
  let reservedWagesK = 0;
  let pendingFreeAgentSignings = 0;
  for (const offer of offers) {
    if (offer.offeringTeamId !== teamId) continue;
    if (excludeOfferId && offer.offerId === excludeOfferId) continue;
    if (offer.status !== "PENDING_ROUND" && offer.status !== "COUNTERED") continue;
    const effectiveWageK =
      offer.status === "COUNTERED" && offer.counterAnnualWageK !== null
        ? Math.max(offer.annualWageK, offer.counterAnnualWageK)
        : offer.annualWageK;
    if (offer.offerKind === "FREE_AGENT") {
      reservedWagesK += effectiveWageK;
      pendingFreeAgentSignings += 1;
    } else {
      const existing = contractsByPlayer.get(offer.playerId);
      const currentWage = existing && existing.teamId === teamId ? existing.annualWageK : 0;
      reservedWagesK += Math.max(0, effectiveWageK - currentWage);
    }
  }
  return { reservedWagesK, pendingFreeAgentSignings };
}

export function computeClubBudgets(input: {
  teamIds: readonly string[];
  seasonNumber: number;
  contracts: readonly PlayerContract[];
  offers: readonly ContractOffer[];
  deadCapByTeam: ReadonlyMap<string, number>;
  model: FictionalSquadEconomyModel;
}): ClubBudgetState[] {
  const contractsByPlayer = new Map(input.contracts.map((c) => [c.playerId, c]));
  const sortedTeams = [...input.teamIds].sort((a, b) => a.localeCompare(b));
  return sortedTeams.map((teamId) => {
    const committedWagesK = input.contracts
      .filter((c) => c.teamId === teamId)
      .reduce((sum, c) => sum + c.annualWageK, 0);
    const deadCapWagesK = input.deadCapByTeam.get(teamId) ?? 0;
    const { reservedWagesK } = computePendingReservedForTeam(
      input.offers,
      contractsByPlayer,
      teamId,
    );
    const totalUsed = committedWagesK + deadCapWagesK + reservedWagesK;
    assertEconomy(
      committedWagesK + deadCapWagesK <= input.model.annualClubWageBudgetK,
      `CLUB_OVERSPENT:${teamId}:${committedWagesK + deadCapWagesK}>${input.model.annualClubWageBudgetK}`,
    );
    assertEconomy(
      totalUsed <= input.model.annualClubWageBudgetK,
      `CLUB_RESERVED_OVERSPENT:${teamId}:${totalUsed}>${input.model.annualClubWageBudgetK}`,
    );
    return ClubBudgetStateSchema.parse({
      teamId,
      seasonNumber: input.seasonNumber,
      annualWageBudgetK: input.model.annualClubWageBudgetK,
      committedWagesK,
      deadCapWagesK,
      pendingOfferReservedWagesK: reservedWagesK,
      availableWageSpaceK: input.model.annualClubWageBudgetK - totalUsed,
    });
  });
}

function appendLedgerEntry(
  ledger: EconomyTransactionLedgerEntry[],
  input: {
    seasonNumber: number;
    calendarYear: number;
    date: string;
    type: EconomyTransactionType;
    teamId: string;
    playerId: string;
    contractId: string | null;
    offerId: string | null;
    annualWageK: number;
    deadCapDeltaK: number;
    termSeasons: number;
    teamCommittedWagesAfterK: number;
    teamDeadCapAfterK: number;
    teamBudgetLimitK: number;
    summary: string;
  },
): void {
  assertEconomy(
    input.teamCommittedWagesAfterK + input.teamDeadCapAfterK <= input.teamBudgetLimitK,
    `LEDGER_OVERSPEND:${input.teamId}:${input.teamCommittedWagesAfterK + input.teamDeadCapAfterK}>${input.teamBudgetLimitK}`,
  );
  const sequence = ledger.length + 1;
  const prevEntrySha256 = ledger.length > 0 ? ledger[ledger.length - 1]!.entrySha256 : null;
  const core = EconomyTransactionLedgerEntryCoreSchema.parse({
    ledgerEntryVersion: ECONOMY_TRANSACTION_LEDGER_ENTRY_VERSION,
    sequence,
    transactionId: `tx-s${String(input.seasonNumber).padStart(3, "0")}-${String(sequence).padStart(5, "0")}`,
    seasonNumber: input.seasonNumber,
    calendarYear: input.calendarYear,
    date: input.date,
    type: input.type,
    teamId: input.teamId,
    playerId: input.playerId,
    contractId: input.contractId,
    offerId: input.offerId,
    annualWageK: input.annualWageK,
    deadCapDeltaK: input.deadCapDeltaK,
    termSeasons: input.termSeasons,
    teamCommittedWagesAfterK: input.teamCommittedWagesAfterK,
    teamDeadCapAfterK: input.teamDeadCapAfterK,
    teamBudgetLimitK: input.teamBudgetLimitK,
    summary: input.summary.slice(0, 320),
    prevEntrySha256,
  });
  const entrySha256 = sha256Hex(canonicalStateBytes(core));
  ledger.push(EconomyTransactionLedgerEntrySchema.parse({ ...core, entrySha256 }));
}

const VERIFIED_LEDGER_TAIL_SHAS = new Set<string>();
const VERIFIED_ECONOMY_SHAS = new Set<string>();

export function verifyEconomyLedgerChain(
  ledger: readonly EconomyTransactionLedgerEntry[],
): void {
  assertEconomy(ledger.length >= 1, "EMPTY_ECONOMY_LEDGER");
  const lastEntry = ledger[ledger.length - 1];
  if (lastEntry && VERIFIED_LEDGER_TAIL_SHAS.has(lastEntry.entrySha256)) {
    assertEconomy(
      lastEntry.sequence === ledger.length,
      `LEDGER_SEQUENCE_MISMATCH:${lastEntry.sequence}`,
    );
    return;
  }
  let startIdx = 0;
  let expectedPrev: string | null = null;
  if (ledger.length >= 2) {
    const prevEntry = ledger[ledger.length - 2]!;
    if (
      VERIFIED_LEDGER_TAIL_SHAS.has(prevEntry.entrySha256) &&
      prevEntry.sequence === ledger.length - 1
    ) {
      startIdx = ledger.length - 1;
      expectedPrev = prevEntry.entrySha256;
    }
  }
  for (let i = startIdx; i < ledger.length; i += 1) {
    const entry = EconomyTransactionLedgerEntrySchema.parse(ledger[i]);
    const { entrySha256, ...coreRaw } = entry;
    const core = EconomyTransactionLedgerEntryCoreSchema.parse(coreRaw);
    assertEconomy(core.sequence === i + 1, `LEDGER_SEQUENCE_MISMATCH:${core.sequence}`);
    assertEconomy(core.prevEntrySha256 === expectedPrev, `LEDGER_CHAIN_BROKEN:${core.sequence}`);
    assertEconomy(
      sha256Hex(canonicalStateBytes(core)) === entrySha256,
      `LEDGER_HASH_MISMATCH:${core.sequence}`,
    );
    assertEconomy(
      core.teamCommittedWagesAfterK + core.teamDeadCapAfterK <= core.teamBudgetLimitK,
      `LEDGER_ENTRY_OVERSPENT:${core.sequence}`,
    );
    expectedPrev = entrySha256;
    VERIFIED_LEDGER_TAIL_SHAS.add(entrySha256);
  }
}

export function sealSquadEconomyState(
  coreInput: Omit<SquadEconomyState, "economySha256">,
): SquadEconomyState {
  const core = SquadEconomyStateCoreSchema.parse(coreInput);
  verifyEconomyLedgerChain(core.ledger);
  const economySha256 = sha256Hex(canonicalStateBytes(core));
  const sealed = SquadEconomyStateSchema.parse({ ...core, economySha256 });
  VERIFIED_ECONOMY_SHAS.add(economySha256);
  return sealed;
}

export function validateSquadEconomyState(
  raw: unknown,
  lifecycle?: PlayerLifecycleState,
  seasonNumber?: number,
): SquadEconomyState {
  const candidateSha =
    typeof raw === "object" && raw !== null && "economySha256" in raw
      ? (raw as { economySha256?: unknown }).economySha256
      : undefined;
  const fastVerified =
    typeof candidateSha === "string" && VERIFIED_ECONOMY_SHAS.has(candidateSha);
  const parsed = fastVerified
    ? (raw as SquadEconomyState)
    : SquadEconomyStateSchema.parse(raw);
  if (!fastVerified) {
    const { economySha256, ...coreRaw } = parsed;
    const coreCheck = SquadEconomyStateCoreSchema.parse(coreRaw);
    assertEconomy(sha256Hex(canonicalStateBytes(coreCheck)) === economySha256, "HASH_MISMATCH");
    verifyEconomyLedgerChain(coreCheck.ledger);
    VERIFIED_ECONOMY_SHAS.add(economySha256);
  }
  const core = parsed;

  const contractPlayerIds = new Set<string>();
  for (const c of core.contracts) {
    assertEconomy(!contractPlayerIds.has(c.playerId), `DUPLICATE_CONTRACT:${c.playerId}`);
    contractPlayerIds.add(c.playerId);
    if (seasonNumber !== undefined) {
      assertEconomy(
        c.expiresAfterSeasonNumber >= seasonNumber,
        `EXPIRED_ACTIVE_CONTRACT:${c.playerId}:${c.expiresAfterSeasonNumber}<${seasonNumber}`,
      );
    }
  }
  const freeAgentIds = new Set<string>();
  for (const fa of core.freeAgents) {
    assertEconomy(!freeAgentIds.has(fa.playerId), `DUPLICATE_FREE_AGENT:${fa.playerId}`);
    assertEconomy(!contractPlayerIds.has(fa.playerId), `ACTIVE_AND_FREE_AGENT_COLLISION:${fa.playerId}`);
    freeAgentIds.add(fa.playerId);
  }

  if (lifecycle) {
    const retiredIds = new Set(lifecycle.retiredPlayers.map((r) => r.playerId));
    for (const faId of freeAgentIds) {
      assertEconomy(!retiredIds.has(faId), `FREE_AGENT_IS_RETIRED:${faId}`);
    }
    const activeTeamByPlayer = new Map<string, string>();
    for (const team of lifecycle.activeWorld.teams) {
      for (const pid of team.squadIds) activeTeamByPlayer.set(pid, team.teamId);
    }
    assertEconomy(
      activeTeamByPlayer.size === contractPlayerIds.size,
      `CONTRACT_COUNT_MISMATCH:${contractPlayerIds.size}!=${activeTeamByPlayer.size}`,
    );
    for (const c of core.contracts) {
      const actualTeam = activeTeamByPlayer.get(c.playerId);
      assertEconomy(
        actualTeam === c.teamId,
        `CONTRACT_TEAM_MISMATCH:${c.playerId}:${c.teamId}!=${actualTeam ?? "NONE"}`,
      );
    }
  }

  const deadCapMap = new Map(core.clubBudgets.map((b) => [b.teamId, b.deadCapWagesK]));
  const recomputed = computeClubBudgets({
    teamIds: core.clubBudgets.map((b) => b.teamId),
    seasonNumber: core.negotiationWindow.seasonNumber,
    contracts: core.contracts,
    offers: core.negotiationWindow.offers,
    deadCapByTeam: deadCapMap,
    model: core.model,
  });
  const byTeam = new Map(recomputed.map((b) => [b.teamId, b]));
  for (const stored of core.clubBudgets) {
    const expected = byTeam.get(stored.teamId);
    assertEconomy(Boolean(expected), `UNKNOWN_BUDGET_TEAM:${stored.teamId}`);
    assertEconomy(
      stored.committedWagesK === expected!.committedWagesK &&
        stored.deadCapWagesK === expected!.deadCapWagesK &&
        stored.pendingOfferReservedWagesK === expected!.pendingOfferReservedWagesK &&
        stored.availableWageSpaceK === expected!.availableWageSpaceK &&
        stored.annualWageBudgetK === expected!.annualWageBudgetK,
      `BUDGET_INVARIANT_MISMATCH:${stored.teamId}`,
    );
  }
  return parsed;
}

function generateUnattachedFreeAgent(
  worldIdentity: PersistentWorldIdentity,
  seasonNumber: number,
  calendarYear: number,
  slotIndex: number,
  forcedRole: Player["role"],
  model: FictionalSquadEconomyModel,
): FreeAgentRecord {
  const rng = createRandomService();
  const seed = `${worldIdentity.baseSeed}:free-agent-s${seasonNumber}`.slice(0, 256);
  let drawIndex = 0;
  const nextInt = (min: number, maxInclusive: number): number => {
    const span = maxInclusive - min + 1;
    const val =
      rng.uint32({
        seed,
        domain: "WORLD_GENERATION",
        entityId: `fa-pool-${slotIndex}`,
        eventOrdinal: seasonNumber,
        stageName: `fa_slot_${slotIndex}`,
        drawIndex: drawIndex++,
      }) % span;
    return min + val;
  };

  const ageYears = nextInt(21, 32);
  const birthYear = calendarYear - ageYears;
  const birthMonth = String(nextInt(1, 12)).padStart(2, "0");
  const birthDay = String(nextInt(1, 28)).padStart(2, "0");
  const birthDate = `${birthYear}-${birthMonth}-${birthDay}`;
  const firstName = FREE_AGENT_FIRST_NAMES[nextInt(0, FREE_AGENT_FIRST_NAMES.length - 1)]!;
  const surname = FREE_AGENT_SURNAMES[nextInt(0, FREE_AGENT_SURNAMES.length - 1)]!;
  const name = `${firstName} ${surname}`;
  const batHand = nextInt(0, 99) < 32 ? ("L" as const) : ("R" as const);
  const bowlHand = nextInt(0, 99) < 26 ? ("L" as const) : ("R" as const);

  let bowlingStyle: Player["bowlingStyle"] = null;
  if (forcedRole === "BOWLER" || forcedRole === "ALLROUNDER") {
    const idx = nextInt(0, BOWLING_STYLES.length - 1);
    bowlingStyle = BOWLING_STYLES[idx]!;
    if (bowlingStyle === "SLOW_LEFT_ARM" || bowlingStyle === "LEFT_ARM_WRIST") {
      // Match hand cleanly
    }
  } else if (forcedRole === "BATTER" && nextInt(0, 99) < 30) {
    bowlingStyle = nextInt(0, 1) === 0 ? "OFF_SPIN" : "MEDIUM";
  }
  const finalBowlHand =
    bowlingStyle === "SLOW_LEFT_ARM" || bowlingStyle === "LEFT_ARM_WRIST"
      ? ("L" as const)
      : bowlHand;

  const tierBonus = slotIndex <= 4 ? 8 : slotIndex <= 10 ? 4 : 0;
  const batBase =
    forcedRole === "BATTER"
      ? nextInt(56, 65) + tierBonus
      : forcedRole === "ALLROUNDER"
        ? nextInt(54, 62) + tierBonus
        : forcedRole === "KEEPER"
          ? nextInt(54, 62) + tierBonus
          : nextInt(28, 42);
  const bowlBase =
    forcedRole === "BOWLER"
      ? nextInt(56, 65) + tierBonus
      : forcedRole === "ALLROUNDER"
        ? nextInt(54, 62) + tierBonus
        : bowlingStyle !== null
          ? nextInt(42, 52)
          : nextInt(20, 30);
  const fieldBase = nextInt(54, 66) + Math.floor(tierBonus / 2);
  const keepBase = forcedRole === "KEEPER" ? nextInt(58, 68) + tierBonus : nextInt(18, 26);

  const clamp = (v: number) =>
    Math.max(
      FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1.minPermanentSkill,
      Math.min(FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1.maxPermanentSkill, v),
    );
  const makeSkills = (offset: number): FormatSkills =>
    FormatSkillsSchema.parse({
      defence: clamp(batBase + nextInt(-3, 3) + offset),
      timing: clamp(batBase + nextInt(-3, 4) + offset),
      power: clamp(batBase + nextInt(-4, 4) - offset),
      rotation: clamp(batBase + nextInt(-3, 3)),
      vsPace: clamp(batBase + nextInt(-3, 3)),
      vsSpin: clamp(batBase + nextInt(-3, 3)),
      control: clamp(bowlBase + nextInt(-3, 4) + offset),
      movement: clamp(bowlBase + nextInt(-3, 4) + offset),
      variation: clamp(bowlBase + nextInt(-3, 4) - offset),
      stamina: clamp(nextInt(56, 72)),
      catching: clamp(fieldBase + nextInt(-3, 3)),
      groundFielding: clamp(fieldBase + nextInt(-3, 3)),
      throwing: clamp(fieldBase + nextInt(-3, 3)),
      keeping: clamp(keepBase),
    });

  const isPace = bowlingStyle === "FAST" || bowlingStyle === "MEDIUM";
  void isPace;
  const variations = ["stock"];

  const rawWeights = Array.from({ length: 8 }, () => nextInt(80, 170));
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const scaled = rawWeights.map((w) => Math.floor((w * 1000) / weightSum));
  scaled[0] = (scaled[0] ?? 0) + (1000 - scaled.reduce((a, b) => a + b, 0));

  const playerId = `fa-s${String(seasonNumber).padStart(3, "0")}-${String(slotIndex).padStart(2, "0")}`;
  const sourceSeedDigest = sha256Hex(
    canonicalStateBytes({ worldId: worldIdentity.worldId, seasonNumber, slotIndex, playerId }),
  );
  const player = PlayerSchema.parse({
    playerId,
    name,
    birthDate,
    batHand,
    bowlHand: finalBowlHand,
    bowlingStyle,
    role: forcedRole,
    skills: {
      T20: makeSkills(0),
      ODI: makeSkills(1),
      RED_BALL: makeSkills(2),
    },
    variations,
    shotSectorWeights: scaled,
    exposureBalls: {
      T20: ageYears * 90,
      ODI: ageYears * 60,
      RED_BALL: ageYears * 80,
    },
    provenance: {
      kind: "FICTIONAL",
      sourceId: "fictional-free-agency-v1",
      sourceHash: sourceSeedDigest,
      confidenceBp: 3000,
    },
  });

  const view = buildPublicMarketPlayerView(player, calendarYear);
  const askingAnnualWageK = estimatePlayerMarketWageK(view, model);
  const preferredTermSeasons = preferredContractTermSeasons(ageYears);

  return FreeAgentRecordSchema.parse({
    playerId,
    player,
    enteredMarketSeasonNumber: seasonNumber,
    enteredReason: "UNATTACHED_POOL",
    previousTeamId: null,
    careerTeamIds: [],
    restrictedFromSigningTeamId: null,
    restrictedSeasonNumber: null,
    askingAnnualWageK,
    preferredTermSeasons,
  });
}

function buildBalancedFreeAgentAdditions(
  worldIdentity: PersistentWorldIdentity,
  seasonNumber: number,
  calendarYear: number,
  countNeeded: number,
  startSlotIndex: number,
  existingIds: ReadonlySet<string>,
  model: FictionalSquadEconomyModel,
): FreeAgentRecord[] {
  const roleCycle: Player["role"][] = [
    "BATTER",
    "BOWLER",
    "ALLROUNDER",
    "KEEPER",
    "BOWLER",
    "BATTER",
    "ALLROUNDER",
    "BOWLER",
  ];
  const added: FreeAgentRecord[] = [];
  let slot = startSlotIndex;
  while (added.length < countNeeded && slot < startSlotIndex + 200) {
    const role = roleCycle[(slot - 1) % roleCycle.length]!;
    const cand = generateUnattachedFreeAgent(
      worldIdentity,
      seasonNumber,
      calendarYear,
      slot,
      role,
      model,
    );
    slot += 1;
    if (existingIds.has(cand.playerId) || added.some((a) => a.playerId === cand.playerId)) {
      continue;
    }
    added.push(cand);
  }
  return added;
}

export function createInitialSquadEconomyState(input: {
  worldIdentity: PersistentWorldIdentity;
  lifecycle: PlayerLifecycleState;
  seasonNumber?: number;
  calendarYear: number;
  currentDate: string;
  recentStats?: readonly RecentPlayerSeasonStatsSummary[];
  model?: FictionalSquadEconomyModel;
}): SquadEconomyState {
  const validatedLifecycle = validatePlayerLifecycleState(input.lifecycle);
  const seasonNumber = input.seasonNumber ?? 1;
  const model = input.model ?? FICTIONAL_SQUAD_ECONOMY_MODEL_V1;
  const statsMap = new Map((input.recentStats ?? []).map((s) => [s.playerId, s]));
  const playerById = new Map(validatedLifecycle.activeWorld.players.map((p) => [p.playerId, p]));

  const contracts: PlayerContract[] = [];
  const ledger: EconomyTransactionLedgerEntry[] = [];
  const sortedTeams = [...validatedLifecycle.activeWorld.teams].sort((a, b) =>
    a.teamId.localeCompare(b.teamId),
  );

  let contractSeq = 1;
  for (const team of sortedTeams) {
    const rawTeamContracts: Array<{
      player: Player;
      rawWageK: number;
      expiresAfterSeasonNumber: number;
    }> = [];
    const sortedSquad = [...team.squadIds].sort((a, b) => a.localeCompare(b));
    sortedSquad.forEach((pid, idx) => {
      const player = playerById.get(pid)!;
      const view = buildPublicMarketPlayerView(player, input.calendarYear, statsMap.get(pid));
      const rawWageK = estimatePlayerMarketWageK(view, model);
      const age = view.ageYears;
      const staggeredSpan =
        age >= 34 ? 0 : idx % 3 === 0 ? 0 : idx % 3 === 1 ? 1 : 2;
      rawTeamContracts.push({
        player,
        rawWageK,
        expiresAfterSeasonNumber: seasonNumber + staggeredSpan,
      });
    });

    const rawSum = rawTeamContracts.reduce((acc, item) => acc + item.rawWageK, 0);
    const maxInitialClubCap = Math.floor(model.annualClubWageBudgetK * 0.86);
    const scaleFactor = rawSum > maxInitialClubCap ? maxInitialClubCap / rawSum : 1;

    let runningTeamCommittedK = 0;
    for (const item of rawTeamContracts) {
      const annualWageK = Math.max(
        model.minAnnualWageK,
        Math.min(model.maxAnnualWageK, Math.floor(item.rawWageK * scaleFactor)),
      );
      const contractId = `ct-s${String(seasonNumber).padStart(3, "0")}-${String(contractSeq++).padStart(4, "0")}`;
      const termSeasons = item.expiresAfterSeasonNumber - seasonNumber + 1;
      const contract = PlayerContractSchema.parse({
        contractId,
        playerId: item.player.playerId,
        teamId: team.teamId,
        signedSeasonNumber: seasonNumber,
        startsSeasonNumber: seasonNumber,
        expiresAfterSeasonNumber: item.expiresAfterSeasonNumber,
        annualWageK,
        origin: "INITIAL_SQUAD",
        careerTeamIds: [team.teamId],
      });
      contracts.push(contract);
      runningTeamCommittedK += annualWageK;
      appendLedgerEntry(ledger, {
        seasonNumber,
        calendarYear: input.calendarYear,
        date: input.currentDate,
        type: "INITIAL_CONTRACT_REGISTERED",
        teamId: team.teamId,
        playerId: item.player.playerId,
        contractId,
        offerId: null,
        annualWageK,
        deadCapDeltaK: 0,
        termSeasons,
        teamCommittedWagesAfterK: runningTeamCommittedK,
        teamDeadCapAfterK: 0,
        teamBudgetLimitK: model.annualClubWageBudgetK,
        summary: `Registered initial ${termSeasons}y domestic contract for ${item.player.name} at $${annualWageK}k/yr`,
      });
    }
  }

  const existingIds = new Set<string>([
    ...validatedLifecycle.activeWorld.players.map((p) => p.playerId),
    ...validatedLifecycle.retiredPlayers.map((r) => r.playerId),
    ...validatedLifecycle.youthAcademy.map((y) => y.player.playerId),
  ]);
  const freeAgents = buildBalancedFreeAgentAdditions(
    input.worldIdentity,
    seasonNumber,
    input.calendarYear,
    18,
    1,
    existingIds,
    model,
  );

  const negotiationWindow = NegotiationWindowStateSchema.parse({
    seasonNumber,
    windowPhase: "OPEN",
    currentRound: 1,
    maxRounds: MAX_NEGOTIATION_ROUNDS_PER_WINDOW,
    offers: [],
  });

  const clubBudgets = computeClubBudgets({
    teamIds: sortedTeams.map((t) => t.teamId),
    seasonNumber,
    contracts,
    offers: [],
    deadCapByTeam: new Map(),
    model,
  });

  return sealSquadEconomyState({
    economyVersion: SQUAD_ECONOMY_STATE_VERSION,
    model,
    contracts: contracts.sort((a, b) => a.playerId.localeCompare(b.playerId)),
    freeAgents: freeAgents.sort((a, b) => a.playerId.localeCompare(b.playerId)),
    clubBudgets,
    negotiationWindow,
    ledger,
    appliedCommandIds: [],
    transitions: [],
  });
}

function syncLifecycleWithWorldRosterMutation(input: {
  lifecycle: PlayerLifecycleState;
  worldId: string;
  seasonNumber: number;
  nextTeams: WorldPack["teams"];
  nextPlayers: Player[];
  addedPlayers: Player[];
}): PlayerLifecycleState {
  if (input.addedPlayers.length === 0) {
    const curTeams = input.lifecycle.activeWorld.teams;
    const sameTeams =
      curTeams.length === input.nextTeams.length &&
      curTeams.every((ct, idx) => {
        const nt = input.nextTeams[idx];
        return (
          nt !== undefined &&
          ct.teamId === nt.teamId &&
          ct.squadIds.length === nt.squadIds.length &&
          ct.squadIds.every((id, sIdx) => id === nt.squadIds[sIdx])
        );
      });
    if (sameTeams && input.lifecycle.activeWorld.players.length === input.nextPlayers.length) {
      return input.lifecycle;
    }
  }
  const nextRegistrationRevision = input.lifecycle.squadRegistrationRevision + 1;
  const sortedPlayers = [...input.nextPlayers].sort((a, b) => a.playerId.localeCompare(b.playerId));
  const nextWorld: WorldPack = {
    ...structuredClone(input.lifecycle.activeWorld),
    teams: input.nextTeams,
    players: sortedPlayers,
  };
  const nextPack = buildLifecycleRosterPack(
    nextWorld,
    input.worldId,
    input.seasonNumber,
    nextRegistrationRevision,
  );
  const ledgerMap = new Map<string, PlayerLifecycleSkillLedgerEntry>(
    input.lifecycle.skillLedger.map((e) => [e.playerId, e]),
  );
  for (const added of input.addedPlayers) {
    if (!ledgerMap.has(added.playerId)) {
      ledgerMap.set(added.playerId, {
        playerId: added.playerId,
        debutSeasonNumber: input.seasonNumber,
        careerEntryT20Skills: structuredClone(added.skills.T20!),
        priorSeasonT20Skills: structuredClone(added.skills.T20!),
        lastSeasonDelta: {
          battingDelta: 0,
          bowlingDelta: 0,
          fieldingDelta: 0,
          keepingDelta: 0,
          staminaDelta: 0,
        },
      });
    }
  }
  const exposureMap = new Map(
    input.lifecycle.seasonTrainingExposure.map((e) => [e.playerId, e]),
  );
  const nextExposure = sortedPlayers.map(
    (p) =>
      exposureMap.get(p.playerId) ?? {
        playerId: p.playerId,
        battingPracticeDays: 0,
        bowlingPracticeDays: 0,
        fieldingPracticeDays: 0,
        restDays: 0,
      },
  );
  const nextHistoricalPacks = input.lifecycle.historicalRosterPacks.some(
    (p) => p.sourceHash === nextPack.sourceHash,
  )
    ? input.lifecycle.historicalRosterPacks
    : [
        ...input.lifecycle.historicalRosterPacks.filter(
          (p) => !p.sourceText.includes(`-s${input.seasonNumber}-r`),
        ),
        nextPack,
      ];

  return sealPlayerLifecycleState({
    lifecycleVersion: input.lifecycle.lifecycleVersion,
    model: input.lifecycle.model,
    activeWorld: structuredClone(nextPack.world),
    activeRosterPack: nextPack,
    historicalRosterPacks: nextHistoricalPacks,
    skillLedger: [...ledgerMap.values()].sort((a, b) => a.playerId.localeCompare(b.playerId)),
    seasonTrainingExposure: nextExposure,
    retiredPlayers: input.lifecycle.retiredPlayers,
    youthAcademy: input.lifecycle.youthAcademy,
    transitions: input.lifecycle.transitions,
    squadRegistrationRevision: nextRegistrationRevision,
  });
}


export function registerPreSeasonYouthContract(input: {
  economy: SquadEconomyState;
  lifecycle: PlayerLifecycleState;
  promotedPlayer: Player;
  teamId: string;
  seasonNumber: number;
  calendarYear: number;
  currentDate: string;
}): SquadEconomyState {
  const economy = validateSquadEconomyState(input.economy, undefined, input.seasonNumber);
  const model = economy.model;
  assertEconomy(
    !economy.contracts.some((c) => c.playerId === input.promotedPlayer.playerId),
    `DUPLICATE_YOUTH_CONTRACT:${input.promotedPlayer.playerId}`,
  );
  const budget = economy.clubBudgets.find((b) => b.teamId === input.teamId);
  assertEconomy(Boolean(budget), `UNKNOWN_TEAM:${input.teamId}`);
  assertEconomy(
    budget!.availableWageSpaceK >= model.youthRookieAnnualWageK,
    `BUDGET_EXCEEDED_FOR_YOUTH_PROMOTION:${input.teamId}`,
  );

  const contractId = `ct-y-s${String(input.seasonNumber).padStart(3, "0")}-${input.promotedPlayer.playerId.replaceAll(/[^A-Za-z0-9]/g, "")}`.slice(0, 80);
  const newContract = PlayerContractSchema.parse({
    contractId,
    playerId: input.promotedPlayer.playerId,
    teamId: input.teamId,
    signedSeasonNumber: input.seasonNumber,
    startsSeasonNumber: input.seasonNumber,
    expiresAfterSeasonNumber: input.seasonNumber + 1,
    annualWageK: model.youthRookieAnnualWageK,
    origin: "YOUTH_GRADUATE",
    careerTeamIds: [input.teamId],
  });
  const nextContracts = [...economy.contracts, newContract].sort((a, b) =>
    a.playerId.localeCompare(b.playerId),
  );
  const deadCapMap = new Map(economy.clubBudgets.map((b) => [b.teamId, b.deadCapWagesK]));
  const nextBudgets = computeClubBudgets({
    teamIds: economy.clubBudgets.map((b) => b.teamId),
    seasonNumber: input.seasonNumber,
    contracts: nextContracts,
    offers: economy.negotiationWindow.offers,
    deadCapByTeam: deadCapMap,
    model,
  });
  const updatedTeamBudget = nextBudgets.find((b) => b.teamId === input.teamId)!;
  const nextLedger = [...economy.ledger];
  appendLedgerEntry(nextLedger, {
    seasonNumber: input.seasonNumber,
    calendarYear: input.calendarYear,
    date: input.currentDate,
    type: "YOUTH_ROOKIE_CONTRACT_SIGNED",
    teamId: input.teamId,
    playerId: input.promotedPlayer.playerId,
    contractId,
    offerId: null,
    annualWageK: model.youthRookieAnnualWageK,
    deadCapDeltaK: 0,
    termSeasons: 2,
    teamCommittedWagesAfterK: updatedTeamBudget.committedWagesK,
    teamDeadCapAfterK: updatedTeamBudget.deadCapWagesK,
    teamBudgetLimitK: model.annualClubWageBudgetK,
    summary: `Signed academy graduate ${input.promotedPlayer.name} to 2y rookie contract at $${model.youthRookieAnnualWageK}k/yr`,
  });

  const sealed = sealSquadEconomyState({
    economyVersion: SQUAD_ECONOMY_STATE_VERSION,
    model,
    contracts: nextContracts,
    freeAgents: economy.freeAgents,
    clubBudgets: nextBudgets,
    negotiationWindow: economy.negotiationWindow,
    ledger: nextLedger,
    appliedCommandIds: economy.appliedCommandIds,
    transitions: economy.transitions,
  });
  return validateSquadEconomyState(sealed, input.lifecycle, input.seasonNumber);
}

export function closeNegotiationWindowForMatchPlay(
  economyInput: SquadEconomyState,
  lifecycle: PlayerLifecycleState,
  seasonNumber: number,
): SquadEconomyState {
  const economy = validateSquadEconomyState(economyInput, lifecycle, seasonNumber);
  if (economy.negotiationWindow.windowPhase === "CLOSED") return economy;
  const closedOffers = economy.negotiationWindow.offers.map((offer) =>
    offer.status === "PENDING_ROUND" || offer.status === "COUNTERED"
      ? ContractOfferSchema.parse({
          ...offer,
          roundResolved: economy.negotiationWindow.currentRound,
          status: "REJECTED",
          reason: "PLAYER_NO_LONGER_ELIGIBLE",
          counterAnnualWageK: null,
          counterTermSeasons: null,
        })
      : offer,
  );
  const deadCapMap = new Map(economy.clubBudgets.map((b) => [b.teamId, b.deadCapWagesK]));
  const nextBudgets = computeClubBudgets({
    teamIds: economy.clubBudgets.map((b) => b.teamId),
    seasonNumber,
    contracts: economy.contracts,
    offers: closedOffers,
    deadCapByTeam: deadCapMap,
    model: economy.model,
  });
  return sealSquadEconomyState({
    economyVersion: SQUAD_ECONOMY_STATE_VERSION,
    model: economy.model,
    contracts: economy.contracts,
    freeAgents: economy.freeAgents,
    clubBudgets: nextBudgets,
    negotiationWindow: {
      ...economy.negotiationWindow,
      windowPhase: "CLOSED",
      offers: closedOffers,
    },
    ledger: economy.ledger,
    appliedCommandIds: economy.appliedCommandIds,
    transitions: economy.transitions,
  });
}

export function submitContractOffer(input: {
  economy: SquadEconomyState;
  lifecycle: PlayerLifecycleState;
  seasonNumber: number;
  calendarYear: number;
  currentDate: string;
  rawRequest: unknown;
  submittedBy?: "HUMAN_MANAGER" | "AI_CLUB";
  rationale?: string;
  recentStats?: readonly RecentPlayerSeasonStatsSummary[];
}): { economy: SquadEconomyState; duplicate: boolean; offer: ContractOffer | null } {
  const request = SubmitContractOfferRequestSchema.parse(input.rawRequest);
  const economy = validateSquadEconomyState(input.economy, input.lifecycle, input.seasonNumber);
  if (economy.appliedCommandIds.includes(request.commandId)) {
    const existingOffer =
      economy.negotiationWindow.offers.find((o) => o.commandId === request.commandId) ?? null;
    return { economy, duplicate: true, offer: existingOffer };
  }

  const model = economy.model;
  assertEconomy(
    request.annualWageK >= model.minAnnualWageK && request.annualWageK <= model.maxAnnualWageK,
    `WAGE_OUT_OF_BOUNDS:${request.annualWageK}`,
  );
  assertEconomy(
    request.termSeasons >= model.minContractTermSeasons &&
      request.termSeasons <= model.maxContractTermSeasons,
    `TERM_OUT_OF_BOUNDS:${request.termSeasons}`,
  );

  const team = input.lifecycle.activeWorld.teams.find((t) => t.teamId === request.offeringTeamId);
  assertEconomy(Boolean(team), `UNKNOWN_OFFERING_TEAM:${request.offeringTeamId}`);

  const contractsByPlayer = new Map(economy.contracts.map((c) => [c.playerId, c]));
  const deadCapMap = new Map(economy.clubBudgets.map((b) => [b.teamId, b.deadCapWagesK]));
  const currentBudget = economy.clubBudgets.find((b) => b.teamId === request.offeringTeamId)!;

  // Check if club has a COUNTERED offer for this same player that is being revised, or reject duplicate PENDING_ROUND
  const existingActiveOffer = economy.negotiationWindow.offers.find(
    (o) =>
      o.offeringTeamId === request.offeringTeamId &&
      o.playerId === request.playerId &&
      (o.status === "PENDING_ROUND" || o.status === "COUNTERED"),
  );
  if (existingActiveOffer && existingActiveOffer.status === "PENDING_ROUND") {
    throw new Error(`LC_SQUAD_ECONOMY_DUPLICATE_PENDING_OFFER:${request.playerId}`);
  }

  const { reservedWagesK, pendingFreeAgentSignings } = computePendingReservedForTeam(
    economy.negotiationWindow.offers,
    contractsByPlayer,
    request.offeringTeamId,
    existingActiveOffer?.offerId,
  );

  if (request.offerKind === "FREE_AGENT") {
    assertEconomy(
      economy.negotiationWindow.windowPhase === "OPEN",
      "NEGOTIATION_WINDOW_CLOSED_FOR_FREE_AGENTS",
    );
    const fa = economy.freeAgents.find((f) => f.playerId === request.playerId);
    assertEconomy(Boolean(fa), `UNKNOWN_FREE_AGENT:${request.playerId}`);
    if (
      fa!.restrictedFromSigningTeamId === request.offeringTeamId &&
      fa!.restrictedSeasonNumber === input.seasonNumber
    ) {
      throw new Error(`LC_SQUAD_ECONOMY_SAME_SEASON_RESIGN_BLOCKED:${request.playerId}`);
    }
    assertEconomy(
      team!.squadIds.length + pendingFreeAgentSignings + 1 <= MAX_ACTIVE_TEAM_SQUAD_SIZE,
      `SQUAD_MAX_EXCEEDED:${request.offeringTeamId}`,
    );
    const projectedTotal =
      currentBudget.committedWagesK + currentBudget.deadCapWagesK + reservedWagesK + request.annualWageK;
    assertEconomy(
      projectedTotal <= model.annualClubWageBudgetK,
      `BUDGET_EXCEEDED:${request.offeringTeamId}:${projectedTotal}>${model.annualClubWageBudgetK}`,
    );
  } else {
    const currentContract = contractsByPlayer.get(request.playerId);
    assertEconomy(
      Boolean(currentContract) && currentContract!.teamId === request.offeringTeamId,
      `PLAYER_NOT_CONTRACTED_TO_TEAM:${request.playerId}`,
    );
    assertEconomy(
      currentContract!.expiresAfterSeasonNumber === input.seasonNumber,
      `CONTRACT_NOT_IN_EXPIRY_YEAR:${request.playerId}:${currentContract!.expiresAfterSeasonNumber}`,
    );
    const incrementalWage = Math.max(0, request.annualWageK - currentContract!.annualWageK);
    const projectedTotal =
      currentBudget.committedWagesK + currentBudget.deadCapWagesK + reservedWagesK + incrementalWage;
    assertEconomy(
      projectedTotal <= model.annualClubWageBudgetK,
      `BUDGET_EXCEEDED:${request.offeringTeamId}:${projectedTotal}>${model.annualClubWageBudgetK}`,
    );
  }

  const offerSeq = economy.negotiationWindow.offers.length + 1;
  const offerId = `of-s${String(input.seasonNumber).padStart(3, "0")}-r${economy.negotiationWindow.currentRound}-${String(offerSeq).padStart(4, "0")}`;
  const rationale =
    input.rationale ??
    (request.offerKind === "FREE_AGENT"
      ? `Domestic free-agent bid ($${request.annualWageK}k/yr for ${request.termSeasons}y)`
      : `Expiring squad contract extension offer ($${request.annualWageK}k/yr for ${request.termSeasons}y)`);

  // If negotiation window is CLOSED and offerKind is RENEWAL (mid-season or post-Round-14 extension), resolve immediately!
  if (economy.negotiationWindow.windowPhase === "CLOSED" && request.offerKind === "RENEWAL") {
    const player = input.lifecycle.activeWorld.players.find((p) => p.playerId === request.playerId)!;
    const statsMap = new Map((input.recentStats ?? []).map((s) => [s.playerId, s]));
    const view = buildPublicMarketPlayerView(
      player,
      input.calendarYear,
      statsMap.get(request.playerId),
    );
    const askingWageK = estimatePlayerMarketWageK(view, model);
    const currentContract = contractsByPlayer.get(request.playerId)!;

    if (request.annualWageK >= askingWageK) {
      const updatedContract = PlayerContractSchema.parse({
        ...currentContract,
        contractId: `ct-ren-s${String(input.seasonNumber).padStart(3, "0")}-${offerSeq}`,
        signedSeasonNumber: input.seasonNumber,
        expiresAfterSeasonNumber: input.seasonNumber + request.termSeasons,
        annualWageK: request.annualWageK,
        origin: "RENEWAL",
      });
      const nextContracts = economy.contracts.map((c) =>
        c.playerId === request.playerId ? updatedContract : c,
      );
      const resolvedOffer = ContractOfferSchema.parse({
        offerId,
        commandId: request.commandId,
        seasonNumber: input.seasonNumber,
        roundSubmitted: economy.negotiationWindow.currentRound,
        roundResolved: economy.negotiationWindow.currentRound,
        offeringTeamId: request.offeringTeamId,
        submittedBy: input.submittedBy ?? "HUMAN_MANAGER",
        playerId: request.playerId,
        offerKind: "RENEWAL",
        annualWageK: request.annualWageK,
        termSeasons: request.termSeasons,
        status: "SIGNED",
        reason: "PLAYER_ACCEPTED_BEST_OFFER",
        counterAnnualWageK: null,
        counterTermSeasons: null,
        rationale,
      });
      const nextOffers = [...economy.negotiationWindow.offers, resolvedOffer];
      const nextBudgets = computeClubBudgets({
        teamIds: economy.clubBudgets.map((b) => b.teamId),
        seasonNumber: input.seasonNumber,
        contracts: nextContracts,
        offers: nextOffers,
        deadCapByTeam: deadCapMap,
        model,
      });
      const teamBudgetAfter = nextBudgets.find((b) => b.teamId === request.offeringTeamId)!;
      const nextLedger = [...economy.ledger];
      appendLedgerEntry(nextLedger, {
        seasonNumber: input.seasonNumber,
        calendarYear: input.calendarYear,
        date: input.currentDate,
        type: "CONTRACT_RENEWED",
        teamId: request.offeringTeamId,
        playerId: request.playerId,
        contractId: updatedContract.contractId,
        offerId,
        annualWageK: request.annualWageK,
        deadCapDeltaK: 0,
        termSeasons: request.termSeasons,
        teamCommittedWagesAfterK: teamBudgetAfter.committedWagesK,
        teamDeadCapAfterK: teamBudgetAfter.deadCapWagesK,
        teamBudgetLimitK: model.annualClubWageBudgetK,
        summary: `Renewed ${player.name} through Season ${updatedContract.expiresAfterSeasonNumber} at $${request.annualWageK}k/yr`,
      });
      const sealed = sealSquadEconomyState({
        economyVersion: SQUAD_ECONOMY_STATE_VERSION,
        model,
        contracts: nextContracts,
        freeAgents: economy.freeAgents,
        clubBudgets: nextBudgets,
        negotiationWindow: { ...economy.negotiationWindow, offers: nextOffers },
        ledger: nextLedger,
        appliedCommandIds: [...economy.appliedCommandIds, request.commandId],
        transitions: economy.transitions,
      });
      return { economy: sealed, duplicate: false, offer: resolvedOffer };
    }

    const rejectedOffer = ContractOfferSchema.parse({
      offerId,
      commandId: request.commandId,
      seasonNumber: input.seasonNumber,
      roundSubmitted: economy.negotiationWindow.currentRound,
      roundResolved: economy.negotiationWindow.currentRound,
      offeringTeamId: request.offeringTeamId,
      submittedBy: input.submittedBy ?? "HUMAN_MANAGER",
      playerId: request.playerId,
      offerKind: "RENEWAL",
      annualWageK: request.annualWageK,
      termSeasons: request.termSeasons,
      status: "REJECTED",
      reason: "WAGE_BELOW_RESERVATION",
      counterAnnualWageK: askingWageK,
      counterTermSeasons: preferredContractTermSeasons(view.ageYears),
      rationale: `${rationale} (player seeks $${askingWageK}k/yr)`,
    });
    const nextOffers = [...economy.negotiationWindow.offers, rejectedOffer];
    const sealed = sealSquadEconomyState({
      economyVersion: SQUAD_ECONOMY_STATE_VERSION,
      model,
      contracts: economy.contracts,
      freeAgents: economy.freeAgents,
      clubBudgets: economy.clubBudgets,
      negotiationWindow: { ...economy.negotiationWindow, offers: nextOffers },
      ledger: economy.ledger,
      appliedCommandIds: [...economy.appliedCommandIds, request.commandId],
      transitions: economy.transitions,
    });
    return { economy: sealed, duplicate: false, offer: rejectedOffer };
  }

  const pendingOffer = ContractOfferSchema.parse({
    offerId,
    commandId: request.commandId,
    seasonNumber: input.seasonNumber,
    roundSubmitted: economy.negotiationWindow.currentRound,
    roundResolved: null,
    offeringTeamId: request.offeringTeamId,
    submittedBy: input.submittedBy ?? "HUMAN_MANAGER",
    playerId: request.playerId,
    offerKind: request.offerKind,
    annualWageK: request.annualWageK,
    termSeasons: request.termSeasons,
    status: "PENDING_ROUND",
    reason: "AWAITING_ROUND_RESOLUTION",
    counterAnnualWageK: null,
    counterTermSeasons: null,
    rationale,
  });

  const updatedOffers = economy.negotiationWindow.offers.map((o) =>
    existingActiveOffer && o.offerId === existingActiveOffer.offerId
      ? ContractOfferSchema.parse({
          ...o,
          roundResolved: economy.negotiationWindow.currentRound,
          status: "WITHDRAWN",
          reason: "CLUB_WITHDREW_OFFER",
        })
      : o,
  );
  updatedOffers.push(pendingOffer);

  const nextBudgets = computeClubBudgets({
    teamIds: economy.clubBudgets.map((b) => b.teamId),
    seasonNumber: input.seasonNumber,
    contracts: economy.contracts,
    offers: updatedOffers,
    deadCapByTeam: deadCapMap,
    model,
  });

  const sealed = sealSquadEconomyState({
    economyVersion: SQUAD_ECONOMY_STATE_VERSION,
    model,
    contracts: economy.contracts,
    freeAgents: economy.freeAgents,
    clubBudgets: nextBudgets,
    negotiationWindow: {
      ...economy.negotiationWindow,
      offers: updatedOffers,
    },
    ledger: economy.ledger,
    appliedCommandIds: [...economy.appliedCommandIds, request.commandId],
    transitions: economy.transitions,
  });
  return { economy: sealed, duplicate: false, offer: pendingOffer };
}

export function withdrawContractOffer(input: {
  economy: SquadEconomyState;
  lifecycle: PlayerLifecycleState;
  seasonNumber: number;
  rawRequest: unknown;
}): { economy: SquadEconomyState; duplicate: boolean } {
  const request = WithdrawContractOfferRequestSchema.parse(input.rawRequest);
  const economy = validateSquadEconomyState(input.economy, input.lifecycle, input.seasonNumber);
  if (economy.appliedCommandIds.includes(request.commandId)) {
    return { economy, duplicate: true };
  }
  const target = economy.negotiationWindow.offers.find((o) => o.offerId === request.offerId);
  assertEconomy(Boolean(target), `UNKNOWN_OFFER:${request.offerId}`);
  assertEconomy(
    target!.offeringTeamId === request.offeringTeamId,
    `OFFER_TEAM_MISMATCH:${request.offerId}`,
  );
  assertEconomy(
    target!.status === "PENDING_ROUND" || target!.status === "COUNTERED",
    `OFFER_NOT_WITHDRAWABLE:${target!.status}`,
  );

  const nextOffers = economy.negotiationWindow.offers.map((o) =>
    o.offerId === request.offerId
      ? ContractOfferSchema.parse({
          ...o,
          roundResolved: economy.negotiationWindow.currentRound,
          status: "WITHDRAWN",
          reason: "CLUB_WITHDREW_OFFER",
          counterAnnualWageK: null,
          counterTermSeasons: null,
        })
      : o,
  );
  const deadCapMap = new Map(economy.clubBudgets.map((b) => [b.teamId, b.deadCapWagesK]));
  const nextBudgets = computeClubBudgets({
    teamIds: economy.clubBudgets.map((b) => b.teamId),
    seasonNumber: input.seasonNumber,
    contracts: economy.contracts,
    offers: nextOffers,
    deadCapByTeam: deadCapMap,
    model: economy.model,
  });

  const sealed = sealSquadEconomyState({
    economyVersion: SQUAD_ECONOMY_STATE_VERSION,
    model: economy.model,
    contracts: economy.contracts,
    freeAgents: economy.freeAgents,
    clubBudgets: nextBudgets,
    negotiationWindow: { ...economy.negotiationWindow, offers: nextOffers },
    ledger: economy.ledger,
    appliedCommandIds: [...economy.appliedCommandIds, request.commandId],
    transitions: economy.transitions,
  });
  return { economy: sealed, duplicate: false };
}

export function acceptCounterOffer(input: {
  economy: SquadEconomyState;
  lifecycle: PlayerLifecycleState;
  worldId: string;
  seasonNumber: number;
  calendarYear: number;
  currentDate: string;
  rawRequest: unknown;
}): { economy: SquadEconomyState; lifecycle: PlayerLifecycleState; duplicate: boolean; rosterChanged: boolean } {
  const request = AcceptCounterOfferRequestSchema.parse(input.rawRequest);
  const economy = validateSquadEconomyState(input.economy, input.lifecycle, input.seasonNumber);
  if (economy.appliedCommandIds.includes(request.commandId)) {
    return { economy, lifecycle: input.lifecycle, duplicate: true, rosterChanged: false };
  }
  assertEconomy(
    economy.negotiationWindow.windowPhase === "OPEN",
    "NEGOTIATION_WINDOW_CLOSED",
  );
  const offer = economy.negotiationWindow.offers.find((o) => o.offerId === request.offerId);
  assertEconomy(Boolean(offer), `UNKNOWN_OFFER:${request.offerId}`);
  assertEconomy(offer!.offeringTeamId === request.offeringTeamId, "OFFER_TEAM_MISMATCH");
  assertEconomy(
    offer!.status === "COUNTERED" &&
      offer!.counterAnnualWageK !== null &&
      offer!.counterTermSeasons !== null,
    `OFFER_NOT_IN_COUNTERED_STATE:${offer!.status}`,
  );

  const agreedWageK = offer!.counterAnnualWageK!;
  const agreedTerm = offer!.counterTermSeasons!;
  const model = economy.model;
  const deadCapMap = new Map(economy.clubBudgets.map((b) => [b.teamId, b.deadCapWagesK]));
  const contractsByPlayer = new Map(economy.contracts.map((c) => [c.playerId, c]));
  const { reservedWagesK, pendingFreeAgentSignings } = computePendingReservedForTeam(
    economy.negotiationWindow.offers,
    contractsByPlayer,
    request.offeringTeamId,
    offer!.offerId,
  );
  const currentBudget = economy.clubBudgets.find((b) => b.teamId === request.offeringTeamId)!;

  let nextLifecycle = input.lifecycle;
  let nextContracts = [...economy.contracts];
  let nextFreeAgents = [...economy.freeAgents];
  let rosterChanged = false;
  let signedPlayerName = offer!.playerId;
  let signedContractId = "";
  let ledgerType: EconomyTransactionType = "CONTRACT_RENEWED";

  if (offer!.offerKind === "FREE_AGENT") {
    const fa = economy.freeAgents.find((f) => f.playerId === offer!.playerId);
    assertEconomy(Boolean(fa), `PLAYER_ALREADY_SIGNED_OR_UNAVAILABLE:${offer!.playerId}`);
    const team = nextLifecycle.activeWorld.teams.find((t) => t.teamId === request.offeringTeamId)!;
    assertEconomy(
      team.squadIds.length + pendingFreeAgentSignings + 1 <= MAX_ACTIVE_TEAM_SQUAD_SIZE,
      `SQUAD_MAX_EXCEEDED:${request.offeringTeamId}`,
    );
    assertEconomy(
      currentBudget.committedWagesK + currentBudget.deadCapWagesK + reservedWagesK + agreedWageK <=
        model.annualClubWageBudgetK,
      `BUDGET_EXCEEDED:${request.offeringTeamId}`,
    );

    signedPlayerName = fa!.player.name;
    signedContractId = `ct-fa-s${String(input.seasonNumber).padStart(3, "0")}-${offer!.offerId.slice(-6)}`;
    ledgerType = "FREE_AGENT_SIGNED";
    const newContract = PlayerContractSchema.parse({
      contractId: signedContractId,
      playerId: fa!.playerId,
      teamId: request.offeringTeamId,
      signedSeasonNumber: input.seasonNumber,
      startsSeasonNumber: input.seasonNumber,
      expiresAfterSeasonNumber: input.seasonNumber + agreedTerm - 1,
      annualWageK: agreedWageK,
      origin: "FREE_AGENT_SIGNING",
      careerTeamIds: uniqueCareerTeams(fa!.careerTeamIds, request.offeringTeamId),
    });
    nextContracts.push(newContract);
    nextFreeAgents = nextFreeAgents.filter((f) => f.playerId !== fa!.playerId);

    const nextTeams = nextLifecycle.activeWorld.teams.map((t) =>
      t.teamId === request.offeringTeamId
        ? { ...t, squadIds: [...t.squadIds, fa!.playerId] }
        : structuredClone(t),
    );
    nextLifecycle = syncLifecycleWithWorldRosterMutation({
      lifecycle: nextLifecycle,
      worldId: input.worldId,
      seasonNumber: input.seasonNumber,
      nextTeams,
      nextPlayers: [...nextLifecycle.activeWorld.players, structuredClone(fa!.player)],
      addedPlayers: [fa!.player],
    });
    rosterChanged = true;
  } else {
    const existing = contractsByPlayer.get(offer!.playerId);
    assertEconomy(
      Boolean(existing) &&
        existing!.teamId === request.offeringTeamId &&
        existing!.expiresAfterSeasonNumber === input.seasonNumber,
      `RENEWAL_NO_LONGER_ELIGIBLE:${offer!.playerId}`,
    );
    const inc = Math.max(0, agreedWageK - existing!.annualWageK);
    assertEconomy(
      currentBudget.committedWagesK + currentBudget.deadCapWagesK + reservedWagesK + inc <=
        model.annualClubWageBudgetK,
      `BUDGET_EXCEEDED:${request.offeringTeamId}`,
    );
    const player = nextLifecycle.activeWorld.players.find((p) => p.playerId === offer!.playerId)!;
    signedPlayerName = player.name;
    signedContractId = `ct-ren-s${String(input.seasonNumber).padStart(3, "0")}-${offer!.offerId.slice(-6)}`;
    const updatedContract = PlayerContractSchema.parse({
      ...existing!,
      contractId: signedContractId,
      signedSeasonNumber: input.seasonNumber,
      expiresAfterSeasonNumber: input.seasonNumber + agreedTerm,
      annualWageK: agreedWageK,
      origin: "RENEWAL",
    });
    nextContracts = nextContracts.map((c) =>
      c.playerId === offer!.playerId ? updatedContract : c,
    );
  }

  const nextOffers = economy.negotiationWindow.offers.map((o) => {
    if (o.offerId === offer!.offerId) {
      return ContractOfferSchema.parse({
        ...o,
        annualWageK: agreedWageK,
        termSeasons: agreedTerm,
        roundResolved: economy.negotiationWindow.currentRound,
        status: "SIGNED",
        reason: "PLAYER_ACCEPTED_BEST_OFFER",
        counterAnnualWageK: null,
        counterTermSeasons: null,
      });
    }
    if (
      o.playerId === offer!.playerId &&
      (o.status === "PENDING_ROUND" || o.status === "COUNTERED")
    ) {
      return ContractOfferSchema.parse({
        ...o,
        roundResolved: economy.negotiationWindow.currentRound,
        status: "REJECTED",
        reason: "SIGNED_WITH_COMPETING_CLUB",
        counterAnnualWageK: null,
        counterTermSeasons: null,
      });
    }
    return o;
  });

  nextContracts.sort((a, b) => a.playerId.localeCompare(b.playerId));
  const nextBudgets = computeClubBudgets({
    teamIds: economy.clubBudgets.map((b) => b.teamId),
    seasonNumber: input.seasonNumber,
    contracts: nextContracts,
    offers: nextOffers,
    deadCapByTeam: deadCapMap,
    model,
  });
  const teamBudgetAfter = nextBudgets.find((b) => b.teamId === request.offeringTeamId)!;
  const nextLedger = [...economy.ledger];
  appendLedgerEntry(nextLedger, {
    seasonNumber: input.seasonNumber,
    calendarYear: input.calendarYear,
    date: input.currentDate,
    type: ledgerType,
    teamId: request.offeringTeamId,
    playerId: offer!.playerId,
    contractId: signedContractId,
    offerId: offer!.offerId,
    annualWageK: agreedWageK,
    deadCapDeltaK: 0,
    termSeasons: agreedTerm,
    teamCommittedWagesAfterK: teamBudgetAfter.committedWagesK,
    teamDeadCapAfterK: teamBudgetAfter.deadCapWagesK,
    teamBudgetLimitK: model.annualClubWageBudgetK,
    summary: `Accepted counter-offer with ${signedPlayerName}: $${agreedWageK}k/yr (${agreedTerm}y)`,
  });

  const sealed = sealSquadEconomyState({
    economyVersion: SQUAD_ECONOMY_STATE_VERSION,
    model,
    contracts: nextContracts,
    freeAgents: nextFreeAgents,
    clubBudgets: nextBudgets,
    negotiationWindow: { ...economy.negotiationWindow, offers: nextOffers },
    ledger: nextLedger,
    appliedCommandIds: [...economy.appliedCommandIds, request.commandId],
    transitions: economy.transitions,
  });
  return {
    economy: validateSquadEconomyState(sealed, nextLifecycle, input.seasonNumber),
    lifecycle: nextLifecycle,
    duplicate: false,
    rosterChanged,
  };
}

export function releaseContractedPlayer(input: {
  economy: SquadEconomyState;
  lifecycle: PlayerLifecycleState;
  worldId: string;
  seasonNumber: number;
  calendarYear: number;
  currentDate: string;
  rawRequest: unknown;
  recentStats?: readonly RecentPlayerSeasonStatsSummary[];
}): { economy: SquadEconomyState; lifecycle: PlayerLifecycleState; duplicate: boolean } {
  const request = ReleaseContractedPlayerRequestSchema.parse(input.rawRequest);
  const economy = validateSquadEconomyState(input.economy, input.lifecycle, input.seasonNumber);
  if (economy.appliedCommandIds.includes(request.commandId)) {
    return { economy, lifecycle: input.lifecycle, duplicate: true };
  }
  assertEconomy(
    economy.negotiationWindow.windowPhase === "OPEN",
    "CANNOT_RELEASE_AFTER_PRESEASON_WINDOW_CLOSED",
  );
  const contract = economy.contracts.find((c) => c.playerId === request.playerId);
  assertEconomy(
    Boolean(contract) && contract!.teamId === request.teamId,
    `PLAYER_NOT_CONTRACTED_TO_TEAM:${request.playerId}`,
  );

  const team = input.lifecycle.activeWorld.teams.find((t) => t.teamId === request.teamId)!;
  assertEconomy(
    team.squadIds.length - 1 >= MIN_ACTIVE_TEAM_SQUAD_SIZE,
    `RELEASE_WOULD_BREACH_MIN_SQUAD_SIZE:${request.teamId}`,
  );
  const playerById = new Map(input.lifecycle.activeWorld.players.map((p) => [p.playerId, p]));
  const releasedPlayer = playerById.get(request.playerId)!;
  const remainingPlayers = team.squadIds
    .filter((id) => id !== request.playerId)
    .map((id) => playerById.get(id)!);
  assertEconomy(
    remainingPlayers.some((p) => p.role === "KEEPER"),
    `RELEASE_WOULD_REMOVE_LAST_KEEPER:${request.teamId}`,
  );
  assertEconomy(
    remainingPlayers.filter(isBowlingCapable).length >= 6,
    `RELEASE_WOULD_BREACH_BOWLING_FLOOR:${request.teamId}`,
  );

  const model = economy.model;
  const buyoutDeadCapK = Math.ceil((contract!.annualWageK * model.releaseBuyoutPercent) / 100);
  const deadCapMap = new Map(economy.clubBudgets.map((b) => [b.teamId, b.deadCapWagesK]));
  deadCapMap.set(request.teamId, (deadCapMap.get(request.teamId) ?? 0) + buyoutDeadCapK);

  const statsMap = new Map((input.recentStats ?? []).map((s) => [s.playerId, s]));
  const view = buildPublicMarketPlayerView(
    releasedPlayer,
    input.calendarYear,
    statsMap.get(request.playerId),
  );
  const newFreeAgent = FreeAgentRecordSchema.parse({
    playerId: releasedPlayer.playerId,
    player: structuredClone(releasedPlayer),
    enteredMarketSeasonNumber: input.seasonNumber,
    enteredReason: "CLUB_RELEASED",
    previousTeamId: request.teamId,
    careerTeamIds: [...contract!.careerTeamIds],
    restrictedFromSigningTeamId: request.teamId,
    restrictedSeasonNumber: input.seasonNumber,
    askingAnnualWageK: estimatePlayerMarketWageK(view, model),
    preferredTermSeasons: preferredContractTermSeasons(view.ageYears),
  });

  const nextContracts = economy.contracts.filter((c) => c.playerId !== request.playerId);
  const nextFreeAgents = [...economy.freeAgents, newFreeAgent].sort((a, b) =>
    a.playerId.localeCompare(b.playerId),
  );
  // Withdraw any pending renewal offer for the released player
  const nextOffers = economy.negotiationWindow.offers.map((o) =>
    o.playerId === request.playerId && (o.status === "PENDING_ROUND" || o.status === "COUNTERED")
      ? ContractOfferSchema.parse({
          ...o,
          roundResolved: economy.negotiationWindow.currentRound,
          status: "WITHDRAWN",
          reason: "CLUB_WITHDREW_OFFER",
          counterAnnualWageK: null,
          counterTermSeasons: null,
        })
      : o,
  );

  const nextTeams = input.lifecycle.activeWorld.teams.map((t) =>
    t.teamId === request.teamId
      ? { ...t, squadIds: t.squadIds.filter((id) => id !== request.playerId) }
      : structuredClone(t),
  );
  const nextLifecycle = syncLifecycleWithWorldRosterMutation({
    lifecycle: input.lifecycle,
    worldId: input.worldId,
    seasonNumber: input.seasonNumber,
    nextTeams,
    nextPlayers: input.lifecycle.activeWorld.players.filter(
      (p) => p.playerId !== request.playerId,
    ),
    addedPlayers: [],
  });

  const nextBudgets = computeClubBudgets({
    teamIds: economy.clubBudgets.map((b) => b.teamId),
    seasonNumber: input.seasonNumber,
    contracts: nextContracts,
    offers: nextOffers,
    deadCapByTeam: deadCapMap,
    model,
  });
  const teamBudgetAfter = nextBudgets.find((b) => b.teamId === request.teamId)!;
  const nextLedger = [...economy.ledger];
  appendLedgerEntry(nextLedger, {
    seasonNumber: input.seasonNumber,
    calendarYear: input.calendarYear,
    date: input.currentDate,
    type: "CONTRACT_RELEASE_BUYOUT",
    teamId: request.teamId,
    playerId: request.playerId,
    contractId: contract!.contractId,
    offerId: null,
    annualWageK: 0,
    deadCapDeltaK: buyoutDeadCapK,
    termSeasons: 0,
    teamCommittedWagesAfterK: teamBudgetAfter.committedWagesK,
    teamDeadCapAfterK: teamBudgetAfter.deadCapWagesK,
    teamBudgetLimitK: model.annualClubWageBudgetK,
    summary: `Released ${releasedPlayer.name} to Free Agency ($${buyoutDeadCapK}k current-season buyout dead cap; same-season re-sign blocked)`,
  });

  const sealed = sealSquadEconomyState({
    economyVersion: SQUAD_ECONOMY_STATE_VERSION,
    model,
    contracts: nextContracts,
    freeAgents: nextFreeAgents,
    clubBudgets: nextBudgets,
    negotiationWindow: { ...economy.negotiationWindow, offers: nextOffers },
    ledger: nextLedger,
    appliedCommandIds: [...economy.appliedCommandIds, request.commandId],
    transitions: economy.transitions,
  });
  return {
    economy: validateSquadEconomyState(sealed, nextLifecycle, input.seasonNumber),
    lifecycle: nextLifecycle,
    duplicate: false,
  };
}

/**
 * Generates symmetrical AI club contract renewal & free-agent bids for the current negotiation round
 * using ONLY public player skills, age, role, and recorded T20 season stats (`PublicMarketPlayerView`).
 */
function submitSymmetricalAiClubOffersForRound(input: {
  economy: SquadEconomyState;
  lifecycle: PlayerLifecycleState;
  worldIdentity: PersistentWorldIdentity;
  controlledTeamId: string | null;
  seasonNumber: number;
  calendarYear: number;
  currentDate: string;
  recentStats: readonly RecentPlayerSeasonStatsSummary[];
}): SquadEconomyState {
  let currentEconomy = input.economy;
  const statsMap = new Map(input.recentStats.map((s) => [s.playerId, s]));
  const playerById = new Map(input.lifecycle.activeWorld.players.map((p) => [p.playerId, p]));
  const rng = createRandomService();
  const round = currentEconomy.negotiationWindow.currentRound;
  const seed = `${input.worldIdentity.baseSeed}:econ-ai-s${input.seasonNumber}-r${round}`.slice(0, 256);

  const aiTeams = [...input.lifecycle.activeWorld.teams]
    .filter((t) => t.teamId !== input.controlledTeamId)
    .sort((a, b) => a.teamId.localeCompare(b.teamId));

  for (const team of aiTeams) {
    let drawIdx = 0;
    const roll = (span: number) =>
      rng.uint32({
        seed,
        domain: "CAREER_TRAINING",
        entityId: team.teamId,
        eventOrdinal: round,
        stageName: "ai_recruitment",
        drawIndex: drawIdx++,
      }) % span;

    const squadViews = team.squadIds.map((pid) =>
      buildPublicMarketPlayerView(playerById.get(pid)!, input.calendarYear, statsMap.get(pid)),
    );
    const contractsByPlayer = new Map(currentEconomy.contracts.map((c) => [c.playerId, c]));

    // 1. Accept affordable pending COUNTERED offers from prior round if value still fits need & budget
    const counteredForClub = currentEconomy.negotiationWindow.offers.filter(
      (o) => o.offeringTeamId === team.teamId && o.status === "COUNTERED",
    );
    for (const cOffer of counteredForClub) {
      // Re-submit at counter terms if budget allows
      const budgetNow = currentEconomy.clubBudgets.find((b) => b.teamId === team.teamId)!;
      const counterWage = cOffer.counterAnnualWageK ?? cOffer.annualWageK;
      const counterTerm = cOffer.counterTermSeasons ?? cOffer.termSeasons;
      if (counterWage <= budgetNow.availableWageSpaceK + cOffer.annualWageK) {
        try {
          currentEconomy = submitContractOffer({
            economy: currentEconomy,
            lifecycle: input.lifecycle,
            seasonNumber: input.seasonNumber,
            calendarYear: input.calendarYear,
            currentDate: input.currentDate,
            submittedBy: "AI_CLUB",
            rationale: `AI club ${team.teamId} matched counter-terms ($${counterWage}k/yr)`,
            recentStats: input.recentStats,
            rawRequest: {
              command: "SUBMIT_CONTRACT_OFFER",
              commandId: `ai-rev-s${input.seasonNumber}-r${round}-${team.teamId}-${cOffer.playerId}`.slice(0, 80),
              offeringTeamId: team.teamId,
              playerId: cOffer.playerId,
              offerKind: cOffer.offerKind,
              annualWageK: counterWage,
              termSeasons: counterTerm,
            },
          }).economy;
        } catch {
          /* skip if roster/budget constrained */
        }
      }
    }

    // 2. Expiring starter renewals (up to 1 per round so rounds 1..3 show realistic progression)
    const securedKeepers = squadViews.filter(
      (v) =>
        v.role === "KEEPER" &&
        (contractsByPlayer.get(v.playerId)?.expiresAfterSeasonNumber ?? 0) > input.seasonNumber,
    ).length;
    const expiringViews = squadViews
      .filter((v) => {
        const c = contractsByPlayer.get(v.playerId);
        const alreadyOffered = currentEconomy.negotiationWindow.offers.some(
          (o) =>
            o.offeringTeamId === team.teamId &&
            o.playerId === v.playerId &&
            (o.status === "PENDING_ROUND" || o.status === "SIGNED"),
        );
        return c?.expiresAfterSeasonNumber === input.seasonNumber && !alreadyOffered && v.ageYears <= 34;
      })
      .sort((a, b) => {
        const needA = a.role === "KEEPER" && securedKeepers < 1 ? 20 : 0;
        const needB = b.role === "KEEPER" && securedKeepers < 1 ? 20 : 0;
        return (
          publicPlayerRoleRating(b) + needB - (publicPlayerRoleRating(a) + needA) ||
          a.playerId.localeCompare(b.playerId)
        );
      });

    if (expiringViews.length > 0) {
      const topExpiring = expiringViews[0]!;
      const ask = estimatePlayerMarketWageK(topExpiring, currentEconomy.model);
      const bid = Math.max(
        currentEconomy.model.minAnnualWageK,
        round === 1 && roll(100) < 35 ? Math.ceil(ask * 0.92) : ask,
      );
      const term = preferredContractTermSeasons(topExpiring.ageYears);
      try {
        currentEconomy = submitContractOffer({
          economy: currentEconomy,
          lifecycle: input.lifecycle,
          seasonNumber: input.seasonNumber,
          calendarYear: input.calendarYear,
          currentDate: input.currentDate,
          submittedBy: "AI_CLUB",
          rationale: `AI squad retention for core ${topExpiring.role.toLowerCase()} (public T20 rating ${publicPlayerRoleRating(topExpiring)})`,
          recentStats: input.recentStats,
          rawRequest: {
            command: "SUBMIT_CONTRACT_OFFER",
            commandId: `ai-ren-s${input.seasonNumber}-r${round}-${team.teamId}-${topExpiring.playerId}`.slice(0, 80),
            offeringTeamId: team.teamId,
            playerId: topExpiring.playerId,
            offerKind: "RENEWAL",
            annualWageK: bid,
            termSeasons: term,
          },
        }).economy;
      } catch {
        /* budget full */
      }
    }

    // 3. Free-agent recruitment strictly by public squad needs & observable rating
    const budgetAfterRenew = currentEconomy.clubBudgets.find((b) => b.teamId === team.teamId)!;
    const currentKeepers = squadViews.filter((v) => v.role === "KEEPER").length;
    const currentBowlers = squadViews.filter(
      (v) => v.role === "BOWLER" || v.role === "ALLROUNDER" || v.bowlingStyle !== null,
    ).length;
    const sortedStarterRatings = squadViews
      .map((v) => publicPlayerRoleRating(v))
      .sort((a, b) => b - a);
    const eleventhStarterRating = sortedStarterRatings[10] ?? 58;

    const needsKeeper = currentKeepers < 2;
    const needsBowler = currentBowlers < 7;
    const needsDepth = team.squadIds.length < TARGET_ACTIVE_TEAM_SQUAD_SIZE;

    if (team.squadIds.length < MAX_ACTIVE_TEAM_SQUAD_SIZE && budgetAfterRenew.availableWageSpaceK >= currentEconomy.model.minAnnualWageK + 40) {
      const candidateFAs = currentEconomy.freeAgents
        .filter((fa) => {
          if (
            fa.restrictedFromSigningTeamId === team.teamId &&
            fa.restrictedSeasonNumber === input.seasonNumber
          ) {
            return false;
          }
          const alreadyBid = currentEconomy.negotiationWindow.offers.some(
            (o) =>
              o.offeringTeamId === team.teamId &&
              o.playerId === fa.playerId &&
              (o.status === "PENDING_ROUND" || o.status === "SIGNED"),
          );
          if (alreadyBid) return false;
          if (fa.askingAnnualWageK + 15 > budgetAfterRenew.availableWageSpaceK) return false;
          const view = buildPublicMarketPlayerView(
            fa.player,
            input.calendarYear,
            statsMap.get(fa.playerId),
          );
          const rating = publicPlayerRoleRating(view);
          if (needsKeeper && view.role === "KEEPER") return true;
          if (needsBowler && (view.role === "BOWLER" || view.role === "ALLROUNDER")) return true;
          if (needsDepth && rating >= 56) return true;
          return rating >= eleventhStarterRating + 3;
        })
        .map((fa) => {
          const view = buildPublicMarketPlayerView(
            fa.player,
            input.calendarYear,
            statsMap.get(fa.playerId),
          );
          const rating = publicPlayerRoleRating(view);
          const needBonus =
            needsKeeper && view.role === "KEEPER"
              ? 18
              : needsBowler && (view.role === "BOWLER" || view.role === "ALLROUNDER")
                ? 12
                : needsDepth
                  ? 6
                  : 0;
          return { fa, view, score: rating + needBonus };
        })
        .sort((a, b) => b.score - a.score || a.fa.playerId.localeCompare(b.fa.playerId));

      if (candidateFAs.length > 0 && (needsKeeper || needsBowler || needsDepth || roll(100) < 65)) {
        const pickIdx = candidateFAs.length > 1 && roll(100) < 30 ? 1 : 0;
        const target = candidateFAs[pickIdx]!;
        const premium = roll(3) * 5; // 0, +5k, or +10k competitive bid
        const bidWage = Math.min(
          budgetAfterRenew.availableWageSpaceK,
          Math.min(currentEconomy.model.maxAnnualWageK, target.fa.askingAnnualWageK + premium),
        );
        const needReason =
          needsKeeper && target.view.role === "KEEPER"
            ? "keeper cover"
            : needsBowler && (target.view.role === "BOWLER" || target.view.role === "ALLROUNDER")
              ? "bowling attack depth"
              : needsDepth
                ? "squad depth"
                : "starting XI upgrade";
        try {
          currentEconomy = submitContractOffer({
            economy: currentEconomy,
            lifecycle: input.lifecycle,
            seasonNumber: input.seasonNumber,
            calendarYear: input.calendarYear,
            currentDate: input.currentDate,
            submittedBy: "AI_CLUB",
            rationale: `AI recruitment for ${needReason} (public T20 rating ${publicPlayerRoleRating(target.view)})`,
            recentStats: input.recentStats,
            rawRequest: {
              command: "SUBMIT_CONTRACT_OFFER",
              commandId: `ai-fa-s${input.seasonNumber}-r${round}-${team.teamId}-${target.fa.playerId}`.slice(0, 80),
              offeringTeamId: team.teamId,
              playerId: target.fa.playerId,
              offerKind: "FREE_AGENT",
              annualWageK: bidWage,
              termSeasons: target.fa.preferredTermSeasons,
            },
          }).economy;
        } catch {
          /* cap/squad full */
        }
      }
    }
  }
  return currentEconomy;
}

export function resolveNegotiationRound(input: {
  economy: SquadEconomyState;
  lifecycle: PlayerLifecycleState;
  worldIdentity: PersistentWorldIdentity;
  controlledTeamId: string | null;
  seasonNumber: number;
  calendarYear: number;
  currentDate: string;
  rawRequest: unknown;
  recentStats?: readonly RecentPlayerSeasonStatsSummary[];
}): {
  economy: SquadEconomyState;
  lifecycle: PlayerLifecycleState;
  duplicate: boolean;
  rosterChanged: boolean;
  signedOffers: ContractOffer[];
  counteredOffers: ContractOffer[];
} {
  const request = ResolveNegotiationRoundRequestSchema.parse(input.rawRequest);
  let economy = validateSquadEconomyState(input.economy, input.lifecycle, input.seasonNumber);
  if (economy.appliedCommandIds.includes(request.commandId)) {
    return {
      economy,
      lifecycle: input.lifecycle,
      duplicate: true,
      rosterChanged: false,
      signedOffers: [],
      counteredOffers: [],
    };
  }
  assertEconomy(request.seasonNumber === input.seasonNumber, "SEASON_NUMBER_MISMATCH");
  assertEconomy(economy.negotiationWindow.windowPhase === "OPEN", "NEGOTIATION_WINDOW_CLOSED");
  assertEconomy(
    economy.negotiationWindow.currentRound === request.expectedRound,
    `NEGOTIATION_ROUND_MISMATCH:${request.expectedRound}!=${economy.negotiationWindow.currentRound}`,
  );

  const recentStats = input.recentStats ?? [];
  economy = submitSymmetricalAiClubOffersForRound({
    economy,
    lifecycle: input.lifecycle,
    worldIdentity: input.worldIdentity,
    controlledTeamId: input.controlledTeamId,
    seasonNumber: input.seasonNumber,
    calendarYear: input.calendarYear,
    currentDate: input.currentDate,
    recentStats,
  });

  const round = economy.negotiationWindow.currentRound;
  const model = economy.model;
  const statsMap = new Map(recentStats.map((s) => [s.playerId, s]));
  const deadCapMap = new Map(economy.clubBudgets.map((b) => [b.teamId, b.deadCapWagesK]));

  let nextContracts = [...economy.contracts];
  let nextFreeAgents = [...economy.freeAgents];
  const nextOffers = [...economy.negotiationWindow.offers];
  const nextLedger = [...economy.ledger];
  let nextTeams = input.lifecycle.activeWorld.teams.map((t) => ({
    ...structuredClone(t),
    squadIds: [...t.squadIds],
  }));
  const nextPlayers = [...input.lifecycle.activeWorld.players.map((p) => structuredClone(p))];
  const addedPlayers: Player[] = [];
  let rosterChanged = false;
  const signedOffers: ContractOffer[] = [];
  const counteredOffers: ContractOffer[] = [];

  // Expire any stale COUNTERED offers from an earlier round that the club chose not to accept or revise
  for (let i = 0; i < nextOffers.length; i += 1) {
    const o = nextOffers[i]!;
    if (o.status === "COUNTERED" && o.roundSubmitted < round) {
      nextOffers[i] = ContractOfferSchema.parse({
        ...o,
        roundResolved: round,
        status: "REJECTED",
        reason: "WAGE_BELOW_RESERVATION",
        counterAnnualWageK: null,
        counterTermSeasons: null,
      });
    }
  }

  // Group PENDING_ROUND offers by playerId deterministically
  const pendingPlayerIds = [
    ...new Set(
      nextOffers.filter((o) => o.status === "PENDING_ROUND").map((o) => o.playerId),
    ),
  ].sort((a, b) => a.localeCompare(b));

  let contractSeq = nextLedger.length + 1;

  for (const playerId of pendingPlayerIds) {
    const candidateIndices = nextOffers
      .map((o, idx) => ({ o, idx }))
      .filter((item) => item.o.playerId === playerId && item.o.status === "PENDING_ROUND");

    const fa = nextFreeAgents.find((f) => f.playerId === playerId);
    const activeContract = nextContracts.find((c) => c.playerId === playerId);
    const activePlayer = nextPlayers.find((p) => p.playerId === playerId);

    if (!fa && !activeContract) {
      for (const { o, idx } of candidateIndices) {
        nextOffers[idx] = ContractOfferSchema.parse({
          ...o,
          roundResolved: round,
          status: "REJECTED",
          reason: "PLAYER_NO_LONGER_ELIGIBLE",
        });
      }
      continue;
    }

    const targetPlayer = fa ? fa.player : activePlayer!;
    const view = buildPublicMarketPlayerView(
      targetPlayer,
      input.calendarYear,
      statsMap.get(playerId),
    );
    const askingWageK = fa ? fa.askingAnnualWageK : estimatePlayerMarketWageK(view, model);
    const preferredTerm = fa
      ? fa.preferredTermSeasons
      : preferredContractTermSeasons(view.ageYears);

    // Rank offers by effective player preference: wage * 100 + term match bonus + incumbency bonus + deterministic tiebreak
    const scored = candidateIndices
      .map(({ o, idx }) => {
        const incumbencyBonus =
          o.offerKind === "RENEWAL" || (fa && fa.previousTeamId === o.offeringTeamId) ? 350 : 0;
        const termBonus = o.termSeasons === preferredTerm ? 150 : 0;
        const tieHash = sha256Hex(
          new TextEncoder().encode(`${input.worldIdentity.baseSeed}:${round}:${playerId}:${o.offeringTeamId}`),
        );
        return {
          o,
          idx,
          score: o.annualWageK * 100 + incumbencyBonus + termBonus,
          tieHash,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.tieHash.localeCompare(b.tieHash) ||
          a.o.offerId.localeCompare(b.o.offerId),
      );

    // Find highest acceptable offer that still fits club budget & squad capacity
    let winningEntry: (typeof scored)[number] | null = null;
    for (const cand of scored) {
      if (cand.o.annualWageK < askingWageK) continue;
      const teamRow = nextTeams.find((t) => t.teamId === cand.o.offeringTeamId)!;
      const teamCommittedNow = nextContracts
        .filter((c) => c.teamId === cand.o.offeringTeamId)
        .reduce((sum, c) => sum + c.annualWageK, 0);
      const teamDeadNow = deadCapMap.get(cand.o.offeringTeamId) ?? 0;

      if (cand.o.offerKind === "FREE_AGENT") {
        if (!fa) continue;
        if (teamRow.squadIds.length >= MAX_ACTIVE_TEAM_SQUAD_SIZE) continue;
        if (teamCommittedNow + teamDeadNow + cand.o.annualWageK > model.annualClubWageBudgetK) continue;
        winningEntry = cand;
        break;
      } else {
        if (
          !activeContract ||
          activeContract.teamId !== cand.o.offeringTeamId ||
          activeContract.expiresAfterSeasonNumber !== input.seasonNumber
        ) {
          continue;
        }
        const inc = Math.max(0, cand.o.annualWageK - activeContract.annualWageK);
        if (teamCommittedNow + teamDeadNow + inc > model.annualClubWageBudgetK) continue;
        winningEntry = cand;
        break;
      }
    }

    if (winningEntry) {
      const winOffer = winningEntry.o;
      const contractId = `ct-s${String(input.seasonNumber).padStart(3, "0")}-${String(contractSeq++).padStart(4, "0")}`;
      if (winOffer.offerKind === "FREE_AGENT" && fa) {
        const newContract = PlayerContractSchema.parse({
          contractId,
          playerId: fa.playerId,
          teamId: winOffer.offeringTeamId,
          signedSeasonNumber: input.seasonNumber,
          startsSeasonNumber: input.seasonNumber,
          expiresAfterSeasonNumber: input.seasonNumber + winOffer.termSeasons - 1,
          annualWageK: winOffer.annualWageK,
          origin: "FREE_AGENT_SIGNING",
          careerTeamIds: uniqueCareerTeams(fa.careerTeamIds, winOffer.offeringTeamId),
        });
        nextContracts.push(newContract);
        nextFreeAgents = nextFreeAgents.filter((f) => f.playerId !== fa.playerId);
        nextTeams = nextTeams.map((t) =>
          t.teamId === winOffer.offeringTeamId
            ? { ...t, squadIds: [...t.squadIds, fa.playerId] }
            : t,
        );
        nextPlayers.push(structuredClone(fa.player));
        addedPlayers.push(fa.player);
        rosterChanged = true;

        const teamCommittedAfter = nextContracts
          .filter((c) => c.teamId === winOffer.offeringTeamId)
          .reduce((sum, c) => sum + c.annualWageK, 0);
        appendLedgerEntry(nextLedger, {
          seasonNumber: input.seasonNumber,
          calendarYear: input.calendarYear,
          date: input.currentDate,
          type: "FREE_AGENT_SIGNED",
          teamId: winOffer.offeringTeamId,
          playerId: fa.playerId,
          contractId,
          offerId: winOffer.offerId,
          annualWageK: winOffer.annualWageK,
          deadCapDeltaK: 0,
          termSeasons: winOffer.termSeasons,
          teamCommittedWagesAfterK: teamCommittedAfter,
          teamDeadCapAfterK: deadCapMap.get(winOffer.offeringTeamId) ?? 0,
          teamBudgetLimitK: model.annualClubWageBudgetK,
          summary: `Signed free agent ${fa.player.name} to ${winOffer.termSeasons}y contract at $${winOffer.annualWageK}k/yr`,
        });
      } else if (activeContract) {
        const updatedContract = PlayerContractSchema.parse({
          ...activeContract,
          contractId,
          signedSeasonNumber: input.seasonNumber,
          expiresAfterSeasonNumber: input.seasonNumber + winOffer.termSeasons,
          annualWageK: winOffer.annualWageK,
          origin: "RENEWAL",
        });
        nextContracts = nextContracts.map((c) =>
          c.playerId === activeContract.playerId ? updatedContract : c,
        );
        const teamCommittedAfter = nextContracts
          .filter((c) => c.teamId === winOffer.offeringTeamId)
          .reduce((sum, c) => sum + c.annualWageK, 0);
        appendLedgerEntry(nextLedger, {
          seasonNumber: input.seasonNumber,
          calendarYear: input.calendarYear,
          date: input.currentDate,
          type: "CONTRACT_RENEWED",
          teamId: winOffer.offeringTeamId,
          playerId: activeContract.playerId,
          contractId,
          offerId: winOffer.offerId,
          annualWageK: winOffer.annualWageK,
          deadCapDeltaK: 0,
          termSeasons: winOffer.termSeasons,
          teamCommittedWagesAfterK: teamCommittedAfter,
          teamDeadCapAfterK: deadCapMap.get(winOffer.offeringTeamId) ?? 0,
          teamBudgetLimitK: model.annualClubWageBudgetK,
          summary: `Renewed ${targetPlayer.name} through Season ${updatedContract.expiresAfterSeasonNumber} at $${winOffer.annualWageK}k/yr`,
        });
      }

      for (const cand of scored) {
        if (cand.idx === winningEntry.idx) {
          const signed = ContractOfferSchema.parse({
            ...cand.o,
            roundResolved: round,
            status: "SIGNED",
            reason: "PLAYER_ACCEPTED_BEST_OFFER",
            counterAnnualWageK: null,
            counterTermSeasons: null,
          });
          nextOffers[cand.idx] = signed;
          signedOffers.push(signed);
        } else {
          nextOffers[cand.idx] = ContractOfferSchema.parse({
            ...cand.o,
            roundResolved: round,
            status: "REJECTED",
            reason: "SIGNED_WITH_COMPETING_CLUB",
            counterAnnualWageK: null,
            counterTermSeasons: null,
          });
        }
      }
    } else {
      // No offer met askingWageK: counter close bids (85%+ of asking) if rounds remain, otherwise reject
      const counterFloor = Math.ceil(askingWageK * 0.85);
      for (const cand of scored) {
        const teamBudgetNow =
          model.annualClubWageBudgetK -
          nextContracts
            .filter((c) => c.teamId === cand.o.offeringTeamId)
            .reduce((s, c) => s + c.annualWageK, 0) -
          (deadCapMap.get(cand.o.offeringTeamId) ?? 0);
        const requiredRoom =
          cand.o.offerKind === "FREE_AGENT"
            ? askingWageK
            : Math.max(0, askingWageK - (activeContract?.annualWageK ?? 0));
        if (
          round < MAX_NEGOTIATION_ROUNDS_PER_WINDOW &&
          cand.o.annualWageK >= counterFloor &&
          requiredRoom <= teamBudgetNow
        ) {
          const countered = ContractOfferSchema.parse({
            ...cand.o,
            roundResolved: null,
            status: "COUNTERED",
            reason: "PLAYER_COUNTERED_TERMS",
            counterAnnualWageK: askingWageK,
            counterTermSeasons: preferredTerm,
          });
          nextOffers[cand.idx] = countered;
          counteredOffers.push(countered);
        } else {
          nextOffers[cand.idx] = ContractOfferSchema.parse({
            ...cand.o,
            roundResolved: round,
            status: "REJECTED",
            reason:
              requiredRoom > teamBudgetNow ? "CAP_OR_ROSTER_LIMIT" : "WAGE_BELOW_RESERVATION",
            counterAnnualWageK: askingWageK,
            counterTermSeasons: preferredTerm,
          });
        }
      }
    }
  }

  const isFinalRound = round >= MAX_NEGOTIATION_ROUNDS_PER_WINDOW;
  const finalOffers = isFinalRound
    ? nextOffers.map((o) =>
        o.status === "COUNTERED"
          ? ContractOfferSchema.parse({
              ...o,
              roundResolved: round,
              status: "REJECTED",
              reason: "WAGE_BELOW_RESERVATION",
              counterAnnualWageK: null,
              counterTermSeasons: null,
            })
          : o,
      )
    : nextOffers;

  const nextLifecycle = rosterChanged
    ? syncLifecycleWithWorldRosterMutation({
        lifecycle: input.lifecycle,
        worldId: input.worldIdentity.worldId,
        seasonNumber: input.seasonNumber,
        nextTeams,
        nextPlayers,
        addedPlayers,
      })
    : input.lifecycle;

  nextContracts.sort((a, b) => a.playerId.localeCompare(b.playerId));
  nextFreeAgents.sort((a, b) => a.playerId.localeCompare(b.playerId));
  const nextBudgets = computeClubBudgets({
    teamIds: economy.clubBudgets.map((b) => b.teamId),
    seasonNumber: input.seasonNumber,
    contracts: nextContracts,
    offers: finalOffers,
    deadCapByTeam: deadCapMap,
    model,
  });

  const nextWindow: NegotiationWindowState = NegotiationWindowStateSchema.parse({
    seasonNumber: input.seasonNumber,
    windowPhase: isFinalRound ? "CLOSED" : "OPEN",
    currentRound: isFinalRound ? round : round + 1,
    maxRounds: MAX_NEGOTIATION_ROUNDS_PER_WINDOW,
    offers: finalOffers,
  });

  const sealed = sealSquadEconomyState({
    economyVersion: SQUAD_ECONOMY_STATE_VERSION,
    model,
    contracts: nextContracts,
    freeAgents: nextFreeAgents,
    clubBudgets: nextBudgets,
    negotiationWindow: nextWindow,
    ledger: nextLedger,
    appliedCommandIds: [...economy.appliedCommandIds, request.commandId],
    transitions: economy.transitions,
  });

  return {
    economy: validateSquadEconomyState(sealed, nextLifecycle, input.seasonNumber),
    lifecycle: nextLifecycle,
    duplicate: false,
    rosterChanged,
    signedOffers,
    counteredOffers,
  };
}

/**
 * Integrated Stage 3 + Stage 4 season-close rollover:
 * 1. Advances player ageing, permanent skill development, retirements, and youth graduations.
 * 2. Closes retired players' contracts (`CONTRACT_ENDED_ON_RETIREMENT`) and preserves multi-club `careerTeamIds`.
 * 3. Runs symmetrical AI club pre-expiry contract renewals within each club's `$2,500k` budget.
 * 4. Expires unrenewed contracts (`expiresAfterSeasonNumber <= fromSeasonNumber`) into the Free Agent pool (`CONTRACT_EXPIRED_TO_FREE_AGENCY`).
 * 5. Signs Youth Academy graduates (`YOUTH_ROOKIE_CONTRACT_SIGNED`) and guarantees legal `18..22` squads + keeper/bowler floors via domestic minimum-wage (`$35k`) contracts (`MINIMUM_SQUAD_TOPUP_SIGNED`) without ever breaching any club's wage cap.
 * 6. Ages & replenishes the Free Agent pool and opens Season `toSeasonNumber` Round 1 of 3 negotiation window.
 */
export function advanceLifecycleAndEconomyAtSeasonClose(input: {
  lifecycle: PlayerLifecycleState;
  economy: SquadEconomyState;
  worldIdentity: PersistentWorldIdentity;
  fromSeasonNumber: number;
  toSeasonNumber: number;
  closedCalendarYear: number;
  nextCalendarYear: number;
  rolloverDate: string;
  seasonPlayerStats: readonly {
    playerId: string;
    matches: number;
    runs: number;
    wickets: number;
    ballsFaced: number;
    bowlingLegalBalls: number;
  }[];
  controlledTeamId: string | null;
}): {
  lifecycle: PlayerLifecycleState;
  economy: SquadEconomyState;
  transitionSummary: SeasonEconomyTransitionSummary;
} {
  const validatedEconomy = validateSquadEconomyState(
    input.economy,
    input.lifecycle,
    input.fromSeasonNumber,
  );
  assertEconomy(
    !validatedEconomy.transitions.some((t) => t.fromSeasonNumber === input.fromSeasonNumber),
    `DUPLICATE_ECONOMY_TRANSITION:${input.fromSeasonNumber}`,
  );
  const model = validatedEconomy.model;
  const priorContractsByPlayer = new Map(
    validatedEconomy.contracts.map((c) => [c.playerId, c]),
  );
  const statsMap = new Map(input.seasonPlayerStats.map((s) => [s.playerId, s]));

  // Step 1: Run Stage 3 lifecycle progression (ageing, permanent skills, retirements, youth promotions)
  const stage3NextLifecycle = advancePlayerLifecycleAtSeasonClose({
    lifecycle: input.lifecycle,
    worldIdentity: input.worldIdentity,
    fromSeasonNumber: input.fromSeasonNumber,
    toSeasonNumber: input.toSeasonNumber,
    closedCalendarYear: input.closedCalendarYear,
    nextCalendarYear: input.nextCalendarYear,
    seasonPlayerStats: input.seasonPlayerStats,
    controlledTeamId: input.controlledTeamId,
  });

  const stage3Transition = stage3NextLifecycle.transitions[stage3NextLifecycle.transitions.length - 1]!;
  const newlyRetiredIds = new Set(stage3Transition.retiredPlayerIds);
  const newlyPromotedYouthIds = new Set(stage3Transition.promotedYouthIds);

  // Enrich newly retired records with multi-club `careerTeamIds` from their contracts!
  const enrichedRetiredPlayers: RetiredPlayerRecord[] = stage3NextLifecycle.retiredPlayers.map((rec) => {
    const priorContract = priorContractsByPlayer.get(rec.playerId);
    if (!priorContract) return rec;
    return RetiredPlayerRecordSchema.parse({
      ...rec,
      careerTeamIds: uniqueCareerTeams(priorContract.careerTeamIds, rec.lastTeamId),
    });
  });

  const nextLedger = [...validatedEconomy.ledger];
  const workingContracts = new Map<string, PlayerContract>();
  for (const c of validatedEconomy.contracts) {
    if (!newlyRetiredIds.has(c.playerId)) {
      workingContracts.set(c.playerId, structuredClone(c));
    }
  }

  const teamCommittedOf = (teamId: string): number => {
    let sum = 0;
    for (const c of workingContracts.values()) {
      if (c.teamId === teamId) sum += c.annualWageK;
    }
    return sum;
  };

  const retiredContractClosedIds: string[] = [];
  for (const retId of [...newlyRetiredIds].sort()) {
    const c = priorContractsByPlayer.get(retId);
    if (!c) continue;
    retiredContractClosedIds.push(retId);
    appendLedgerEntry(nextLedger, {
      seasonNumber: input.toSeasonNumber,
      calendarYear: input.nextCalendarYear,
      date: input.rolloverDate,
      type: "CONTRACT_ENDED_ON_RETIREMENT",
      teamId: c.teamId,
      playerId: retId,
      contractId: c.contractId,
      offerId: null,
      annualWageK: 0,
      deadCapDeltaK: 0,
      termSeasons: 0,
      teamCommittedWagesAfterK: teamCommittedOf(c.teamId),
      teamDeadCapAfterK: 0,
      teamBudgetLimitK: model.annualClubWageBudgetK,
      summary: `Contract ${c.contractId} closed upon player retirement after Season ${input.fromSeasonNumber}`,
    });
  }

  const developedPlayerById = new Map(
    stage3NextLifecycle.activeWorld.players.map((p) => [p.playerId, p]),
  );
  let contractSeq = nextLedger.length + 1;

  // Count human renewals already signed during Season `fromSeasonNumber`
  const humanRenewedCount = validatedEconomy.ledger.filter(
    (e) =>
      e.seasonNumber === input.fromSeasonNumber &&
      e.type === "CONTRACT_RENEWED" &&
      e.teamId === input.controlledTeamId,
  ).length;

  // Step 2: Symmetrical AI club off-season renewals for expiring contracts (`expiresAfterSeasonNumber <= fromSeasonNumber`)
  let aiRenewedCount = 0;
  const sortedTeams = [...stage3NextLifecycle.activeWorld.teams].sort((a, b) =>
    a.teamId.localeCompare(b.teamId),
  );

  for (const team of sortedTeams) {
    if (team.teamId === input.controlledTeamId) continue;
    const activeTeamPlayers = team.squadIds
      .map((pid) => developedPlayerById.get(pid))
      .filter((p): p is Player => Boolean(p));
    const expiringContracts = activeTeamPlayers
      .map((p) => ({ p, c: workingContracts.get(p.playerId) }))
      .filter(
        (item): item is { p: Player; c: PlayerContract } =>
          item.c !== undefined && item.c.expiresAfterSeasonNumber <= input.fromSeasonNumber,
      );

    // Rank expiring players strictly by public role need + public T20 rating
    const nonExpiringKeepers = activeTeamPlayers.filter((p) => {
      const c = workingContracts.get(p.playerId);
      return p.role === "KEEPER" && ((c && c.expiresAfterSeasonNumber > input.fromSeasonNumber) || newlyPromotedYouthIds.has(p.playerId));
    }).length;
    const nonExpiringBowlers = activeTeamPlayers.filter((p) => {
      const c = workingContracts.get(p.playerId);
      return isBowlingCapable(p) && ((c && c.expiresAfterSeasonNumber > input.fromSeasonNumber) || newlyPromotedYouthIds.has(p.playerId));
    }).length;

    const rankedExpiring = expiringContracts
      .map(({ p, c }) => {
        const view = buildPublicMarketPlayerView(p, input.nextCalendarYear, statsMap.get(p.playerId));
        const rating = publicPlayerRoleRating(view);
        const ask = estimatePlayerMarketWageK(view, model);
        const rolePriority =
          p.role === "KEEPER" && nonExpiringKeepers < 2
            ? 25
            : isBowlingCapable(p) && nonExpiringBowlers < 6
              ? 15
              : 0;
        return { p, c, view, rating, ask, priority: rating + rolePriority };
      })
      .sort((a, b) => b.priority - a.priority || a.p.playerId.localeCompare(b.p.playerId));

    // Leave room for youth promotions and 1–2 free-agent market moves so the market stays lively!
    const reservedYouthWages =
      team.squadIds.filter((id) => newlyPromotedYouthIds.has(id)).length * model.youthRookieAnnualWageK;
    let keptkeepers = nonExpiringKeepers;
    let keptBowlers = nonExpiringBowlers;
    let renewalsForThisClub = 0;
    const maxRenewalsForClub = Math.max(2, rankedExpiring.length - 2);

    for (const cand of rankedExpiring) {
      const essentialRole =
        (cand.p.role === "KEEPER" && keptkeepers < 1) ||
        (isBowlingCapable(cand.p) && keptBowlers < 5);
      if (!essentialRole && (cand.view.ageYears >= 35 || renewalsForThisClub >= maxRenewalsForClub)) {
        continue;
      }
      const committedOther = teamCommittedOf(team.teamId) - cand.c.annualWageK;
      if (committedOther + reservedYouthWages + cand.ask > Math.floor(model.annualClubWageBudgetK * 0.9)) {
        continue;
      }
      const term = preferredContractTermSeasons(cand.view.ageYears);
      const newContractId = `ct-ren-s${String(input.toSeasonNumber).padStart(3, "0")}-${String(contractSeq++).padStart(4, "0")}`;
      const renewed = PlayerContractSchema.parse({
        ...cand.c,
        contractId: newContractId,
        signedSeasonNumber: input.toSeasonNumber,
        expiresAfterSeasonNumber: input.toSeasonNumber + term - 1,
        annualWageK: cand.ask,
        origin: "RENEWAL",
      });
      workingContracts.set(cand.p.playerId, renewed);
      aiRenewedCount += 1;
      renewalsForThisClub += 1;
      if (cand.p.role === "KEEPER") keptkeepers += 1;
      if (isBowlingCapable(cand.p)) keptBowlers += 1;
      appendLedgerEntry(nextLedger, {
        seasonNumber: input.toSeasonNumber,
        calendarYear: input.nextCalendarYear,
        date: input.rolloverDate,
        type: "CONTRACT_RENEWED",
        teamId: team.teamId,
        playerId: cand.p.playerId,
        contractId: newContractId,
        offerId: null,
        annualWageK: cand.ask,
        deadCapDeltaK: 0,
        termSeasons: term,
        teamCommittedWagesAfterK: teamCommittedOf(team.teamId),
        teamDeadCapAfterK: 0,
        teamBudgetLimitK: model.annualClubWageBudgetK,
        summary: `AI club ${team.teamId} renewed ${cand.p.name} (${term}y at $${cand.ask}k/yr)`,
      });
    }
  }

  // Step 3: Expire all remaining unrenewed contracts (`expiresAfterSeasonNumber <= fromSeasonNumber`) to Free Agency
  const expiredToFreeAgencyIds: string[] = [];
  const newlyExpiredFreeAgents: FreeAgentRecord[] = [];

  for (const c of [...workingContracts.values()].sort((a, b) => a.playerId.localeCompare(b.playerId))) {
    if (c.expiresAfterSeasonNumber > input.fromSeasonNumber) continue;
    const player = developedPlayerById.get(c.playerId);
    workingContracts.delete(c.playerId);
    if (!player) continue;
    expiredToFreeAgencyIds.push(c.playerId);
    const view = buildPublicMarketPlayerView(
      player,
      input.nextCalendarYear,
      statsMap.get(c.playerId),
    );
    newlyExpiredFreeAgents.push(
      FreeAgentRecordSchema.parse({
        playerId: player.playerId,
        player: structuredClone(player),
        enteredMarketSeasonNumber: input.toSeasonNumber,
        enteredReason: "CONTRACT_EXPIRED",
        previousTeamId: c.teamId,
        careerTeamIds: [...c.careerTeamIds],
        restrictedFromSigningTeamId: null,
        restrictedSeasonNumber: null,
        askingAnnualWageK: estimatePlayerMarketWageK(view, model),
        preferredTermSeasons: preferredContractTermSeasons(view.ageYears),
      }),
    );
    appendLedgerEntry(nextLedger, {
      seasonNumber: input.toSeasonNumber,
      calendarYear: input.nextCalendarYear,
      date: input.rolloverDate,
      type: "CONTRACT_EXPIRED_TO_FREE_AGENCY",
      teamId: c.teamId,
      playerId: player.playerId,
      contractId: c.contractId,
      offerId: null,
      annualWageK: 0,
      deadCapDeltaK: 0,
      termSeasons: 0,
      teamCommittedWagesAfterK: teamCommittedOf(c.teamId),
      teamDeadCapAfterK: 0,
      teamBudgetLimitK: model.annualClubWageBudgetK,
      summary: `Contract expired: ${player.name} entered domestic Free Agency`,
    });
  }

  // Age existing unsold Free Agents (+1 year; retire 35+ veterans cleanly)
  const agedCarryoverFreeAgents: FreeAgentRecord[] = [];
  for (const fa of validatedEconomy.freeAgents) {
    const ageNext = playerAgeInSeason(fa.player.birthDate, input.nextCalendarYear);
    if (ageNext >= 35) {
      if (fa.careerTeamIds.length > 0 && !enrichedRetiredPlayers.some((r) => r.playerId === fa.playerId)) {
        const lastClub = fa.careerTeamIds[fa.careerTeamIds.length - 1]!;
        enrichedRetiredPlayers.push(
          RetiredPlayerRecordSchema.parse({
            playerId: fa.playerId,
            player: fa.player,
            debutSeasonNumber: 1,
            retiredAfterSeasonNumber: input.fromSeasonNumber,
            retiredCalendarYear: input.closedCalendarYear,
            ageAtRetirement: ageNext,
            lastTeamId: lastClub,
            careerTeamIds: fa.careerTeamIds,
            retirementReason: "VETERAN_TRANSITION",
          }),
        );
      }
      continue;
    }
    const view = buildPublicMarketPlayerView(fa.player, input.nextCalendarYear);
    agedCarryoverFreeAgents.push(
      FreeAgentRecordSchema.parse({
        ...fa,
        restrictedFromSigningTeamId: null,
        restrictedSeasonNumber: null,
        askingAnnualWageK: estimatePlayerMarketWageK(view, model),
        preferredTermSeasons: preferredContractTermSeasons(ageNext),
      }),
    );
  }

  let freeAgentPool: FreeAgentRecord[] = [...newlyExpiredFreeAgents, ...agedCarryoverFreeAgents];

  // Step 4: Rebuild each club's active squad: retained under-contract players + newly promoted youth (if cap fits) + minimum floor protection
  const youthContractsSignedIds: string[] = [];
  const aiOffseasonFreeAgentSigningsIds: string[] = [];
  const minimumTopupSignedIds: string[] = [];
  const finalTeams: WorldPack["teams"] = [];
  const finalActivePlayers: Player[] = [];

  for (const team of sortedTeams) {
    const clubPlayers: Player[] = [];
    for (const pid of team.squadIds) {
      const p = developedPlayerById.get(pid);
      if (!p) continue;
      if (workingContracts.get(pid)?.teamId === team.teamId) {
        clubPlayers.push(p);
      } else if (newlyPromotedYouthIds.has(pid)) {
        // Sign promoted youth graduate if within budget (leaving headroom for minimum 18 squad)
        const slotsStillNeededAfter = Math.max(0, MIN_ACTIVE_TEAM_SQUAD_SIZE - (clubPlayers.length + 1));
        const minReserveNeeded = slotsStillNeededAfter * model.minAnnualWageK;
        if (
          clubPlayers.length < MAX_ACTIVE_TEAM_SQUAD_SIZE &&
          teamCommittedOf(team.teamId) + model.youthRookieAnnualWageK + minReserveNeeded <=
            model.annualClubWageBudgetK
        ) {
          const cid = `ct-y-s${String(input.toSeasonNumber).padStart(3, "0")}-${String(contractSeq++).padStart(4, "0")}`;
          const c = PlayerContractSchema.parse({
            contractId: cid,
            playerId: p.playerId,
            teamId: team.teamId,
            signedSeasonNumber: input.toSeasonNumber,
            startsSeasonNumber: input.toSeasonNumber,
            expiresAfterSeasonNumber: input.toSeasonNumber + 1,
            annualWageK: model.youthRookieAnnualWageK,
            origin: "YOUTH_GRADUATE",
            careerTeamIds: [team.teamId],
          });
          workingContracts.set(p.playerId, c);
          clubPlayers.push(p);
          youthContractsSignedIds.push(p.playerId);
          appendLedgerEntry(nextLedger, {
            seasonNumber: input.toSeasonNumber,
            calendarYear: input.nextCalendarYear,
            date: input.rolloverDate,
            type: "YOUTH_ROOKIE_CONTRACT_SIGNED",
            teamId: team.teamId,
            playerId: p.playerId,
            contractId: cid,
            offerId: null,
            annualWageK: model.youthRookieAnnualWageK,
            deadCapDeltaK: 0,
            termSeasons: 2,
            teamCommittedWagesAfterK: teamCommittedOf(team.teamId),
            teamDeadCapAfterK: 0,
            teamBudgetLimitK: model.annualClubWageBudgetK,
            summary: `Graduated ${p.name} from academy on 2y rookie deal ($${model.youthRookieAnnualWageK}k/yr)`,
          });
        }
      }
    }

    // For AI clubs below 19 players, sign affordable Free Agents by public role need before minimum rookie top-ups
    if (team.teamId !== input.controlledTeamId) {
      while (clubPlayers.length < 19 && freeAgentPool.length > 0) {
        const needKeeper = clubPlayers.filter((p) => p.role === "KEEPER").length < 2;
        const needBowler = clubPlayers.filter(isBowlingCapable).length < 7;
        const remainingSlotsAfter = Math.max(0, MIN_ACTIVE_TEAM_SQUAD_SIZE - (clubPlayers.length + 1));
        const maxAffordable =
          model.annualClubWageBudgetK -
          teamCommittedOf(team.teamId) -
          remainingSlotsAfter * model.minAnnualWageK;
        const affordable = freeAgentPool
          .filter((fa) => fa.askingAnnualWageK <= maxAffordable)
          .sort((a, b) => {
            const va = buildPublicMarketPlayerView(a.player, input.nextCalendarYear, statsMap.get(a.playerId));
            const vb = buildPublicMarketPlayerView(b.player, input.nextCalendarYear, statsMap.get(b.playerId));
            const bonusA =
              (needKeeper && a.player.role === "KEEPER" ? 20 : 0) +
              (needBowler && isBowlingCapable(a.player) ? 12 : 0);
            const bonusB =
              (needKeeper && b.player.role === "KEEPER" ? 20 : 0) +
              (needBowler && isBowlingCapable(b.player) ? 12 : 0);
            return (
              publicPlayerRoleRating(vb) +
              bonusB -
              (publicPlayerRoleRating(va) + bonusA) ||
              a.playerId.localeCompare(b.playerId)
            );
          });
        if (affordable.length === 0) break;
        const chosen = affordable[0]!;
        freeAgentPool = freeAgentPool.filter((f) => f.playerId !== chosen.playerId);
        const cid = `ct-fa-s${String(input.toSeasonNumber).padStart(3, "0")}-${String(contractSeq++).padStart(4, "0")}`;
        const c = PlayerContractSchema.parse({
          contractId: cid,
          playerId: chosen.playerId,
          teamId: team.teamId,
          signedSeasonNumber: input.toSeasonNumber,
          startsSeasonNumber: input.toSeasonNumber,
          expiresAfterSeasonNumber: input.toSeasonNumber + chosen.preferredTermSeasons - 1,
          annualWageK: chosen.askingAnnualWageK,
          origin: "FREE_AGENT_SIGNING",
          careerTeamIds: uniqueCareerTeams(chosen.careerTeamIds, team.teamId),
        });
        workingContracts.set(chosen.playerId, c);
        clubPlayers.push(structuredClone(chosen.player));
        aiOffseasonFreeAgentSigningsIds.push(chosen.playerId);
        appendLedgerEntry(nextLedger, {
          seasonNumber: input.toSeasonNumber,
          calendarYear: input.nextCalendarYear,
          date: input.rolloverDate,
          type: "FREE_AGENT_SIGNED",
          teamId: team.teamId,
          playerId: chosen.playerId,
          contractId: cid,
          offerId: null,
          annualWageK: chosen.askingAnnualWageK,
          deadCapDeltaK: 0,
          termSeasons: chosen.preferredTermSeasons,
          teamCommittedWagesAfterK: teamCommittedOf(team.teamId),
          teamDeadCapAfterK: 0,
          teamBudgetLimitK: model.annualClubWageBudgetK,
          summary: `AI club ${team.teamId} signed free agent ${chosen.player.name} ($${chosen.askingAnnualWageK}k/yr, ${chosen.preferredTermSeasons}y)`,
        });
      }
    }

    // Minimum domestic rookie floor protection (`>= 18` players, `>= 1` keeper, `>= 6` bowling-capable) at `$35k` minimum wage
    let minTopupSlot = 1;
    while (
      clubPlayers.length < MIN_ACTIVE_TEAM_SQUAD_SIZE ||
      clubPlayers.filter((p) => p.role === "KEEPER").length < 1 ||
      clubPlayers.filter(isBowlingCapable).length < 6
    ) {
      // If squad hit 22 without role floor (rare), release lowest-wage surplus non-keeper/non-bowler to minimum replacement
      if (clubPlayers.length >= MAX_ACTIVE_TEAM_SQUAD_SIZE) {
        const removable = clubPlayers.find(
          (p) => p.role === "BATTER" && !isBowlingCapable(p),
        );
        if (!removable) break;
        const remIdx = clubPlayers.findIndex((p) => p.playerId === removable.playerId);
        clubPlayers.splice(remIdx, 1);
        workingContracts.delete(removable.playerId);
      }
      // Ensure budget headroom for `$35k` minimum rookie
      if (teamCommittedOf(team.teamId) + model.minAnnualWageK > model.annualClubWageBudgetK) {
        // Release highest-wage non-essential contract into free agency if club somehow over-committed renewals
        const releasable = [...clubPlayers]
          .filter((p) => {
            if (p.role === "KEEPER" && clubPlayers.filter((x) => x.role === "KEEPER").length <= 1) {
              return false;
            }
            if (isBowlingCapable(p) && clubPlayers.filter(isBowlingCapable).length <= 6) {
              return false;
            }
            return true;
          })
          .sort(
            (a, b) =>
              (workingContracts.get(b.playerId)?.annualWageK ?? 0) -
              (workingContracts.get(a.playerId)?.annualWageK ?? 0),
          )[0];
        if (!releasable) break;
        const relContract = workingContracts.get(releasable.playerId)!;
        workingContracts.delete(releasable.playerId);
        const idx = clubPlayers.findIndex((p) => p.playerId === releasable.playerId);
        clubPlayers.splice(idx, 1);
        const relView = buildPublicMarketPlayerView(releasable, input.nextCalendarYear);
        freeAgentPool.push(
          FreeAgentRecordSchema.parse({
            playerId: releasable.playerId,
            player: structuredClone(releasable),
            enteredMarketSeasonNumber: input.toSeasonNumber,
            enteredReason: "CONTRACT_EXPIRED",
            previousTeamId: team.teamId,
            careerTeamIds: relContract.careerTeamIds,
            restrictedFromSigningTeamId: null,
            restrictedSeasonNumber: null,
            askingAnnualWageK: estimatePlayerMarketWageK(relView, model),
            preferredTermSeasons: preferredContractTermSeasons(relView.ageYears),
          }),
        );
      }

      const neededRole: Player["role"] =
        clubPlayers.filter((p) => p.role === "KEEPER").length < 1
          ? "KEEPER"
          : clubPlayers.filter(isBowlingCapable).length < 6
            ? "BOWLER"
            : "BATTER";
      const rookieFa = generateUnattachedFreeAgent(
        {
          ...input.worldIdentity,
          baseSeed: `${input.worldIdentity.baseSeed}-min-${team.teamId}-${minTopupSlot}`.slice(0, 256),
        },
        input.toSeasonNumber,
        input.nextCalendarYear,
        minTopupSlot,
        neededRole,
        model,
      );
      const rookieId = `py-min-s${String(input.toSeasonNumber).padStart(3, "0")}-${team.teamId.replaceAll(/[^A-Za-z0-9]/g, "")}-${minTopupSlot}`;
      // Modest domestic replacement-level skills (~47-53) at $35k minimum wage
      const rookiePlayer: Player = PlayerSchema.parse({
        ...rookieFa.player,
        playerId: rookieId,
        birthDate: `${input.nextCalendarYear - 20}-04-15`,
      });
      const cid = `ct-min-s${String(input.toSeasonNumber).padStart(3, "0")}-${String(contractSeq++).padStart(4, "0")}`;
      const c = PlayerContractSchema.parse({
        contractId: cid,
        playerId: rookieId,
        teamId: team.teamId,
        signedSeasonNumber: input.toSeasonNumber,
        startsSeasonNumber: input.toSeasonNumber,
        expiresAfterSeasonNumber: input.toSeasonNumber,
        annualWageK: model.minAnnualWageK,
        origin: "EMERGENCY_MINIMUM",
        careerTeamIds: [team.teamId],
      });
      workingContracts.set(rookieId, c);
      clubPlayers.push(rookiePlayer);
      minimumTopupSignedIds.push(rookieId);
      appendLedgerEntry(nextLedger, {
        seasonNumber: input.toSeasonNumber,
        calendarYear: input.nextCalendarYear,
        date: input.rolloverDate,
        type: "MINIMUM_SQUAD_TOPUP_SIGNED",
        teamId: team.teamId,
        playerId: rookieId,
        contractId: cid,
        offerId: null,
        annualWageK: model.minAnnualWageK,
        deadCapDeltaK: 0,
        termSeasons: 1,
        teamCommittedWagesAfterK: teamCommittedOf(team.teamId),
        teamDeadCapAfterK: 0,
        teamBudgetLimitK: model.annualClubWageBudgetK,
        summary: `Registered minimum-wage domestic ${neededRole.toLowerCase()} ${rookiePlayer.name} ($${model.minAnnualWageK}k/1y) to meet squad floor`,
      });
      minTopupSlot += 1;
    }

    for (const p of clubPlayers) finalActivePlayers.push(p);
    finalTeams.push({
      ...structuredClone(team),
      squadIds: clubPlayers.map((p) => p.playerId),
    });
  }

  // Step 5: Replenish & bound Free Agent pool (`16..40` players)
  const usedIds = new Set<string>([
    ...finalActivePlayers.map((p) => p.playerId),
    ...enrichedRetiredPlayers.map((r) => r.playerId),
    ...stage3NextLifecycle.youthAcademy.map((y) => y.player.playerId),
    ...freeAgentPool.map((f) => f.playerId),
  ]);
  if (freeAgentPool.length < model.minFreeAgentPoolSize) {
    const additions = buildBalancedFreeAgentAdditions(
      input.worldIdentity,
      input.toSeasonNumber,
      input.nextCalendarYear,
      model.minFreeAgentPoolSize - freeAgentPool.length,
      50,
      usedIds,
      model,
    );
    freeAgentPool.push(...additions);
  }
  if (freeAgentPool.length > model.maxFreeAgentPoolSize) {
    // Keep higher-rated / recently expired free agents first, trim lowest unattached surplus
    freeAgentPool.sort((a, b) => {
      const expA = a.enteredReason === "CONTRACT_EXPIRED" ? 20 : 0;
      const expB = b.enteredReason === "CONTRACT_EXPIRED" ? 20 : 0;
      return b.askingAnnualWageK + expB - (a.askingAnnualWageK + expA) || a.playerId.localeCompare(b.playerId);
    });
    freeAgentPool = freeAgentPool.slice(0, model.maxFreeAgentPoolSize);
  }
  freeAgentPool.sort((a, b) => a.playerId.localeCompare(b.playerId));

  // Step 6: Synchronize lifecycle activeWorld & rosterPack with post-contract squads + enriched retired records
  const signedYouthSet = new Set(youthContractsSignedIds);
  const reconciledYouthAcademy = stage3NextLifecycle.youthAcademy.map((prospect) =>
    newlyPromotedYouthIds.has(prospect.player.playerId) &&
    !signedYouthSet.has(prospect.player.playerId)
      ? {
          ...prospect,
          promotedInSeasonNumber: null,
          queuedForPromotion: false,
        }
      : prospect,
  );
  const lifecycleWithRetired = sealPlayerLifecycleState({
    lifecycleVersion: stage3NextLifecycle.lifecycleVersion,
    model: stage3NextLifecycle.model,
    activeWorld: stage3NextLifecycle.activeWorld,
    activeRosterPack: stage3NextLifecycle.activeRosterPack,
    historicalRosterPacks: stage3NextLifecycle.historicalRosterPacks,
    skillLedger: stage3NextLifecycle.skillLedger,
    seasonTrainingExposure: stage3NextLifecycle.seasonTrainingExposure,
    retiredPlayers: enrichedRetiredPlayers.sort((a, b) => a.playerId.localeCompare(b.playerId)),
    youthAcademy: reconciledYouthAcademy,
    transitions: stage3NextLifecycle.transitions,
    squadRegistrationRevision: stage3NextLifecycle.squadRegistrationRevision,
  });

  const existingActiveSet = new Set(stage3NextLifecycle.activeWorld.players.map((p) => p.playerId));
  const addedInEconomy = finalActivePlayers.filter((p) => !existingActiveSet.has(p.playerId));

  const finalLifecycle = syncLifecycleWithWorldRosterMutation({
    lifecycle: lifecycleWithRetired,
    worldId: input.worldIdentity.worldId,
    seasonNumber: input.toSeasonNumber,
    nextTeams: finalTeams,
    nextPlayers: finalActivePlayers,
    addedPlayers: addedInEconomy,
  });

  const finalContracts = [...workingContracts.values()].sort((a, b) =>
    a.playerId.localeCompare(b.playerId),
  );
  const nextWindow: NegotiationWindowState = NegotiationWindowStateSchema.parse({
    seasonNumber: input.toSeasonNumber,
    windowPhase: "OPEN",
    currentRound: 1,
    maxRounds: MAX_NEGOTIATION_ROUNDS_PER_WINDOW,
    offers: [],
  });
  const nextBudgets = computeClubBudgets({
    teamIds: sortedTeams.map((t) => t.teamId),
    seasonNumber: input.toSeasonNumber,
    contracts: finalContracts,
    offers: [],
    deadCapByTeam: new Map(),
    model,
  });

  const transitionSummary = SeasonEconomyTransitionSummarySchema.parse({
    fromSeasonNumber: input.fromSeasonNumber,
    toSeasonNumber: input.toSeasonNumber,
    calendarYear: input.nextCalendarYear,
    humanRenewedCount,
    aiRenewedCount,
    expiredToFreeAgencyIds: expiredToFreeAgencyIds.sort(),
    retiredContractClosedIds: retiredContractClosedIds.sort(),
    youthContractsSignedIds: youthContractsSignedIds.sort(),
    aiOffseasonFreeAgentSigningsIds: aiOffseasonFreeAgentSigningsIds.sort(),
    minimumTopupSignedIds: minimumTopupSignedIds.sort(),
  });

  const sealedEconomy = sealSquadEconomyState({
    economyVersion: SQUAD_ECONOMY_STATE_VERSION,
    model,
    contracts: finalContracts,
    freeAgents: freeAgentPool,
    clubBudgets: nextBudgets,
    negotiationWindow: nextWindow,
    ledger: nextLedger,
    appliedCommandIds: [],
    transitions: [...validatedEconomy.transitions, transitionSummary],
  });

  return {
    lifecycle: validatePlayerLifecycleState(finalLifecycle),
    economy: validateSquadEconomyState(sealedEconomy, finalLifecycle, input.toSeasonNumber),
    transitionSummary,
  };
}

function summarizeWageBand(values: readonly number[]): LifecycleAbilityBandSummary {
  assertEconomy(values.length > 0, "EMPTY_WAGE_BAND");
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))]!;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    min: Math.min(100, Math.round(sorted[0]! / 4)),
    p10: Math.min(100, Math.round(at(0.1) / 4)),
    median: Math.min(100, Math.round(at(0.5) / 4)),
    meanX10: Math.min(1000, Math.round(((sum / sorted.length) / 4) * 10)),
    p90: Math.min(100, Math.round(at(0.9) / 4)),
    max: Math.min(100, Math.round(sorted[sorted.length - 1]! / 4)),
  };
}

export function snapshotSquadEconomyDiagnostics(
  economy: SquadEconomyState,
  lifecycle: PlayerLifecycleState,
  seasonNumber: number,
  calendarYear: number,
): EconomyDiagnosticSeasonSnapshot {
  const payrolls = economy.clubBudgets
    .map((b) => b.committedWagesK + b.deadCapWagesK)
    .sort((a, b) => a - b);
  const clubsOverspentCount = economy.clubBudgets.filter(
    (b) => b.committedWagesK + b.deadCapWagesK > b.annualWageBudgetK,
  ).length;

  const byId = new Map(lifecycle.activeWorld.players.map((p) => [p.playerId, p]));
  let clubsWithRoleShortageCount = 0;
  for (const team of lifecycle.activeWorld.teams) {
    const squad = team.squadIds.map((id) => byId.get(id)!);
    if (
      squad.length < MIN_ACTIVE_TEAM_SQUAD_SIZE ||
      squad.filter((p) => p.role === "KEEPER").length < 1 ||
      squad.filter(isBowlingCapable).length < 5
    ) {
      clubsWithRoleShortageCount += 1;
    }
  }

  const seasonLedger = economy.ledger.filter((e) => e.seasonNumber === seasonNumber);
  return EconomyDiagnosticSeasonSnapshotSchema.parse({
    seasonNumber,
    calendarYear,
    activeContractCount: economy.contracts.length,
    freeAgentPoolCount: economy.freeAgents.length,
    minClubPayrollUsedK: payrolls[0]!,
    medianClubPayrollUsedK: payrolls[Math.floor(payrolls.length / 2)]!,
    maxClubPayrollUsedK: payrolls[payrolls.length - 1]!,
    clubWageBudgetK: economy.model.annualClubWageBudgetK,
    clubsOverspentCount,
    clubsWithRoleShortageCount,
    seasonFreeAgentSigningsCount: seasonLedger.filter((e) => e.type === "FREE_AGENT_SIGNED").length,
    seasonRenewalsCount: seasonLedger.filter((e) => e.type === "CONTRACT_RENEWED").length,
    seasonExpiredToFreeAgencyCount: seasonLedger.filter(
      (e) => e.type === "CONTRACT_EXPIRED_TO_FREE_AGENCY",
    ).length,
    seasonReleaseBuyoutsCount: seasonLedger.filter(
      (e) => e.type === "CONTRACT_RELEASE_BUYOUT",
    ).length,
    wageDistributionK: summarizeWageBand(economy.contracts.map((c) => c.annualWageK)),
    aiHiddenFutureAbilityReads: 0,
  });
}

export function runSquadEconomyDiagnosticHorizon(input: {
  worldIdentity: PersistentWorldIdentity;
  baseWorld: WorldPack;
  worldCopy?: NewGameWorldCopy | null;
  seasons: number;
  startCalendarYear?: number;
  startDate?: string;
  controlledTeamId?: string | null;
  simulateFullMatches?: boolean;
}): {
  snapshots: EconomyDiagnosticSeasonSnapshot[];
  finalLifecycle: PlayerLifecycleState;
  finalEconomy: SquadEconomyState;
  totalLedgerEntries: number;
} {
  assertEconomy(input.seasons >= 1 && input.seasons <= 200, "INVALID_DIAGNOSTIC_HORIZON");
  const startCalendarYear = input.startCalendarYear ?? 2026;
  const startDate = input.startDate ?? "2026-04-04";
  const monthDay = startDate.slice(5, 10);

  let lifecycle = createInitialPlayerLifecycleState({
    worldIdentity: input.worldIdentity,
    baseWorld: input.baseWorld,
    worldCopy: input.worldCopy ?? null,
    seasonNumber: 1,
    calendarYear: startCalendarYear,
    useRosterPackImmediately: true,
  });
  let economy = createInitialSquadEconomyState({
    worldIdentity: input.worldIdentity,
    lifecycle,
    seasonNumber: 1,
    calendarYear: startCalendarYear,
    currentDate: startDate,
  });

  const snapshots: EconomyDiagnosticSeasonSnapshot[] = [];
  let priorStats: RecentPlayerSeasonStatsSummary[] = [];

  for (let s = 1; s <= input.seasons; s += 1) {
    const calendarYear = startCalendarYear + (s - 1);
    const seasonDate = `${String(calendarYear).padStart(4, "0")}-${monthDay}`;

    // Run all 3 persistent pre-season negotiation rounds across all clubs!
    for (let r = 1; r <= MAX_NEGOTIATION_ROUNDS_PER_WINDOW; r += 1) {
      const res = resolveNegotiationRound({
        economy,
        lifecycle,
        worldIdentity: input.worldIdentity,
        controlledTeamId: input.controlledTeamId ?? null,
        seasonNumber: s,
        calendarYear,
        currentDate: seasonDate,
        recentStats: priorStats,
        rawRequest: {
          command: "RESOLVE_NEGOTIATION_ROUND",
          commandId: `diag-resolve-s${s}-r${r}`,
          seasonNumber: s,
          expectedRound: r,
        },
      });
      economy = res.economy;
      lifecycle = res.lifecycle;
    }

    snapshots.push(snapshotSquadEconomyDiagnostics(economy, lifecycle, s, calendarYear));
    if (s === input.seasons) break;

    // Simulate season workloads (either full 56-match engine or fast deterministic workload)
    const statsByPlayer = new Map<
      string,
      {
        playerId: string;
        matches: number;
        runs: number;
        wickets: number;
        ballsFaced: number;
        bowlingLegalBalls: number;
      }
    >();
    for (const p of lifecycle.activeWorld.players) {
      statsByPlayer.set(p.playerId, {
        playerId: p.playerId,
        matches: 0,
        runs: 0,
        wickets: 0,
        ballsFaced: 0,
        bowlingLegalBalls: 0,
      });
    }

    const seasonSeed = `${input.worldIdentity.baseSeed}-econ-diag-s${s}`;
    if (input.simulateFullMatches === true) {
      const pack = lifecycle.activeRosterPack!;
      const schedule = generateRosterSeasonSchedule(pack, {
        seasonId: `econ-diag-s${s}`,
        gameId: `econ-diag-g${s}`,
        seasonSeed,
        startDate: seasonDate,
      });
      let careerState = createRosterCareerDayState("econ-diag", schedule, pack);
      let elapsed = 0;
      for (const fixture of schedule.fixtures) {
        while (careerState.currentDate < fixture.matchDayDate) {
          careerState = advanceRosterCareerDay(careerState, schedule, pack);
          elapsed += 1;
        }
        const sim = simulateRosterOffscreenFixture(pack, schedule, careerState, fixture.fixtureId);
        careerState = sim.careerState;
        for (const sel of sim.outcome.selectedTeams) {
          for (const pid of sel.playerIds) statsByPlayer.get(pid)!.matches += 1;
        }
        for (const inn of sim.outcome.scorecard.innings) {
          for (const [pid, line] of Object.entries(inn.batting)) {
            const row = statsByPlayer.get(pid)!;
            row.runs += line.runs;
            row.ballsFaced += line.ballsFaced;
          }
          for (const [pid, line] of Object.entries(inn.bowling)) {
            const row = statsByPlayer.get(pid)!;
            row.wickets += line.wickets;
            row.bowlingLegalBalls += line.legalBalls;
          }
        }
      }
      lifecycle = recordElapsedTrainingExposure(lifecycle, careerState.trainingAssignments, elapsed);
    } else {
      const rng = createRandomService();
      const assignments: { playerId: string; directive: TrainingDirective }[] = [];
      const byId = new Map(lifecycle.activeWorld.players.map((p) => [p.playerId, p]));
      for (const team of lifecycle.activeWorld.teams) {
        const squad = team.squadIds.map((pid) => byId.get(pid)!);
        squad.forEach((p, idx) => {
          const draw = (k: number, span: number) =>
            rng.uint32({
              seed: seasonSeed,
              domain: "CAREER_TRAINING",
              entityId: `${team.teamId}:${p.playerId}`,
              eventOrdinal: s,
              stageName: "econ_diag_workload",
              drawIndex: k,
            }) % span;
          const matches = idx < 11 ? 10 + draw(0, 5) : draw(0, 5);
          const runs =
            p.role === "BATTER" || p.role === "KEEPER"
              ? matches * (18 + draw(1, 16))
              : p.role === "ALLROUNDER"
                ? matches * (14 + draw(1, 12))
                : matches * (4 + draw(1, 5));
          const wickets =
            p.role === "BOWLER"
              ? Math.floor((matches * (8 + draw(2, 10))) / 10)
              : p.role === "ALLROUNDER"
                ? Math.floor((matches * (6 + draw(2, 8))) / 10)
                : 0;
          const row = statsByPlayer.get(p.playerId)!;
          row.matches = matches;
          row.runs = runs;
          row.wickets = wickets;
          row.ballsFaced = Math.round(runs * 0.78);
          row.bowlingLegalBalls =
            p.role === "BOWLER" ? matches * 20 : p.role === "ALLROUNDER" ? matches * 12 : 0;
          assignments.push({
            playerId: p.playerId,
            directive:
              idx % 5 === 0
                ? "REST"
                : p.role === "BOWLER"
                  ? "BOWLING_PRACTICE"
                  : "BATTING_PRACTICE",
          });
        });
      }
      lifecycle = recordElapsedTrainingExposure(lifecycle, assignments, 45);
    }

    const seasonStatsList = [...statsByPlayer.values()];
    priorStats = seasonStatsList;
    const rolled = advanceLifecycleAndEconomyAtSeasonClose({
      lifecycle,
      economy,
      worldIdentity: input.worldIdentity,
      fromSeasonNumber: s,
      toSeasonNumber: s + 1,
      closedCalendarYear: calendarYear,
      nextCalendarYear: calendarYear + 1,
      rolloverDate: `${String(calendarYear + 1).padStart(4, "0")}-${monthDay}`,
      seasonPlayerStats: seasonStatsList,
      controlledTeamId: input.controlledTeamId ?? null,
    });
    lifecycle = rolled.lifecycle;
    economy = rolled.economy;
  }

  return {
    snapshots,
    finalLifecycle: lifecycle,
    finalEconomy: economy,
    totalLedgerEntries: economy.ledger.length,
  };
}
