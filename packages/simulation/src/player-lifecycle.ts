import {
  AcademyTrainingFocusSchema,
  canonicalJson,
  CompletedLifecycleMatchEventArchiveCoreSchema,
  CompletedLifecycleMatchEventArchiveSchema,
  FictionalPlayerLifecycleModelSchema,
  FormatSkillsSchema,
  LIFECYCLE_MATCH_EVENT_ARCHIVE_VERSION,
  LifecycleDiagnosticSeasonSnapshotSchema,
  LifecycleSeasonStateCoreSchema,
  LifecycleSeasonStateSchema,
  MAX_ACTIVE_TEAM_SQUAD_SIZE,
  MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES,
  MIN_ACTIVE_TEAM_SQUAD_SIZE,
  PLAYER_LIFECYCLE_MODEL_VERSION,
  PLAYER_LIFECYCLE_STATE_VERSION,
  PlayerLifecycleStateCoreSchema,
  PlayerLifecycleStateSchema,
  PlayerSchema,
  PromoteYouthProspectRequestSchema,
  RetiredPlayerRecordSchema,
  RosterMatchPreparationSchema,
  SeasonLifecycleTransitionRecordCoreSchema,
  SeasonLifecycleTransitionRecordSchema,
  SetAcademyProspectFocusRequestSchema,
  SetAcademyProspectQueueRequestSchema,
  TARGET_ACTIVE_TEAM_SQUAD_SIZE,
  T20SeasonMatchCompletionSchema,
  YOUTH_PROSPECTS_PER_TEAM_PER_SEASON,
  YouthProspectSchema,
  type AcademyTrainingFocus,
  type ActivePersistentSeasonState,
  type CompletedLifecycleMatchEventArchive,
  type FictionalPlayerLifecycleModel,
  type FormatSkills,
  type LifecycleAbilityBandSummary,
  type LifecycleDiagnosticSeasonSnapshot,
  type LifecycleSeasonState,
  type NewGameWorldCopy,
  type PersistentWorldIdentity,
  type Player,
  type PlayerLifecycleSkillLedgerEntry,
  type PlayerLifecycleState,
  type PlayerSeasonDevelopmentReport,
  type PlayerSkillDeltaSummary,
  type PlayerTrainingExposureRecord,
  type DeliveryRecorded,
  type RetiredPlayerRecord,
  type StagedRosterPack,
  type T20SeasonMatchCompletion,
  type TrainingDirective,
  type WorldPack,
  type YouthCeilingTier,
  type YouthProspect,
} from "@lcxxvi/contracts";
import { isBowlingCapable, RULE_MANIFESTS, SYNTHETIC_ALPHA_PACK } from "@lcxxvi/data";
import { type CareerArchivedReplaySummary } from "./career-replay.js";
import { canonicalStateBytes, createRandomService, createStateHasher, sha256Hex } from "./determinism.js";
import { advanceRosterCareerDay, createRosterCareerDayState } from "./roster-career-condition.js";
import { createStagedRosterPack, validateStagedRosterPack } from "./roster-import.js";
import { simulateRosterOffscreenFixture } from "./roster-offscreen-fixture.js";
import { generateRosterSeasonSchedule, validateRosterSeasonSchedule } from "./roster-season-schedule.js";
import { createRosterT20Session, type RosterT20Session } from "./roster-t20-match.js";
import {
  eventChainManifest,
  projectT20Scorecard,
  replayT20EventsFromInitial,
  type T20Session,
} from "./t20-match.js";

const hasher = createStateHasher();

const ALLOWED_RULES = RULE_MANIFESTS.map((rule) => rule.rulesId);
const ALLOWED_VARIATIONS = SYNTHETIC_ALPHA_PACK.manifest.variationIds;

const FIRST_NAMES = [
  "Alden", "Arven", "Bram", "Caelen", "Caro", "Corin", "Daelen", "Doran",
  "Elio", "Evren", "Fenn", "Galen", "Halen", "Ivor", "Joren", "Kael",
  "Linden", "Maren", "Nerin", "Orin", "Perrin", "Quinlan", "Riven", "Sela",
  "Soren", "Talor", "Tarin", " Torin".trim(), "Ulen", "Varen", "Wren", "Zerin",
] as const;

const SURNAMES = [
  "Ashbrook", "Briarholt", "Calder", "Clearwater", "Dunmere", "Elmcroft",
  "Elmholt", "Fairhaven", "Fenwick", "Glenthorne", "Greyford", "Harden",
  "Highmoor", "Holloway", "Jorthorne", "Kelholt", "Larkspur", "Marlowe",
  "Millbrook", "Normere", "Oakridge", "Orinbridge", "Ravenshaw", "Redfern",
  "Rookwood", "Sablebrook", "Sablestone", "Silvermere", "Stonebridge", "Thornfield",
  "Valebridge", "Windmere",
] as const;

const BOWLING_STYLES = [
  "FAST",
  "MEDIUM",
  "OFF_SPIN",
  "LEG_SPIN",
  "SLOW_LEFT_ARM",
  "LEFT_ARM_WRIST",
] as const;

const BATTING_KEYS = ["defence", "timing", "power", "rotation", "vsPace", "vsSpin"] as const;
const BOWLING_KEYS = ["control", "movement", "variation"] as const;
const FIELDING_KEYS = ["catching", "groundFielding", "throwing"] as const;

export const FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1: FictionalPlayerLifecycleModel =
  FictionalPlayerLifecycleModelSchema.parse({
    modelVersion: PLAYER_LIFECYCLE_MODEL_VERSION,
    calibrationStatus: "FICTIONAL_PLACEHOLDER",
    disclaimer:
      "Fictional player lifecycle parameters (v1): permanent skill development, ageing, retirement, and youth intake use deterministic gameplay curves and are not empirically calibrated. Contracts and budgets are excluded.",
    minPermanentSkill: 18,
    maxPermanentSkill: 86,
    youthMinAgeYears: 17,
    youthMaxAgeYears: 19,
    growthWindowMaxAgeYears: 25,
    primeWindowMaxAgeYears: 30,
    earliestVoluntaryRetirementAgeYears: 34,
    mandatoryRetirementAgeYears: 40,
    minSquadKeepers: 2,
    minSquadBowlingCapable: 7,
  });

function assertLifecycle(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`LC_PLAYER_LIFECYCLE_${code}`);
}

function clampSkill(value: number, model: FictionalPlayerLifecycleModel): number {
  return Math.max(model.minPermanentSkill, Math.min(model.maxPermanentSkill, Math.round(value)));
}

function meanInt(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / values.length);
}

export function playerAgeInSeason(birthDate: string, calendarYear: number): number {
  const birthYear = Number.parseInt(birthDate.slice(0, 4), 10);
  assertLifecycle(Number.isInteger(birthYear) && birthYear >= 1900, `INVALID_BIRTH_DATE:${birthDate}`);
  return Math.max(16, calendarYear - birthYear);
}

export function summarizeT20SkillAverages(skills: FormatSkills): {
  batting: number;
  bowling: number;
  fielding: number;
  keeping: number;
  stamina: number;
} {
  return {
    batting: meanInt(BATTING_KEYS.map((k) => skills[k])),
    bowling: meanInt([...BOWLING_KEYS.map((k) => skills[k]), skills.stamina]),
    fielding: meanInt(FIELDING_KEYS.map((k) => skills[k])),
    keeping: skills.keeping,
    stamina: skills.stamina,
  };
}

function zeroDeltaSummary(): PlayerSkillDeltaSummary {
  return {
    battingDelta: 0,
    bowlingDelta: 0,
    fieldingDelta: 0,
    keepingDelta: 0,
    staminaDelta: 0,
  };
}

export function applyWorldCopyOverlay(baseWorld: WorldPack, worldCopy?: NewGameWorldCopy | null): WorldPack {
  if (!worldCopy) return structuredClone(baseWorld);
  return structuredClone(worldCopy.world);
}

export function buildLifecycleRosterPack(
  activeWorld: WorldPack,
  worldId: string,
  seasonNumber: number,
  registrationRevision: number,
): StagedRosterPack {
  const sourcePayload = {
    version: "LC_ROSTER_IMPORT_V1" as const,
    sourceId: `lifecycle-${worldId}-s${seasonNumber}-r${registrationRevision}`.slice(0, 120),
    world: {
      packId: activeWorld.packId,
      schemaVersion: activeWorld.schemaVersion,
      provenance: activeWorld.provenance,
      rulesIds: [...activeWorld.rulesIds],
      grounds: activeWorld.grounds.map((g) => structuredClone(g)),
      teams: activeWorld.teams.map((t) => ({
        ...structuredClone(t),
        squadIds: [...t.squadIds],
      })),
      players: activeWorld.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        birthDate: p.birthDate,
        batHand: p.batHand,
        bowlHand: p.bowlHand,
        bowlingStyle: p.bowlingStyle,
        role: p.role,
        skills: structuredClone(p.skills),
        variations: [...p.variations],
        shotSectorWeights: [...p.shotSectorWeights],
        exposureBalls: structuredClone(p.exposureBalls),
      })),
    },
  };
  return createStagedRosterPack(canonicalJson(sourcePayload), ALLOWED_RULES, ALLOWED_VARIATIONS);
}

export function sealPlayerLifecycleState(coreInput: Omit<PlayerLifecycleState, "lifecycleSha256">): PlayerLifecycleState {
  const core = PlayerLifecycleStateCoreSchema.parse(coreInput);
  const lifecycleSha256 = sha256Hex(canonicalStateBytes(core));
  return PlayerLifecycleStateSchema.parse({ ...core, lifecycleSha256 });
}

export function validatePlayerLifecycleState(raw: unknown): PlayerLifecycleState {
  const parsed = PlayerLifecycleStateSchema.parse(raw);
  const { lifecycleSha256, ...coreRaw } = parsed;
  const core = PlayerLifecycleStateCoreSchema.parse(coreRaw);
  assertLifecycle(sha256Hex(canonicalStateBytes(core)) === lifecycleSha256, "HASH_MISMATCH");
  if (core.activeRosterPack) {
    validateStagedRosterPack(core.activeRosterPack, ALLOWED_RULES, ALLOWED_VARIATIONS);
  }
  const activeIds = new Set(core.activeWorld.players.map((p) => p.playerId));
  const retiredIds = new Set(core.retiredPlayers.map((r) => r.playerId));
  for (const id of activeIds) {
    assertLifecycle(!retiredIds.has(id), `ACTIVE_PLAYER_IS_RETIRED:${id}`);
  }
  for (const team of core.activeWorld.teams) {
    assertLifecycle(
      team.squadIds.length >= MIN_ACTIVE_TEAM_SQUAD_SIZE &&
        team.squadIds.length <= MAX_ACTIVE_TEAM_SQUAD_SIZE,
      `INVALID_SQUAD_SIZE:${team.teamId}:${team.squadIds.length}`,
    );
    const squadPlayers = team.squadIds.map((id) => {
      const found = core.activeWorld.players.find((p) => p.playerId === id);
      assertLifecycle(Boolean(found), `MISSING_SQUAD_PLAYER:${id}`);
      return found!;
    });
    assertLifecycle(
      squadPlayers.some((p) => p.role === "KEEPER"),
      `MISSING_KEEPER:${team.teamId}`,
    );
    assertLifecycle(
      squadPlayers.filter(isBowlingCapable).length >= 5,
      `INSUFFICIENT_BOWLERS:${team.teamId}`,
    );
  }
  return parsed;
}

export function sealLifecycleSeasonState(coreInput: Omit<LifecycleSeasonState, "stateSha256">): LifecycleSeasonState {
  const core = LifecycleSeasonStateCoreSchema.parse(coreInput);
  const stateSha256 = sha256Hex(canonicalStateBytes(core));
  return LifecycleSeasonStateSchema.parse({ ...core, stateSha256 });
}

export function validateLifecycleSeasonState(
  raw: unknown,
  pack: StagedRosterPack,
): LifecycleSeasonState {
  const state = LifecycleSeasonStateSchema.parse(raw);
  const { stateSha256, ...coreRaw } = state;
  const core = LifecycleSeasonStateCoreSchema.parse(coreRaw);
  assertLifecycle(sha256Hex(canonicalStateBytes(core)) === stateSha256, "SEASON_HASH_MISMATCH");
  const validatedPack = validateStagedRosterPack(pack, ALLOWED_RULES, ALLOWED_VARIATIONS);
  const packSha = hasher.hash(validatedPack);
  assertLifecycle(state.rosterPackSha256 === packSha, "SEASON_ROSTER_PACK_HASH_MISMATCH");
  validateRosterSeasonSchedule(state.schedule, validatedPack);
  assertLifecycle(
    state.completedMatches.length === state.projection.revision &&
      (state.completedMatches.length === 56) === (state.phase === "COMPLETE"),
    "SEASON_COMPLETION_COUNT_MISMATCH",
  );
  return state;
}

function generateYouthProspect(
  worldIdentity: PersistentWorldIdentity,
  seasonNumber: number,
  calendarYear: number,
  teamId: string,
  intakeRank: number,
  forcedRole: Player["role"] | null,
  forcedSpinOrPace: "PACE" | "SPIN" | null,
): YouthProspect {
  const rng = createRandomService();
  const seed = `${worldIdentity.baseSeed}:youth-s${seasonNumber}`.slice(0, 256);
  const stageName = `academy-${intakeRank}`;
  let drawIndex = 0;
  const nextInt = (min: number, maxInclusive: number): number => {
    const span = maxInclusive - min + 1;
    const val =
      rng.uint32({
        seed,
        domain: "WORLD_GENERATION",
        entityId: teamId,
        eventOrdinal: seasonNumber,
        stageName,
        drawIndex: drawIndex++,
      }) % span;
    return min + val;
  };

  const ageYears = nextInt(
    FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1.youthMinAgeYears,
    FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1.youthMaxAgeYears,
  );
  const birthYear = calendarYear - ageYears;
  const birthMonth = String(nextInt(1, 12)).padStart(2, "0");
  const birthDay = String(nextInt(1, 28)).padStart(2, "0");
  const birthDate = `${birthYear}-${birthMonth}-${birthDay}`;

  const firstName = FIRST_NAMES[nextInt(0, FIRST_NAMES.length - 1)]!;
  const surname = SURNAMES[nextInt(0, SURNAMES.length - 1)]!;
  const name = `${firstName} ${surname}`;

  const roleRoll = nextInt(0, 99);
  const role: Player["role"] =
    forcedRole ??
    (roleRoll < 44
      ? "BATTER"
      : roleRoll < 74
        ? "BOWLER"
        : roleRoll < 90
          ? "ALLROUNDER"
          : "KEEPER");

  const tierRoll = nextInt(0, 99);
  const fictionalCeilingTier: YouthCeilingTier =
    tierRoll < 50
      ? "ACADEMY_GRADUATE"
      : tierRoll < 85
        ? "FIRST_TEAM_PROSPECT"
        : "HIGH_CEILING_PROSPECT";
  const tierBonus =
    fictionalCeilingTier === "HIGH_CEILING_PROSPECT"
      ? 5
      : fictionalCeilingTier === "FIRST_TEAM_PROSPECT"
        ? 2
        : 0;

  const batHand = nextInt(0, 99) < 32 ? "L" : "R";
  const bowlHand = nextInt(0, 99) < 26 ? "L" : "R";

  let bowlingStyle: Player["bowlingStyle"] = null;
  if (role === "BOWLER" || role === "ALLROUNDER") {
    if (forcedSpinOrPace === "PACE") {
      bowlingStyle = nextInt(0, 1) === 0 ? "FAST" : "MEDIUM";
    } else if (forcedSpinOrPace === "SPIN") {
      const spinOptions = ["OFF_SPIN", "LEG_SPIN", "SLOW_LEFT_ARM", "LEFT_ARM_WRIST"] as const;
      bowlingStyle = spinOptions[nextInt(0, spinOptions.length - 1)]!;
    } else {
      bowlingStyle = BOWLING_STYLES[nextInt(0, BOWLING_STYLES.length - 1)]!;
    }
  }

  const buildFormatSkills = (formatJitter: number): FormatSkills => {
    const batBase =
      role === "BATTER"
        ? 58 + tierBonus
        : role === "ALLROUNDER"
          ? 49 + tierBonus
          : role === "KEEPER"
            ? 47 + tierBonus
            : 28 + Math.floor(tierBonus / 2);
    const bowlBase =
      role === "BOWLER"
        ? 57 + tierBonus
        : role === "ALLROUNDER"
          ? 49 + tierBonus
          : 23;
    const fieldBase = 50 + Math.floor(tierBonus / 2);
    const keepBase = role === "KEEPER" ? 61 + tierBonus : 21 + nextInt(0, 8);

    const skill = (base: number, spread: number) =>
      clampSkill(base + nextInt(-spread, spread) + formatJitter, FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1);

    return FormatSkillsSchema.parse({
      defence: skill(batBase, 5),
      timing: skill(batBase + 1, 5),
      power: skill(batBase + 2, 6),
      rotation: skill(batBase, 5),
      vsPace: skill(batBase + 1, 5),
      vsSpin: skill(batBase, 5),
      control: skill(bowlBase, 5),
      movement: skill(bowlBase, 5),
      variation: skill(bowlBase + 1, 5),
      stamina: skill(role === "BOWLER" || role === "ALLROUNDER" ? 50 + tierBonus : 38, 5),
      catching: skill(fieldBase + 1, 5),
      groundFielding: skill(fieldBase, 5),
      throwing: skill(fieldBase, 5),
      keeping: clampSkill(keepBase + nextInt(-3, 4), FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1),
    });
  };

  const t20Skills = buildFormatSkills(0);
  const odiSkills = buildFormatSkills(nextInt(-2, 2));
  const redSkills = buildFormatSkills(nextInt(-2, 2));

  const teamCompact = teamId.replaceAll(/[^A-Za-z0-9]/g, "");
  const playerId = `py-s${String(seasonNumber).padStart(3, "0")}-${teamCompact}-${intakeRank}`;
  const prospectId = `acad-s${String(seasonNumber).padStart(3, "0")}-${teamCompact}-${intakeRank}`;
  const sourceSeedDigest = sha256Hex(
    canonicalStateBytes({ worldId: worldIdentity.worldId, seasonNumber, teamId, intakeRank, playerId }),
  );

  const player: Player = PlayerSchema.parse({
    playerId,
    name,
    birthDate,
    batHand,
    bowlHand,
    bowlingStyle,
    role,
    skills: {
      T20: t20Skills,
      ODI: odiSkills,
      RED_BALL: redSkills,
    },
    variations: ["stock"],
    shotSectorWeights: Array.from({ length: 8 }, () => nextInt(250, 950)),
    exposureBalls: { T20: 0, ODI: 0, RED_BALL: 0 },
    provenance: {
      kind: "FICTIONAL",
      sourceId: "fictional-youth-pathway-v1",
      sourceHash: sourceSeedDigest,
      confidenceBp: 3000,
    },
  });

  const defaultFocus: AcademyTrainingFocus =
    role === "BATTER"
      ? "BATTING_PRACTICE"
      : role === "BOWLER"
        ? "BOWLING_PRACTICE"
        : role === "KEEPER"
          ? "FIELDING_PRACTICE"
          : "BALANCED";

  return YouthProspectSchema.parse({
    prospectId,
    teamId,
    generatedInSeasonNumber: seasonNumber,
    generatedCalendarYear: calendarYear,
    intakeRank,
    fictionalCeilingTier,
    academyFocus: defaultFocus,
    queuedForPromotion: false,
    promotedInSeasonNumber: null,
    player,
  });
}

export function generateSeasonYouthAcademyClass(
  worldIdentity: PersistentWorldIdentity,
  activeWorld: WorldPack,
  seasonNumber: number,
  calendarYear: number,
): YouthProspect[] {
  const byId = new Map(activeWorld.players.map((p) => [p.playerId, p]));
  const prospects: YouthProspect[] = [];
  const sortedTeams = [...activeWorld.teams].sort((a, b) => a.teamId.localeCompare(b.teamId));
  for (const team of sortedTeams) {
    const squad = team.squadIds.map((id) => byId.get(id)!).filter(Boolean);
    const keeperCount = squad.filter((p) => p.role === "KEEPER").length;
    const youngOrPrimeKeepers = squad.filter(
      (p) => p.role === "KEEPER" && playerAgeInSeason(p.birthDate, calendarYear + 1) < 33,
    ).length;
    const bowlingCount = squad.filter(isBowlingCapable).length;
    const paceCount = squad.filter((p) => p.bowlingStyle === "FAST" || p.bowlingStyle === "MEDIUM").length;
    const spinCount = squad.filter(
      (p) =>
        p.bowlingStyle === "OFF_SPIN" ||
        p.bowlingStyle === "LEG_SPIN" ||
        p.bowlingStyle === "SLOW_LEFT_ARM" ||
        p.bowlingStyle === "LEFT_ARM_WRIST",
    ).length;

    for (let slot = 1; slot <= YOUTH_PROSPECTS_PER_TEAM_PER_SEASON; slot++) {
      let forcedRole: Player["role"] | null = null;
      let forcedSpinOrPace: "PACE" | "SPIN" | null = null;
      if (
        slot === 1 &&
        (keeperCount <= FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1.minSquadKeepers ||
          youngOrPrimeKeepers < FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1.minSquadKeepers)
      ) {
        forcedRole = "KEEPER";
      } else if (slot === 2 && bowlingCount <= FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1.minSquadBowlingCapable + 1) {
        forcedRole = "BOWLER";
        forcedSpinOrPace = paceCount <= spinCount ? "PACE" : "SPIN";
      } else if (slot === 3) {
        // Guarantee every academy intake includes at least one bowling-capable option or batter balance
        if (bowlingCount < 8) {
          forcedRole = slot % 2 === 0 ? "BOWLER" : "ALLROUNDER";
        }
      }
      prospects.push(
        generateYouthProspect(
          worldIdentity,
          seasonNumber,
          calendarYear,
          team.teamId,
          slot,
          forcedRole,
          forcedSpinOrPace,
        ),
      );
    }
  }
  return prospects;
}

export function createInitialPlayerLifecycleState(input: {
  worldIdentity: PersistentWorldIdentity;
  baseWorld: WorldPack;
  worldCopy?: NewGameWorldCopy | null;
  seasonNumber?: number;
  calendarYear: number;
  useRosterPackImmediately?: boolean;
}): PlayerLifecycleState {
  const seasonNumber = input.seasonNumber ?? 1;
  const activeWorld = applyWorldCopyOverlay(input.baseWorld, input.worldCopy ?? null);
  const sortedPlayers = [...activeWorld.players].sort((a, b) => a.playerId.localeCompare(b.playerId));
  const skillLedger: PlayerLifecycleSkillLedgerEntry[] = sortedPlayers.map((p) => ({
    playerId: p.playerId,
    debutSeasonNumber: seasonNumber,
    careerEntryT20Skills: structuredClone(p.skills.T20!),
    priorSeasonT20Skills: structuredClone(p.skills.T20!),
    lastSeasonDelta: zeroDeltaSummary(),
  }));
  const seasonTrainingExposure: PlayerTrainingExposureRecord[] = sortedPlayers.map((p) => ({
    playerId: p.playerId,
    battingPracticeDays: 0,
    bowlingPracticeDays: 0,
    fieldingPracticeDays: 0,
    restDays: 0,
  }));
  const youthAcademy = generateSeasonYouthAcademyClass(
    input.worldIdentity,
    activeWorld,
    seasonNumber,
    input.calendarYear,
  );
  const activeRosterPack = input.useRosterPackImmediately
    ? buildLifecycleRosterPack(activeWorld, input.worldIdentity.worldId, seasonNumber, 0)
    : null;
  return sealPlayerLifecycleState({
    lifecycleVersion: PLAYER_LIFECYCLE_STATE_VERSION,
    model: FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1,
    activeWorld: activeRosterPack ? structuredClone(activeRosterPack.world) : activeWorld,
    activeRosterPack,
    historicalRosterPacks: activeRosterPack ? [activeRosterPack] : [],
    skillLedger,
    seasonTrainingExposure,
    retiredPlayers: [],
    youthAcademy,
    transitions: [],
    squadRegistrationRevision: 0,
  });
}

/**
 * Records elapsed training exposure strictly from committed calendar day advances (`daysElapsed >= 1`).
 * Toggling directives in menus (`daysElapsed === 0`) never mutates exposure or skills.
 */
export function recordElapsedTrainingExposure(
  lifecycle: PlayerLifecycleState,
  trainingAssignments: readonly { playerId: string; directive: TrainingDirective }[],
  daysElapsed: number,
): PlayerLifecycleState {
  if (daysElapsed <= 0) return lifecycle;
  const directiveByPlayer = new Map(trainingAssignments.map((a) => [a.playerId, a.directive]));
  const nextExposure = lifecycle.seasonTrainingExposure.map((entry) => {
    const directive = directiveByPlayer.get(entry.playerId) ?? "REST";
    return {
      playerId: entry.playerId,
      battingPracticeDays:
        entry.battingPracticeDays + (directive === "BATTING_PRACTICE" ? daysElapsed : 0),
      bowlingPracticeDays:
        entry.bowlingPracticeDays + (directive === "BOWLING_PRACTICE" ? daysElapsed : 0),
      fieldingPracticeDays:
        entry.fieldingPracticeDays + (directive === "FIELDING_PRACTICE" ? daysElapsed : 0),
      restDays: entry.restDays + (directive === "REST" ? daysElapsed : 0),
    };
  });
  const { lifecycleSha256: _hash, ...core } = lifecycle;
  void _hash;
  return sealPlayerLifecycleState({
    ...core,
    seasonTrainingExposure: nextExposure,
  });
}

export function setAcademyProspectFocus(
  lifecycle: PlayerLifecycleState,
  rawRequest: unknown,
  controlledTeamId: string | null,
): PlayerLifecycleState {
  const request = SetAcademyProspectFocusRequestSchema.parse(rawRequest);
  const prospect = lifecycle.youthAcademy.find((p) => p.prospectId === request.prospectId);
  assertLifecycle(Boolean(prospect), `UNKNOWN_PROSPECT:${request.prospectId}`);
  assertLifecycle(prospect!.promotedInSeasonNumber === null, "PROSPECT_ALREADY_PROMOTED");
  if (controlledTeamId) {
    assertLifecycle(prospect!.teamId === controlledTeamId, "PROSPECT_NOT_IN_MANAGED_ACADEMY");
  }
  if (prospect!.academyFocus === request.academyFocus) return lifecycle;
  const { lifecycleSha256: _hash, ...core } = lifecycle;
  void _hash;
  return sealPlayerLifecycleState({
    ...core,
    youthAcademy: lifecycle.youthAcademy.map((p) =>
      p.prospectId === request.prospectId
        ? { ...p, academyFocus: AcademyTrainingFocusSchema.parse(request.academyFocus) }
        : p,
    ),
  });
}

export function setAcademyProspectPromotionQueue(
  lifecycle: PlayerLifecycleState,
  rawRequest: unknown,
  controlledTeamId: string | null,
): PlayerLifecycleState {
  const request = SetAcademyProspectQueueRequestSchema.parse(rawRequest);
  const prospect = lifecycle.youthAcademy.find((p) => p.prospectId === request.prospectId);
  assertLifecycle(Boolean(prospect), `UNKNOWN_PROSPECT:${request.prospectId}`);
  assertLifecycle(prospect!.promotedInSeasonNumber === null, "PROSPECT_ALREADY_PROMOTED");
  if (controlledTeamId) {
    assertLifecycle(prospect!.teamId === controlledTeamId, "PROSPECT_NOT_IN_MANAGED_ACADEMY");
  }
  if (prospect!.queuedForPromotion === request.queuedForPromotion) return lifecycle;
  const { lifecycleSha256: _hash, ...core } = lifecycle;
  void _hash;
  return sealPlayerLifecycleState({
    ...core,
    youthAcademy: lifecycle.youthAcademy.map((p) =>
      p.prospectId === request.prospectId
        ? { ...p, queuedForPromotion: request.queuedForPromotion }
        : p,
    ),
  });
}

/**
 * Promotes an unpromoted Youth Academy prospect into the active senior squad during pre-season
 * (`completedMatches === 0`), regenerating the active roster pack deterministically.
 * Protected against duplicate promotion and squad-cap overflow.
 */
export function promoteYouthProspectPreSeason(input: {
  lifecycle: PlayerLifecycleState;
  worldId: string;
  rawRequest: unknown;
  controlledTeamId: string | null;
}): { lifecycle: PlayerLifecycleState; promotedPlayer: Player } {
  const request = PromoteYouthProspectRequestSchema.parse(input.rawRequest);
  const prospect = input.lifecycle.youthAcademy.find((p) => p.prospectId === request.prospectId);
  assertLifecycle(Boolean(prospect), `UNKNOWN_PROSPECT:${request.prospectId}`);
  assertLifecycle(prospect!.promotedInSeasonNumber === null, "PROSPECT_ALREADY_PROMOTED");
  if (input.controlledTeamId) {
    assertLifecycle(prospect!.teamId === input.controlledTeamId, "PROSPECT_NOT_IN_MANAGED_ACADEMY");
  }
  const team = input.lifecycle.activeWorld.teams.find((t) => t.teamId === prospect!.teamId);
  assertLifecycle(Boolean(team), `UNKNOWN_TEAM:${prospect!.teamId}`);
  assertLifecycle(
    team!.squadIds.length < MAX_ACTIVE_TEAM_SQUAD_SIZE,
    `SQUAD_AT_MAXIMUM_CAPACITY:${team!.teamId}`,
  );
  assertLifecycle(
    !input.lifecycle.activeWorld.players.some((p) => p.playerId === prospect!.player.playerId),
    `DUPLICATE_PLAYER_ID:${prospect!.player.playerId}`,
  );

  const promotedPlayer = structuredClone(prospect!.player);
  const nextPlayers = [...input.lifecycle.activeWorld.players, promotedPlayer].sort((a, b) =>
    a.playerId.localeCompare(b.playerId),
  );
  const nextTeams = input.lifecycle.activeWorld.teams.map((t) =>
    t.teamId === team!.teamId
      ? { ...t, squadIds: [...t.squadIds, promotedPlayer.playerId] }
      : structuredClone(t),
  );
  const nextWorld: WorldPack = {
    ...structuredClone(input.lifecycle.activeWorld),
    teams: nextTeams,
    players: nextPlayers,
  };
  const nextRegistrationRevision = input.lifecycle.squadRegistrationRevision + 1;
  const nextPack = buildLifecycleRosterPack(
    nextWorld,
    input.worldId,
    request.seasonNumber,
    nextRegistrationRevision,
  );
  const nextLedger = [
    ...input.lifecycle.skillLedger,
    {
      playerId: promotedPlayer.playerId,
      debutSeasonNumber: request.seasonNumber,
      careerEntryT20Skills: structuredClone(promotedPlayer.skills.T20!),
      priorSeasonT20Skills: structuredClone(promotedPlayer.skills.T20!),
      lastSeasonDelta: zeroDeltaSummary(),
    },
  ].sort((a, b) => a.playerId.localeCompare(b.playerId));
  const nextExposure = [
    ...input.lifecycle.seasonTrainingExposure,
    {
      playerId: promotedPlayer.playerId,
      battingPracticeDays: 0,
      bowlingPracticeDays: 0,
      fieldingPracticeDays: 0,
      restDays: 0,
    },
  ].sort((a, b) => a.playerId.localeCompare(b.playerId));
  const nextAcademy = input.lifecycle.youthAcademy.map((p) =>
    p.prospectId === prospect!.prospectId
      ? { ...p, queuedForPromotion: false, promotedInSeasonNumber: request.seasonNumber }
      : p,
  );

  const nextHistoricalPacks = input.lifecycle.historicalRosterPacks.some(
    (p) => p.sourceHash === nextPack.sourceHash,
  )
    ? input.lifecycle.historicalRosterPacks
    : [...input.lifecycle.historicalRosterPacks, nextPack];

  return {
    lifecycle: sealPlayerLifecycleState({
      lifecycleVersion: PLAYER_LIFECYCLE_STATE_VERSION,
      model: input.lifecycle.model,
      activeWorld: structuredClone(nextPack.world),
      activeRosterPack: nextPack,
      historicalRosterPacks: nextHistoricalPacks,
      skillLedger: nextLedger,
      seasonTrainingExposure: nextExposure,
      retiredPlayers: input.lifecycle.retiredPlayers,
      youthAcademy: nextAcademy,
      transitions: input.lifecycle.transitions,
      squadRegistrationRevision: nextRegistrationRevision,
    }),
    promotedPlayer,
  };
}

function developPlayerAcrossOffseason(input: {
  player: Player;
  teamId: string;
  worldIdentity: PersistentWorldIdentity;
  fromSeasonNumber: number;
  closedCalendarYear: number;
  nextCalendarYear: number;
  exposure: PlayerTrainingExposureRecord;
  seasonStats: { matches: number; ballsFaced: number; bowlingLegalBalls: number };
  model: FictionalPlayerLifecycleModel;
}): { updatedPlayer: Player; report: PlayerSeasonDevelopmentReport } {
  const { player, model, exposure, seasonStats } = input;
  const ageBefore = playerAgeInSeason(player.birthDate, input.closedCalendarYear);
  const ageAfter = playerAgeInSeason(player.birthDate, input.nextCalendarYear);
  const rng = createRandomService();
  const seed = `${input.worldIdentity.baseSeed}:lifecycle-dev-s${input.fromSeasonNumber}`.slice(0, 256);
  let sub = 0;
  const roll = (label: string, span: number) =>
    rng.uint32({
      seed,
      domain: "CAREER_TRAINING",
      entityId: player.playerId,
      eventOrdinal: input.fromSeasonNumber,
      stageName: label.replaceAll(/[^A-Za-z0-9_.:-]/g, "-"),
      drawIndex: sub++,
    }) % span;

  const phaseLabel: PlayerSeasonDevelopmentReport["phaseLabel"] =
    ageAfter <= 21
      ? "YOUTH_GROWTH"
      : ageAfter <= model.growthWindowMaxAgeYears
        ? "EARLY_DEVELOPMENT"
        : ageAfter <= model.primeWindowMaxAgeYears
          ? "PRIME_MAINTENANCE"
          : "VETERAN_DECLINE";

  // Calculate discipline deltas using deterministic integer rules + diminishing returns
  const currentT20 = player.skills.T20!;
  const currentSummary = summarizeT20SkillAverages(currentT20);

  const growthStep = (currentAvg: number, rolePrimary: boolean, practiceDays: number, matchLoad: number): number => {
    const practiceBonus = practiceDays >= 12 ? 1 : practiceDays >= 5 && roll("prac", 100) < 55 ? 1 : 0;
    const matchBonus = matchLoad >= 1 ? (roll("match", 100) < 60 ? 1 : 0) : 0;
    if (phaseLabel === "YOUTH_GROWTH") {
      let gain = (rolePrimary ? 1 : 0) + practiceBonus + matchBonus;
      if (roll("youth", 100) < (rolePrimary ? 65 : 25)) gain += 1;
      if (currentAvg >= 74) gain = Math.min(gain, 1);
      if (currentAvg >= 80) gain = 0;
      return Math.min(3, gain);
    }
    if (phaseLabel === "EARLY_DEVELOPMENT") {
      let gain = practiceBonus + matchBonus;
      if (rolePrimary && roll("early", 100) < 45) gain += 1;
      if (currentAvg >= 73) gain = Math.min(gain, 1);
      if (currentAvg >= 79) gain = 0;
      return Math.min(2, gain);
    }
    if (phaseLabel === "PRIME_MAINTENANCE") {
      if (ageAfter <= 28) {
        let delta = practiceBonus > 0 && matchLoad > 0 && roll("primeUp", 100) < 40 ? 1 : 0;
        if (currentAvg >= 77) delta = 0;
        if (seasonStats.matches === 0 && practiceDays === 0 && roll("rust", 100) < 35) delta -= 1;
        return delta;
      }
      // Ages 29-30: steady prime with slight physical maintenance requirement
      if (practiceDays >= 8 && roll("latePrimeHold", 100) < 50) return currentAvg < 76 ? 1 : 0;
      return roll("latePrimeDrift", 100) < 25 ? -1 : 0;
    }
    // VETERAN_DECLINE (31+)
    const yearsPastPrime = ageAfter - model.primeWindowMaxAgeYears;
    const baseDrop =
      yearsPastPrime <= 2
        ? -(roll("vet1", 100) < 55 ? 1 : 0)
        : yearsPastPrime <= 5
          ? -(1 + (roll("vet2", 100) < 55 ? 1 : 0))
          : -(2 + (roll("vet3", 100) < 60 ? 1 : 0));
    const mitigation = practiceDays >= 10 && exposure.restDays >= 6 && roll("mitigate", 100) < 45 ? 1 : 0;
    return Math.max(-4, Math.min(0, baseDrop + mitigation));
  };

  const isBatPrimary = player.role === "BATTER" || player.role === "ALLROUNDER" || player.role === "KEEPER";
  const isBowlPrimary = player.role === "BOWLER" || player.role === "ALLROUNDER";
  const isKeeper = player.role === "KEEPER";

  const batStep = growthStep(
    currentSummary.batting,
    isBatPrimary,
    exposure.battingPracticeDays,
    seasonStats.ballsFaced >= 40 ? 1 : 0,
  );
  const bowlStep = growthStep(
    currentSummary.bowling,
    isBowlPrimary,
    exposure.bowlingPracticeDays,
    seasonStats.bowlingLegalBalls >= 36 ? 1 : 0,
  );
  const fieldStep = growthStep(
    currentSummary.fielding,
    false,
    exposure.fieldingPracticeDays,
    seasonStats.matches >= 4 ? 1 : 0,
  );
  const keepStep = isKeeper
    ? growthStep(
        currentSummary.keeping,
        true,
        exposure.fieldingPracticeDays,
        seasonStats.matches >= 4 ? 1 : 0,
      )
    : 0;
  const staminaStep =
    ageAfter <= 24
      ? roll("stamYoung", 100) < 45 ? 1 : 0
      : ageAfter <= 30
        ? 0
        : ageAfter <= 34
          ? -(roll("stam31", 100) < 60 ? 1 : 0)
          : -(1 + (roll("stam35", 100) < 65 ? 1 : 0));

  const applySteps = (skills: FormatSkills, formatSalt: string): FormatSkills => {
    const jitter = (key: string, step: number) => {
      if (step === 0) return 0;
      const v = roll(`${formatSalt}/${key}`, 100);
      if (step > 0) return v < 20 ? step - 1 : step;
      return v < 20 ? step + 1 : step;
    };
    return FormatSkillsSchema.parse({
      defence: clampSkill(skills.defence + jitter("def", batStep), model),
      timing: clampSkill(skills.timing + jitter("tim", batStep), model),
      power: clampSkill(
        skills.power + jitter("pow", ageAfter >= 33 ? Math.min(batStep, -1) : batStep),
        model,
      ),
      rotation: clampSkill(skills.rotation + jitter("rot", batStep), model),
      vsPace: clampSkill(skills.vsPace + jitter("vsp", batStep), model),
      vsSpin: clampSkill(skills.vsSpin + jitter("vss", batStep), model),
      control: clampSkill(skills.control + jitter("ctl", bowlStep), model),
      movement: clampSkill(skills.movement + jitter("mov", bowlStep), model),
      variation: clampSkill(skills.variation + jitter("var", bowlStep), model),
      stamina: clampSkill(skills.stamina + staminaStep, model),
      catching: clampSkill(skills.catching + jitter("cat", fieldStep), model),
      groundFielding: clampSkill(
        skills.groundFielding + jitter("gfd", ageAfter >= 33 ? Math.min(fieldStep, -1) : fieldStep),
        model,
      ),
      throwing: clampSkill(skills.throwing + jitter("thr", fieldStep), model),
      keeping: clampSkill(skills.keeping + keepStep, model),
    });
  };

  const nextT20 = applySteps(player.skills.T20!, "T20");
  const nextODI = applySteps(player.skills.ODI!, "ODI");
  const nextRed = applySteps(player.skills.RED_BALL!, "RED");

  const afterSummary = summarizeT20SkillAverages(nextT20);
  const deltas: PlayerSkillDeltaSummary = {
    battingDelta: afterSummary.batting - currentSummary.batting,
    bowlingDelta: afterSummary.bowling - currentSummary.bowling,
    fieldingDelta: afterSummary.fielding - currentSummary.fielding,
    keepingDelta: afterSummary.keeping - currentSummary.keeping,
    staminaDelta: afterSummary.stamina - currentSummary.stamina,
  };

  const updatedPlayer: Player = PlayerSchema.parse({
    ...structuredClone(player),
    skills: {
      T20: nextT20,
      ODI: nextODI,
      RED_BALL: nextRed,
    },
    exposureBalls: {
      ...player.exposureBalls,
      T20: (player.exposureBalls.T20 ?? 0) + seasonStats.ballsFaced + seasonStats.bowlingLegalBalls,
    },
  });

  const report: PlayerSeasonDevelopmentReport = {
    playerId: player.playerId,
    teamId: input.teamId,
    ageBefore,
    ageAfter,
    matchesPlayed: seasonStats.matches,
    ballsFaced: seasonStats.ballsFaced,
    ballsBowled: seasonStats.bowlingLegalBalls,
    battingPracticeDays: exposure.battingPracticeDays,
    bowlingPracticeDays: exposure.bowlingPracticeDays,
    fieldingPracticeDays: exposure.fieldingPracticeDays,
    restDays: exposure.restDays,
    deltas,
    phaseLabel,
  };
  return { updatedPlayer, report };
}

function shouldPlayerRetire(input: {
  player: Player;
  ageAfter: number;
  matchesPlayed: number;
  worldIdentity: PersistentWorldIdentity;
  fromSeasonNumber: number;
  model: FictionalPlayerLifecycleModel;
}): RetiredPlayerRecord["retirementReason"] | null {
  const { ageAfter, model } = input;
  if (ageAfter < model.earliestVoluntaryRetirementAgeYears) return null;
  if (ageAfter >= model.mandatoryRetirementAgeYears) return "MANDATORY_AGE_LIMIT";

  const rng = createRandomService();
  const seed = `${input.worldIdentity.baseSeed}:lifecycle-retire-s${input.fromSeasonNumber}`.slice(0, 256);
  const roll =
    rng.uint32({
      seed,
      domain: "CAREER_TRAINING",
      entityId: input.player.playerId,
      eventOrdinal: input.fromSeasonNumber,
      stageName: "retirement-check",
      drawIndex: 0,
    }) % 100;

  const baseThresholdByAge =
    ageAfter === 34
      ? 14
      : ageAfter === 35
        ? 24
        : ageAfter === 36
          ? 38
          : ageAfter === 37
            ? 56
            : ageAfter === 38
              ? 74
              : 88;
  const lowUsageBoost = input.matchesPlayed <= 2 ? 12 : 0;
  if (roll < baseThresholdByAge + lowUsageBoost) {
    return input.matchesPlayed <= 2 ? "VETERAN_TRANSITION" : "AGE_AND_WORKLOAD";
  }
  return null;
}

/**
 * Advances the player lifecycle at season close:
 * 1. Ages all active players into `nextCalendarYear` and computes reproducible permanent skill changes.
 * 2. Evaluates veteran retirements and archives retired players with full profile & team provenance.
 * 3. Graduates queued and role-required Youth Academy prospects into senior squads (`18..22` per club).
 * 4. Generates the new season's Youth Academy class (`3` U19 prospects per club) with role-shortage protection.
 * 5. Builds and validates the evolved `StagedRosterPack` for Season `toSeasonNumber`.
 */
export function advancePlayerLifecycleAtSeasonClose(input: {
  lifecycle: PlayerLifecycleState;
  worldIdentity: PersistentWorldIdentity;
  fromSeasonNumber: number;
  toSeasonNumber: number;
  closedCalendarYear: number;
  nextCalendarYear: number;
  seasonPlayerStats: readonly {
    playerId: string;
    matches: number;
    ballsFaced: number;
    bowlingLegalBalls: number;
  }[];
  controlledTeamId: string | null;
}): PlayerLifecycleState {
  const validated = validatePlayerLifecycleState(input.lifecycle);
  assertLifecycle(input.toSeasonNumber === input.fromSeasonNumber + 1, "NON_SEQUENTIAL_SEASON");
  assertLifecycle(
    !validated.transitions.some((t) => t.fromSeasonNumber === input.fromSeasonNumber),
    `DUPLICATE_LIFECYCLE_TRANSITION:${input.fromSeasonNumber}`,
  );

  const model = validated.model;
  const statsMap = new Map(input.seasonPlayerStats.map((s) => [s.playerId, s]));
  const exposureMap = new Map(validated.seasonTrainingExposure.map((e) => [e.playerId, e]));
  const ledgerMap = new Map(validated.skillLedger.map((l) => [l.playerId, l]));
  const teamByPlayer = new Map<string, string>();
  for (const team of validated.activeWorld.teams) {
    for (const pid of team.squadIds) teamByPlayer.set(pid, team.teamId);
  }

  // Step 1: Develop all active players
  const developedById = new Map<string, Player>();
  const reports: PlayerSeasonDevelopmentReport[] = [];
  const updatedLedgerMap = new Map<string, PlayerLifecycleSkillLedgerEntry>(ledgerMap);

  const sortedActive = [...validated.activeWorld.players].sort((a, b) =>
    a.playerId.localeCompare(b.playerId),
  );
  for (const player of sortedActive) {
    const teamId = teamByPlayer.get(player.playerId)!;
    const priorT20 = structuredClone(player.skills.T20!);
    const exposure = exposureMap.get(player.playerId) ?? {
      playerId: player.playerId,
      battingPracticeDays: 0,
      bowlingPracticeDays: 0,
      fieldingPracticeDays: 0,
      restDays: 0,
    };
    const seasonStats = statsMap.get(player.playerId) ?? {
      matches: 0,
      ballsFaced: 0,
      bowlingLegalBalls: 0,
    };
    const { updatedPlayer, report } = developPlayerAcrossOffseason({
      player,
      teamId,
      worldIdentity: input.worldIdentity,
      fromSeasonNumber: input.fromSeasonNumber,
      closedCalendarYear: input.closedCalendarYear,
      nextCalendarYear: input.nextCalendarYear,
      exposure,
      seasonStats,
      model,
    });
    developedById.set(player.playerId, updatedPlayer);
    reports.push(report);
    const existingLedger = updatedLedgerMap.get(player.playerId);
    updatedLedgerMap.set(player.playerId, {
      playerId: player.playerId,
      debutSeasonNumber: existingLedger?.debutSeasonNumber ?? 1,
      careerEntryT20Skills: existingLedger?.careerEntryT20Skills ?? priorT20,
      priorSeasonT20Skills: priorT20,
      lastSeasonDelta: report.deltas,
    });
  }

  // Also apply modest academy training development to unpromoted current-season academy prospects
  const developedAcademy = validated.youthAcademy.map((prospect) => {
    if (prospect.promotedInSeasonNumber !== null || prospect.generatedInSeasonNumber !== input.fromSeasonNumber) {
      return prospect;
    }
    const focus = prospect.academyFocus;
    const p = prospect.player;
    const bump = (val: number, active: boolean) =>
      clampSkill(val + (active ? 2 : 1), model);
    const growSkills = (s: FormatSkills): FormatSkills =>
      FormatSkillsSchema.parse({
        defence: bump(s.defence, focus === "BATTING_PRACTICE" || focus === "BALANCED"),
        timing: bump(s.timing, focus === "BATTING_PRACTICE" || focus === "BALANCED"),
        power: bump(s.power, focus === "BATTING_PRACTICE"),
        rotation: bump(s.rotation, focus === "BATTING_PRACTICE"),
        vsPace: bump(s.vsPace, focus === "BATTING_PRACTICE"),
        vsSpin: bump(s.vsSpin, focus === "BATTING_PRACTICE"),
        control: bump(s.control, focus === "BOWLING_PRACTICE" || focus === "BALANCED"),
        movement: bump(s.movement, focus === "BOWLING_PRACTICE"),
        variation: bump(s.variation, focus === "BOWLING_PRACTICE"),
        stamina: bump(s.stamina, focus === "BOWLING_PRACTICE" || focus === "BALANCED"),
        catching: bump(s.catching, focus === "FIELDING_PRACTICE" || focus === "BALANCED"),
        groundFielding: bump(s.groundFielding, focus === "FIELDING_PRACTICE"),
        throwing: bump(s.throwing, focus === "FIELDING_PRACTICE"),
        keeping:
          p.role === "KEEPER"
            ? bump(s.keeping, focus === "FIELDING_PRACTICE" || focus === "BALANCED")
            : s.keeping,
      });
    return YouthProspectSchema.parse({
      ...prospect,
      player: {
        ...structuredClone(p),
        skills: {
          T20: growSkills(p.skills.T20!),
          ODI: growSkills(p.skills.ODI!),
          RED_BALL: growSkills(p.skills.RED_BALL!),
        },
      },
    });
  });

  // Step 2 & 3: Per-club retirements & Youth Academy graduations with strict role/squad invariants
  const newRetiredRecords: RetiredPlayerRecord[] = [];
  const newlyPromotedYouthIds: string[] = [];
  const promotedProspectMap = new Map<string, number>();
  const nextTeams: WorldPack["teams"] = [];
  const finalActivePlayers: Player[] = [];

  const sortedTeams = [...validated.activeWorld.teams].sort((a, b) =>
    a.teamId.localeCompare(b.teamId),
  );
  for (const team of sortedTeams) {
    const clubAvailableProspects = developedAcademy
      .filter(
        (p) =>
          p.teamId === team.teamId &&
          p.promotedInSeasonNumber === null &&
          p.generatedInSeasonNumber === input.fromSeasonNumber,
      )
      .sort((a, b) => a.intakeRank - b.intakeRank);

    const squadPlayers = team.squadIds.map((id) => developedById.get(id)!);
    const candidateRetirements: { player: Player; reason: RetiredPlayerRecord["retirementReason"] }[] = [];
    const stayingPlayers: Player[] = [];

    for (const p of squadPlayers) {
      const ageAfter = playerAgeInSeason(p.birthDate, input.nextCalendarYear);
      const matchesPlayed = statsMap.get(p.playerId)?.matches ?? 0;
      const reason = shouldPlayerRetire({
        player: p,
        ageAfter,
        matchesPlayed,
        worldIdentity: input.worldIdentity,
        fromSeasonNumber: input.fromSeasonNumber,
        model,
      });
      if (reason) {
        candidateRetirements.push({ player: p, reason });
      } else {
        stayingPlayers.push(p);
      }
    }

    // Sort candidate retirements oldest first; defer non-mandatory retirements if squad + 3 prospects couldn't keep >= 18
    candidateRetirements.sort(
      (a, b) =>
        playerAgeInSeason(b.player.birthDate, input.nextCalendarYear) -
        playerAgeInSeason(a.player.birthDate, input.nextCalendarYear),
    );

    const confirmedRetirements: typeof candidateRetirements = [];
    for (const cand of candidateRetirements) {
      const maxPossibleAfterRetire =
        stayingPlayers.length +
        (candidateRetirements.length - confirmedRetirements.length - 1) +
        clubAvailableProspects.length;
      if (cand.reason !== "MANDATORY_AGE_LIMIT" && maxPossibleAfterRetire < MIN_ACTIVE_TEAM_SQUAD_SIZE) {
        stayingPlayers.push(cand.player);
        continue;
      }
      // Also defer non-mandatory keeper retirement if no other keeper stays and no keeper in academy
      if (
        cand.reason !== "MANDATORY_AGE_LIMIT" &&
        cand.player.role === "KEEPER" &&
        !stayingPlayers.some((s) => s.role === "KEEPER") &&
        !clubAvailableProspects.some((pr) => pr.player.role === "KEEPER")
      ) {
        stayingPlayers.push(cand.player);
        continue;
      }
      confirmedRetirements.push(cand);
    }

    for (const ret of confirmedRetirements) {
      const ageAtRetirement = playerAgeInSeason(ret.player.birthDate, input.nextCalendarYear);
      const debutSeason = updatedLedgerMap.get(ret.player.playerId)?.debutSeasonNumber ?? 1;
      newRetiredRecords.push(
        RetiredPlayerRecordSchema.parse({
          playerId: ret.player.playerId,
          player: ret.player,
          debutSeasonNumber: debutSeason,
          retiredAfterSeasonNumber: input.fromSeasonNumber,
          retiredCalendarYear: input.closedCalendarYear,
          ageAtRetirement,
          lastTeamId: team.teamId,
          careerTeamIds: [team.teamId],
          retirementReason: ret.reason,
        }),
      );
    }

    const nextClubPlayers = [...stayingPlayers];
    const usedProspectIds = new Set<string>();

    const promoteProspect = (prospect: YouthProspect) => {
      if (usedProspectIds.has(prospect.prospectId)) return;
      if (nextClubPlayers.length >= MAX_ACTIVE_TEAM_SQUAD_SIZE) return;
      usedProspectIds.add(prospect.prospectId);
      promotedProspectMap.set(prospect.prospectId, input.toSeasonNumber);
      newlyPromotedYouthIds.push(prospect.player.playerId);
      nextClubPlayers.push(structuredClone(prospect.player));
      updatedLedgerMap.set(prospect.player.playerId, {
        playerId: prospect.player.playerId,
        debutSeasonNumber: input.toSeasonNumber,
        careerEntryT20Skills: structuredClone(prospect.player.skills.T20!),
        priorSeasonT20Skills: structuredClone(prospect.player.skills.T20!),
        lastSeasonDelta: zeroDeltaSummary(),
      });
    };

    // 1) Honor manager-queued promotions first
    for (const prospect of clubAvailableProspects) {
      if (prospect.queuedForPromotion) promoteProspect(prospect);
    }

    // 2) Ensure keeper floor (>= 2 keepers when available)
    for (const prospect of clubAvailableProspects) {
      if (nextClubPlayers.filter((p) => p.role === "KEEPER").length < model.minSquadKeepers) {
        if (prospect.player.role === "KEEPER") promoteProspect(prospect);
      }
    }

    // 3) Ensure bowling-capable floor (>= 7 bowling-capable when available)
    for (const prospect of clubAvailableProspects) {
      if (nextClubPlayers.filter(isBowlingCapable).length < model.minSquadBowlingCapable) {
        if (isBowlingCapable(prospect.player)) promoteProspect(prospect);
      }
    }

    // 4) Fill toward target squad size (20 for AI clubs; at least MIN_ACTIVE_TEAM_SQUAD_SIZE=18 or replacement to 20 for managed club if below 19)
    const targetSize =
      team.teamId === input.controlledTeamId ? Math.max(MIN_ACTIVE_TEAM_SQUAD_SIZE, 19) : TARGET_ACTIVE_TEAM_SQUAD_SIZE;
    for (const prospect of clubAvailableProspects) {
      if (nextClubPlayers.length < targetSize) promoteProspect(prospect);
    }

    // Emergency specialist intake if mandatory age-40 retirements left squad below hard floor or missing role
    let emergencySlot = 1;
    while (
      nextClubPlayers.length < MIN_ACTIVE_TEAM_SQUAD_SIZE ||
      nextClubPlayers.filter((p) => p.role === "KEEPER").length < model.minSquadKeepers ||
      nextClubPlayers.filter(isBowlingCapable).length < 6
    ) {
      const neededRole: Player["role"] =
        nextClubPlayers.filter((p) => p.role === "KEEPER").length < model.minSquadKeepers
          ? "KEEPER"
          : nextClubPlayers.filter(isBowlingCapable).length < 6
            ? "BOWLER"
            : "BATTER";
      const emergency = generateYouthProspect(
        {
          ...input.worldIdentity,
          baseSeed: `${input.worldIdentity.baseSeed}-emerg-${emergencySlot}`,
        },
        input.toSeasonNumber,
        input.nextCalendarYear,
        team.teamId,
        Math.min(YOUTH_PROSPECTS_PER_TEAM_PER_SEASON, emergencySlot),
        neededRole,
        null,
      );
      const uniqueEmergencyPlayer: Player = {
        ...emergency.player,
        playerId: `py-emg-s${String(input.toSeasonNumber).padStart(3, "0")}-${team.teamId.replaceAll(/[^A-Za-z0-9]/g, "")}-${emergencySlot}`,
      };
      nextClubPlayers.push(uniqueEmergencyPlayer);
      newlyPromotedYouthIds.push(uniqueEmergencyPlayer.playerId);
      updatedLedgerMap.set(uniqueEmergencyPlayer.playerId, {
        playerId: uniqueEmergencyPlayer.playerId,
        debutSeasonNumber: input.toSeasonNumber,
        careerEntryT20Skills: structuredClone(uniqueEmergencyPlayer.skills.T20!),
        priorSeasonT20Skills: structuredClone(uniqueEmergencyPlayer.skills.T20!),
        lastSeasonDelta: zeroDeltaSummary(),
      });
      emergencySlot += 1;
    }

    // Trim excess only if a squad somehow exceeded MAX_ACTIVE_TEAM_SQUAD_SIZE
    const boundedClubPlayers = nextClubPlayers.slice(0, MAX_ACTIVE_TEAM_SQUAD_SIZE);
    for (const p of boundedClubPlayers) finalActivePlayers.push(p);
    nextTeams.push({
      ...structuredClone(team),
      squadIds: boundedClubPlayers.map((p) => p.playerId),
    });
  }

  finalActivePlayers.sort((a, b) => a.playerId.localeCompare(b.playerId));
  const nextActiveWorld: WorldPack = {
    ...structuredClone(validated.activeWorld),
    teams: nextTeams,
    players: finalActivePlayers,
  };

  // Step 4: Generate new season's Youth Academy intake class (3 U19 prospects per club)
  const newSeasonAcademyClass = generateSeasonYouthAcademyClass(
    input.worldIdentity,
    nextActiveWorld,
    input.toSeasonNumber,
    input.nextCalendarYear,
  );

  const updatedPriorAcademy = developedAcademy
    .map((p) =>
      promotedProspectMap.has(p.prospectId)
        ? { ...p, queuedForPromotion: false, promotedInSeasonNumber: promotedProspectMap.get(p.prospectId)! }
        : p,
    )
    // Keep promoted graduates + active season academy so historical provenance stays bounded and inspectable
    .filter((p) => p.promotedInSeasonNumber !== null);

  const combinedAcademy = [...updatedPriorAcademy, ...newSeasonAcademyClass];
  const nextRegistrationRevision = validated.squadRegistrationRevision + 1;
  const nextRosterPack = buildLifecycleRosterPack(
    nextActiveWorld,
    input.worldIdentity.worldId,
    input.toSeasonNumber,
    nextRegistrationRevision,
  );

  const transitionCore = SeasonLifecycleTransitionRecordCoreSchema.parse({
    fromSeasonNumber: input.fromSeasonNumber,
    toSeasonNumber: input.toSeasonNumber,
    calendarYear: input.nextCalendarYear,
    agedPlayerCount: reports.length,
    developedPlayers: reports,
    retiredPlayerIds: newRetiredRecords.map((r) => r.playerId).sort(),
    promotedYouthIds: [...newlyPromotedYouthIds].sort(),
    generatedYouthIds: newSeasonAcademyClass.map((y) => y.player.playerId).sort(),
  });
  const transitionRecord = SeasonLifecycleTransitionRecordSchema.parse({
    ...transitionCore,
    transitionSha256: sha256Hex(canonicalStateBytes(transitionCore)),
  });

  const activeIdSet = new Set(finalActivePlayers.map((p) => p.playerId));
  const nextExposure: PlayerTrainingExposureRecord[] = finalActivePlayers.map((p) => ({
    playerId: p.playerId,
    battingPracticeDays: 0,
    bowlingPracticeDays: 0,
    fieldingPracticeDays: 0,
    restDays: 0,
  }));

  // Keep ledger entries for all active + retired players so career-entry deltas remain inspectable
  const retiredIdSet = new Set([
    ...validated.retiredPlayers.map((r) => r.playerId),
    ...newRetiredRecords.map((r) => r.playerId),
  ]);
  const nextSkillLedger = [...updatedLedgerMap.values()]
    .filter((entry) => activeIdSet.has(entry.playerId) || retiredIdSet.has(entry.playerId))
    .sort((a, b) => a.playerId.localeCompare(b.playerId));

  const nextHistoricalPacks = validated.historicalRosterPacks.some(
    (p) => p.sourceHash === nextRosterPack.sourceHash,
  )
    ? validated.historicalRosterPacks
    : [...validated.historicalRosterPacks, nextRosterPack];

  return sealPlayerLifecycleState({
    lifecycleVersion: PLAYER_LIFECYCLE_STATE_VERSION,
    model,
    activeWorld: structuredClone(nextRosterPack.world),
    activeRosterPack: nextRosterPack,
    historicalRosterPacks: nextHistoricalPacks,
    skillLedger: nextSkillLedger,
    seasonTrainingExposure: nextExposure,
    retiredPlayers: [...validated.retiredPlayers, ...newRetiredRecords].sort((a, b) =>
      a.playerId.localeCompare(b.playerId),
    ),
    youthAcademy: combinedAcademy,
    transitions: [...validated.transitions, transitionRecord],
    squadRegistrationRevision: nextRegistrationRevision,
  });
}

export function findLifecycleRosterPackBySha256(
  lifecycle: PlayerLifecycleState,
  rosterPackSha256: string,
): StagedRosterPack | null {
  if (lifecycle.activeRosterPack && hasher.hash(lifecycle.activeRosterPack) === rosterPackSha256) {
    return lifecycle.activeRosterPack;
  }
  for (const pack of lifecycle.historicalRosterPacks) {
    if (hasher.hash(pack) === rosterPackSha256) return pack;
  }
  return null;
}

export function createCompletedLifecycleMatchEventArchive(input: {
  completion: T20SeasonMatchCompletion;
  session: RosterT20Session;
  rosterPackSha256: string;
}): CompletedLifecycleMatchEventArchive {
  const completion = T20SeasonMatchCompletionSchema.parse(input.completion);
  const { session } = input;
  assertLifecycle(session.core.phase === "COMPLETE", "ARCHIVE_SESSION_INCOMPLETE");
  assertLifecycle(session.setup.matchId === completion.matchId, "ARCHIVE_MATCH_ID_MISMATCH");
  const scorecard = projectT20Scorecard(session as unknown as T20Session);
  const scorecardSha256 = hasher.hash(scorecard);
  assertLifecycle(scorecardSha256 === completion.scorecardSha256, "ARCHIVE_SCORECARD_HASH_MISMATCH");
  const preparation = RosterMatchPreparationSchema.parse({
    gameId: session.setup.gameId,
    matchId: session.setup.matchId,
    seed: session.setup.seed,
    format: "T20",
    selection: {
      groundId: session.setup.ground.groundId,
      teams: [
        {
          teamId: session.setup.teams[0].teamId,
          playerIds: [...session.setup.teams[0].playerIds],
          captainId: session.setup.teams[0].captainId,
          keeperId: session.setup.teams[0].keeperId,
        },
        {
          teamId: session.setup.teams[1].teamId,
          playerIds: [...session.setup.teams[1].playerIds],
          captainId: session.setup.teams[1].captainId,
          keeperId: session.setup.teams[1].keeperId,
        },
      ],
    },
  });
  const eventChain = eventChainManifest(session as unknown as T20Session);
  const core = CompletedLifecycleMatchEventArchiveCoreSchema.parse({
    archiveVersion: LIFECYCLE_MATCH_EVENT_ARCHIVE_VERSION,
    seasonId: completion.seasonId,
    scheduleSha256: completion.scheduleSha256,
    fixtureId: completion.fixtureId,
    matchId: completion.matchId,
    fixtureOrdinal: completion.fixtureOrdinal,
    roundNumber: completion.roundNumber,
    matchDayDate: completion.matchDayDate,
    source: completion.source,
    sourceCompletionSha256: completion.sourceCompletionSha256,
    rosterPackSha256: input.rosterPackSha256,
    preparation,
    eventChain,
    events: session.events,
    scorecardSha256,
  });
  const archiveSha256 = sha256Hex(canonicalStateBytes(core));
  const sealed = CompletedLifecycleMatchEventArchiveSchema.parse({ ...core, archiveSha256 });
  const byteLength = new TextEncoder().encode(canonicalJson(sealed)).byteLength;
  assertLifecycle(
    byteLength <= MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES,
    `ARCHIVE_EXCEEDS_MAX_BYTES:${byteLength}`,
  );
  return sealed;
}

export function replayCompletedLifecycleMatchEventArchive(
  archiveInput: unknown,
  packInput: StagedRosterPack,
  expectedCompletion?: T20SeasonMatchCompletion,
): CareerArchivedReplaySummary {
  const archive = CompletedLifecycleMatchEventArchiveSchema.parse(archiveInput);
  const { archiveSha256, ...coreRaw } = archive;
  const core = CompletedLifecycleMatchEventArchiveCoreSchema.parse(coreRaw);
  assertLifecycle(sha256Hex(canonicalStateBytes(core)) === archiveSha256, "REPLAY_HASH_MISMATCH");
  const pack = validateStagedRosterPack(packInput, ALLOWED_RULES, ALLOWED_VARIATIONS);
  assertLifecycle(hasher.hash(pack) === archive.rosterPackSha256, "REPLAY_ROSTER_PACK_MISMATCH");
  if (expectedCompletion) {
    assertLifecycle(
      archive.fixtureId === expectedCompletion.fixtureId &&
        archive.matchId === expectedCompletion.matchId &&
        archive.sourceCompletionSha256 === expectedCompletion.sourceCompletionSha256 &&
        archive.scorecardSha256 === expectedCompletion.scorecardSha256,
      "REPLAY_COMPLETION_MISMATCH",
    );
  }
  const initial = createRosterT20Session(pack, archive.preparation);
  const replayed = replayT20EventsFromInitial(
    initial as unknown as T20Session,
    archive.events,
    archive.eventChain,
  );
  assertLifecycle(replayed.core.phase === "COMPLETE", "REPLAY_INCOMPLETE");
  const manifest = eventChainManifest(replayed);
  const scorecard = projectT20Scorecard(replayed);
  const scorecardSha256 = hasher.hash(scorecard);
  assertLifecycle(scorecardSha256 === archive.scorecardSha256, "REPLAY_SCORECARD_MISMATCH");

  const deliveries: Array<{
    sequence: number;
    inningsIndex: number;
    over: number;
    ballInOver: number;
    bowlerId: string;
    strikerId: string;
    totalRuns: number;
    wicketKind: string | null;
  }> = [];
  let legalBallsInInnings = 0;
  let activeInnings = 0;
  for (const ev of archive.events) {
    const payload = ev.payload as { type?: string; inningsIndex?: number; event?: DeliveryRecorded } | null;
    if (ev.type === "INNINGS_STARTED" && payload && typeof payload.inningsIndex === "number") {
      activeInnings = payload.inningsIndex;
      legalBallsInInnings = 0;
    } else if (ev.type === "DELIVERY_RECORDED" && payload?.event) {
      const d = payload.event;
      const over = Math.floor(legalBallsInInnings / 6);
      const ballInOver = (legalBallsInInnings % 6) + 1;
      if (d.legalBall) legalBallsInInnings += 1;
      const extrasTotal =
        d.extras.wides + d.extras.noBalls + d.extras.byes + d.extras.legByes + d.extras.penalties;
      deliveries.push({
        sequence: ev.sequence,
        inningsIndex: activeInnings,
        over,
        ballInOver,
        bowlerId: d.bowlerId,
        strikerId: d.strikerId,
        totalRuns: d.batRuns + extrasTotal,
        wicketKind: d.dismissal ? d.dismissal.kind : null,
      });
    }
  }

  return {
    session: replayed,
    scorecard,
    scorecardSha256,
    eventCount: archive.events.length,
    finalEventHash: manifest.finalEventHash,
    finalStateHash: manifest.finalStateHash,
    deliveries,
  };
}

function summarizeBand(values: readonly number[]): LifecycleAbilityBandSummary {
  assertLifecycle(values.length > 0, "EMPTY_ABILITY_BAND");
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))]!;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    min: sorted[0]!,
    p10: at(0.1),
    median: at(0.5),
    meanX10: Math.round((sum * 10) / sorted.length),
    p90: at(0.9),
    max: sorted[sorted.length - 1]!,
  };
}

export function snapshotLifecycleSeasonDiagnostics(
  lifecycle: PlayerLifecycleState,
  seasonNumber: number,
  calendarYear: number,
): LifecycleDiagnosticSeasonSnapshot {
  const players = lifecycle.activeWorld.players;
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const roleCounts = { BATTER: 0, BOWLER: 0, ALLROUNDER: 0, KEEPER: 0 };
  const ages: number[] = [];
  const batSpecialists: number[] = [];
  const bowlSpecialists: number[] = [];
  const allFielding: number[] = [];
  const keepSpecialists: number[] = [];

  for (const p of players) {
    roleCounts[p.role] += 1;
    ages.push(playerAgeInSeason(p.birthDate, calendarYear));
    const s = summarizeT20SkillAverages(p.skills.T20!);
    allFielding.push(s.fielding);
    if (p.role === "BATTER" || p.role === "ALLROUNDER" || p.role === "KEEPER") {
      batSpecialists.push(s.batting);
    }
    if (p.role === "BOWLER" || p.role === "ALLROUNDER") {
      bowlSpecialists.push(s.bowling);
    }
    if (p.role === "KEEPER") {
      keepSpecialists.push(s.keeping);
    }
  }

  let minClubSquadSize = Infinity;
  let maxClubSquadSize = 0;
  let minClubKeepers = Infinity;
  let minClubBowlingCapable = Infinity;
  let clubsWithRoleShortage = 0;

  for (const team of lifecycle.activeWorld.teams) {
    const squad = team.squadIds.map((id) => byId.get(id)!);
    const keepers = squad.filter((p) => p.role === "KEEPER").length;
    const bowlers = squad.filter(isBowlingCapable).length;
    minClubSquadSize = Math.min(minClubSquadSize, squad.length);
    maxClubSquadSize = Math.max(maxClubSquadSize, squad.length);
    minClubKeepers = Math.min(minClubKeepers, keepers);
    minClubBowlingCapable = Math.min(minClubBowlingCapable, bowlers);
    if (keepers < 1 || bowlers < 5 || squad.length < MIN_ACTIVE_TEAM_SQUAD_SIZE) {
      clubsWithRoleShortage += 1;
    }
  }

  const cumulativeYouthPromotedCount = lifecycle.youthAcademy.filter(
    (y) => y.promotedInSeasonNumber !== null,
  ).length;

  const ageSum = ages.reduce((a, b) => a + b, 0);

  return LifecycleDiagnosticSeasonSnapshotSchema.parse({
    seasonNumber,
    calendarYear,
    activePlayerCount: players.length,
    cumulativeRetiredCount: lifecycle.retiredPlayers.length,
    cumulativeYouthPromotedCount,
    minClubSquadSize,
    maxClubSquadSize,
    minClubKeepers,
    minClubBowlingCapable,
    clubsWithRoleShortage,
    meanAgeX10: Math.round((ageSum * 10) / players.length),
    battingAbility: summarizeBand(batSpecialists),
    bowlingAbility: summarizeBand(bowlSpecialists),
    fieldingAbility: summarizeBand(allFielding),
    keepingAbility: summarizeBand(keepSpecialists),
    roleCounts,
  });
}

/**
 * Runs a deterministic multi-season (e.g. 20-season) diagnostic horizon across full 56-fixture
 * T20 seasons (`simulateMatches: true`) or deterministic workload seasons, reporting ability
 * distributions, squad supply, and role-shortage counts per season.
 */
export function runPlayerLifecycleDiagnosticHorizon(input: {
  worldIdentity: PersistentWorldIdentity;
  baseWorld: WorldPack;
  seasons: number;
  startCalendarYear?: number;
  startDate?: string;
  controlledTeamId?: string | null;
  simulateFullMatches?: boolean;
}): {
  snapshots: LifecycleDiagnosticSeasonSnapshot[];
  finalLifecycle: PlayerLifecycleState;
  totalMatchesSimulated: number;
} {
  assertLifecycle(input.seasons >= 1 && input.seasons <= 200, "INVALID_DIAGNOSTIC_HORIZON");
  const startCalendarYear = input.startCalendarYear ?? 2027;
  const startMonthDay = (input.startDate ?? "2027-01-03").slice(5, 10);
  let lifecycle = createInitialPlayerLifecycleState({
    worldIdentity: input.worldIdentity,
    baseWorld: input.baseWorld,
    calendarYear: startCalendarYear,
    useRosterPackImmediately: true,
  });

  const snapshots: LifecycleDiagnosticSeasonSnapshot[] = [];
  let totalMatchesSimulated = 0;

  for (let s = 1; s <= input.seasons; s++) {
    const calendarYear = startCalendarYear + (s - 1);
    snapshots.push(snapshotLifecycleSeasonDiagnostics(lifecycle, s, calendarYear));
    if (s === input.seasons) break;

    const pack = lifecycle.activeRosterPack!;
    const seasonId = `diag-s${String(s).padStart(3, "0")}`;
    const gameId = `diag-g${String(s).padStart(3, "0")}`;
    const seasonSeed = `${input.worldIdentity.baseSeed}-s${s}`;
    const seasonStartDate = `${calendarYear}-${startMonthDay}`;

    const playerStatsMap = new Map<
      string,
      { playerId: string; matches: number; ballsFaced: number; bowlingLegalBalls: number }
    >();
    for (const p of lifecycle.activeWorld.players) {
      playerStatsMap.set(p.playerId, {
        playerId: p.playerId,
        matches: 0,
        ballsFaced: 0,
        bowlingLegalBalls: 0,
      });
    }

    if (input.simulateFullMatches === true) {
      const schedule = generateRosterSeasonSchedule(pack, {
        seasonId,
        gameId,
        seasonSeed,
        startDate: seasonStartDate,
      });
      let careerState = createRosterCareerDayState(`diag-career`, schedule, pack);
      // Set varied realistic training directives across every squad's players
      const variedAssignments = careerState.trainingAssignments.map((entry, idx) => {
        const player = lifecycle.activeWorld.players.find((p) => p.playerId === entry.playerId)!;
        const directive: TrainingDirective =
          idx % 5 === 0
            ? "REST"
            : player.role === "BOWLER"
              ? "BOWLING_PRACTICE"
              : player.role === "BATTER"
                ? "BATTING_PRACTICE"
                : player.role === "KEEPER"
                  ? "FIELDING_PRACTICE"
                  : idx % 2 === 0
                    ? "BATTING_PRACTICE"
                    : "BOWLING_PRACTICE";
        return { ...entry, directive };
      });
      careerState = {
        ...careerState,
        trainingAssignments: variedAssignments,
        stateSha256: hasher.hash({
          ...(() => {
            const { stateSha256: _h, ...rest } = careerState;
            void _h;
            return { ...rest, trainingAssignments: variedAssignments };
          })(),
        }),
      };

      let elapsedDaysInSeason = 0;
      for (const fixture of schedule.fixtures) {
        while (careerState.currentDate < fixture.matchDayDate) {
          careerState = advanceRosterCareerDay(careerState, schedule, pack);
          elapsedDaysInSeason += 1;
        }
        const sim = simulateRosterOffscreenFixture(pack, schedule, careerState, fixture.fixtureId);
        careerState = sim.careerState;
        totalMatchesSimulated += 1;
        for (const teamSel of sim.outcome.selectedTeams) {
          for (const pid of teamSel.playerIds) {
            playerStatsMap.get(pid)!.matches += 1;
          }
        }
        for (const inn of sim.outcome.scorecard.innings) {
          for (const [pid, line] of Object.entries(inn.batting)) {
            playerStatsMap.get(pid)!.ballsFaced += line.ballsFaced;
          }
          for (const [pid, line] of Object.entries(inn.bowling)) {
            playerStatsMap.get(pid)!.bowlingLegalBalls += line.legalBalls;
          }
        }
      }
      lifecycle = recordElapsedTrainingExposure(
        lifecycle,
        careerState.trainingAssignments,
        elapsedDaysInSeason,
      );
    } else {
      const rng = createRandomService();
      const syntheticAssignments: { playerId: string; directive: TrainingDirective }[] = [];
      const byId = new Map(lifecycle.activeWorld.players.map((p) => [p.playerId, p]));
      for (const team of lifecycle.activeWorld.teams) {
        const squad = team.squadIds.map((pid) => byId.get(pid)!);
        // Rank squad roughly by role-appropriate T20 skill so best XI plays regular matches
        const ranked = [...squad].sort((a, b) => {
          const sa = summarizeT20SkillAverages(a.skills.T20!);
          const sb = summarizeT20SkillAverages(b.skills.T20!);
          const scoreA =
            a.role === "BOWLER" ? sa.bowling : a.role === "KEEPER" ? sa.batting + sa.keeping * 0.4 : a.role === "ALLROUNDER" ? (sa.batting + sa.bowling) * 0.52 : sa.batting;
          const scoreB =
            b.role === "BOWLER" ? sb.bowling : b.role === "KEEPER" ? sb.batting + sb.keeping * 0.4 : b.role === "ALLROUNDER" ? (sb.batting + sb.bowling) * 0.52 : sb.batting;
          return scoreB - scoreA || a.playerId.localeCompare(b.playerId);
        });
        ranked.forEach((player, idx) => {
          let drawIndex = 0;
          const drawSpan = (span: number) =>
            rng.uint32({
              seed: seasonSeed,
              domain: "CAREER_TRAINING",
              entityId: `${team.teamId}:${player.playerId}`,
              eventOrdinal: s,
              stageName: "diag_workload",
              drawIndex: drawIndex++,
            }) % span;
          const matches = idx < 11 ? 11 + drawSpan(4) : idx < 15 ? 3 + drawSpan(7) : drawSpan(4);
          const ballsPerMatch =
            player.role === "BATTER" || player.role === "KEEPER"
              ? 14 + drawSpan(14)
              : player.role === "ALLROUNDER"
                ? 10 + drawSpan(12)
                : 3 + drawSpan(6);
          const bowlBallsPerMatch =
            player.role === "BOWLER"
              ? 18 + drawSpan(7)
              : player.role === "ALLROUNDER"
                ? 12 + drawSpan(10)
                : 0;
          const entry = playerStatsMap.get(player.playerId)!;
          entry.matches = matches;
          entry.ballsFaced = matches * ballsPerMatch;
          entry.bowlingLegalBalls = matches * bowlBallsPerMatch;
          const directive: TrainingDirective =
            idx % 6 === 0
              ? "REST"
              : player.role === "BOWLER"
                ? "BOWLING_PRACTICE"
                : player.role === "BATTER"
                  ? "BATTING_PRACTICE"
                  : player.role === "KEEPER"
                    ? "FIELDING_PRACTICE"
                    : idx % 2 === 0
                      ? "BATTING_PRACTICE"
                      : "BOWLING_PRACTICE";
          syntheticAssignments.push({ playerId: player.playerId, directive });
        });
      }
      totalMatchesSimulated += 56;
      lifecycle = recordElapsedTrainingExposure(lifecycle, syntheticAssignments, 48);
    }

    lifecycle = advancePlayerLifecycleAtSeasonClose({
      lifecycle,
      worldIdentity: input.worldIdentity,
      fromSeasonNumber: s,
      toSeasonNumber: s + 1,
      closedCalendarYear: calendarYear,
      nextCalendarYear: calendarYear + 1,
      seasonPlayerStats: [...playerStatsMap.values()],
      controlledTeamId: input.controlledTeamId ?? null,
    });
  }

  return { snapshots, finalLifecycle: lifecycle, totalMatchesSimulated };
}

export function seasonStartDateOf(season: ActivePersistentSeasonState): string {
  return season.seasonStateVersion === "LC_T20_SEASON_STATE_V1"
    ? season.schedule.startDate
    : season.schedule.request.startDate;
}
