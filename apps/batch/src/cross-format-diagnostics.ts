import {
  EXP_LUT_VERSION,
  PROBABILITY_MODEL_ID,
  PROBABILITY_VERSION,
  RANDOM_VERSION,
  canonicalJson,
  type Format,
} from '@lcxxvi/contracts';
import {
  DELIVERY_STAGE_PACK_SHA256,
  EXP_LUT_SHA256,
  FIELD_REGISTRY,
  MODEL_PACK_SHA256,
  T20_LATER_SLOTS,
} from '@lcxxvi/data';
import {
  canonicalStateBytes,
  eventChainManifest,
  expectedGeneratorPhase,
  generateDelivery,
  generatorRuleHash,
  odiEventChainManifest,
  projectODIScorecard,
  projectRed5Scorecard,
  projectT20Scorecard,
  red5EventChainManifest,
  replayODIEvents,
  replayRed5Events,
  replayT20Events,
  resimulateODICommands,
  resimulateRed5Commands,
  resimulateT20Commands,
  runFixtureODI,
  runFixtureRed5,
  runFixtureT20,
  sha256Hex,
  validateODIMatchSetup,
  validateRed5MatchSetup,
  validateT20MatchSetup,
} from '@lcxxvi/simulation';

export const CROSS_FORMAT_DIAGNOSTICS_VERSION = 'LC_CROSS_FORMAT_DIAGNOSTICS_V1' as const;

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[idx]!;
}

function meanAndSe(values: readonly number[]) {
  const n = values.length;
  if (n === 0) return { mean: 0, se: 0, ci95: [0, 0] as const };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean: Number(mean.toFixed(2)), se: 0, ci95: [Number(mean.toFixed(2)), Number(mean.toFixed(2))] as const };
  const variance = values.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  return {
    mean: Number(mean.toFixed(2)),
    se: Number(se.toFixed(3)),
    ci95: [Number((mean - 1.96 * se).toFixed(2)), Number((mean + 1.96 * se).toFixed(2))] as const,
  };
}

export function runCrossFormatReplayGate(params: {
  readonly worldBytes: Uint8Array;
  readonly manifest: unknown;
  readonly t20Template: Record<string, unknown>;
  readonly odiTemplate: Record<string, unknown>;
  readonly red5Template: Record<string, unknown>;
  readonly matchesPerFormat: number;
  readonly seedPrefix?: string;
}) {
  const { worldBytes, manifest, matchesPerFormat } = params;
  const seedPrefix = params.seedPrefix ?? 'LC_V01_025_REPLAY';
  if (!Number.isSafeInteger(matchesPerFormat) || matchesPerFormat < 1) {
    throw new Error('INVALID_REPLAY_MATCH_COUNT');
  }
  const world = JSON.parse(Buffer.from(worldBytes).toString('utf8')) as {
    teams: { teamId: string }[];
    grounds: { groundId: string }[];
  };
  const groundIds = world.grounds.map(g => g.groundId);

  const runFormat = (format: Format) => {
    let replayPassed = 0;
    let resimulationPassed = 0;
    let totalEvents = 0;
    const firstInningsRuns: number[] = [];
    const stoppingReasons: Record<string, number> = {};
    const hashes: string[] = [];

    for (let i = 0; i < matchesPerFormat; i++) {
      const seed = `${seedPrefix}:${format}:${String(i).padStart(4, '0')}`;
      const groundId = groundIds[i % groundIds.length]!;
      if (format === 'T20') {
        const baseSetup = params.t20Template.setup as Record<string, unknown>;
        const setup = validateT20MatchSetup(
          { ...params.t20Template, setup: { ...baseSetup, matchId: `v01-025-t20-${i}`, gameId: `v01-025-g-t20-${i}`, seed, groundId } },
          worldBytes,
          manifest,
        );
        const game = runFixtureT20(setup);
        const chain = eventChainManifest(game);
        const replayed = replayT20Events(setup, game.events, chain);
        if (canonicalJson(game.core) !== canonicalJson(replayed.core)) throw new Error(`T20_REPLAY_DIVERGENCE_${i}`);
        resimulateT20Commands(game);
        const card = projectT20Scorecard(game);
        replayPassed++;
        resimulationPassed++;
        totalEvents += game.events.length;
        firstInningsRuns.push(card.innings[0]!.runs);
        const reason = card.result?.kind ?? 'UNKNOWN';
        stoppingReasons[reason] = (stoppingReasons[reason] ?? 0) + 1;
        hashes.push(chain.finalEventHash);
      } else if (format === 'ODI') {
        const baseSetup = params.odiTemplate.setup as Record<string, unknown>;
        const setup = validateODIMatchSetup(
          { ...params.odiTemplate, setup: { ...baseSetup, matchId: `v01-025-odi-${i}`, gameId: `v01-025-g-odi-${i}`, seed, groundId } },
          worldBytes,
          manifest,
        );
        const game = runFixtureODI(setup);
        const chain = odiEventChainManifest(game);
        const replayed = replayODIEvents(setup, game.events, chain);
        if (canonicalJson(game.core) !== canonicalJson(replayed.core)) throw new Error(`ODI_REPLAY_DIVERGENCE_${i}`);
        resimulateODICommands(game);
        const card = projectODIScorecard(game);
        replayPassed++;
        resimulationPassed++;
        totalEvents += game.events.length;
        firstInningsRuns.push(card.innings[0]!.runs);
        const reason = card.result?.kind ?? 'UNKNOWN';
        stoppingReasons[reason] = (stoppingReasons[reason] ?? 0) + 1;
        hashes.push(chain.finalEventHash);
      } else {
        const baseSetup = params.red5Template.setup as Record<string, unknown>;
        const setup = validateRed5MatchSetup(
          { ...params.red5Template, setup: { ...baseSetup, matchId: `v01-025-red5-${i}`, gameId: `v01-025-g-red5-${i}`, seed, groundId } },
          worldBytes,
          manifest,
        );
        const game = runFixtureRed5(setup);
        const chain = red5EventChainManifest(game);
        const replayed = replayRed5Events(setup, game.events, chain);
        if (canonicalJson(game.core) !== canonicalJson(replayed.core)) throw new Error(`RED5_REPLAY_DIVERGENCE_${i}`);
        resimulateRed5Commands(game);
        const card = projectRed5Scorecard(game);
        replayPassed++;
        resimulationPassed++;
        totalEvents += game.events.length;
        firstInningsRuns.push(card.innings[0]!.runs);
        const reason = card.result ? `${card.result.kind}:${card.result.completionReason}` : 'UNKNOWN';
        stoppingReasons[reason] = (stoppingReasons[reason] ?? 0) + 1;
        hashes.push(chain.finalEventHash);
      }
    }
    const sorted = [...firstInningsRuns].sort((a, b) => a - b);
    return {
      format,
      matches: matchesPerFormat,
      replayPassed,
      resimulationPassed,
      totalEvents,
      firstInningsRunsUncertainty: meanAndSe(firstInningsRuns),
      firstInningsTails: {
        min: sorted[0] ?? 0,
        p10: percentile(sorted, 0.1),
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        max: sorted[sorted.length - 1] ?? 0,
      },
      stoppingReasons,
      aggregateChainDigestSha256: sha256Hex(canonicalStateBytes(hashes)),
    };
  };

  return {
    version: CROSS_FORMAT_DIAGNOSTICS_VERSION,
    modelStatus: 'SYNTHETIC_ALPHA' as const,
    empiricallyCalibrated: false as const,
    formats: (['T20', 'ODI', 'RED_BALL'] as const).map(runFormat),
  };
}

/**
 * Release-scale synthetic innings Monte Carlo (default 10,000 reproducible
 * simulations per format) using the exact production generateDelivery kernel.
 * Reports innings totals, phase breakdowns, extreme tails, 95% confidence
 * intervals, and stopping conditions without claiming empirical calibration.
 */
export function runReleaseScaleFormatSimulations(params: {
  readonly format: Format;
  readonly simulationCount: number;
  readonly seedPrefix?: string;
}) {
  const { format, simulationCount } = params;
  const seedPrefix = params.seedPrefix ?? 'LC_V01_025_MC10K';
  if (!Number.isSafeInteger(simulationCount) || simulationCount < 1) {
    throw new Error('INVALID_SIMULATION_COUNT');
  }
  const rulesId = format === 'T20' ? 'LC_T20_01' : format === 'ODI' ? 'LC_ODI_01' : 'LC_RED5_01';
  const rulesHash = generatorRuleHash(rulesId);
  const maxLegalBalls = format === 'T20' ? 120 : format === 'ODI' ? 300 : 540;
  const allottedLegalBalls = format === 'RED_BALL' ? null : maxLegalBalls;
  const slots = T20_LATER_SLOTS.slice(0, 9).map((slotId, index) => {
    const pos = FIELD_REGISTRY.positions.find(p => p.slotId === slotId)!;
    return {
      playerId: `f-${index + 1}`,
      sector: pos.sector,
      depth: pos.depth,
      role: slotId.startsWith('slip') ? ('SLIP' as const) : ('NORMAL' as const),
      catchingRating: 64,
      throwingRating: 64,
    };
  });

  const inningsTotals: number[] = [];
  const inningsWickets: number[] = [];
  const phaseRuns: Record<'EARLY' | 'MIDDLE' | 'LATE', number[]> = { EARLY: [], MIDDLE: [], LATE: [] };
  const stoppingConditions: Record<'ALL_OUT' | 'ALLOCATION_OR_CAP_REACHED', number> = {
    ALL_OUT: 0,
    ALLOCATION_OR_CAP_REACHED: 0,
  };

  const bucketFor = (legalBalls: number): 'EARLY' | 'MIDDLE' | 'LATE' => {
    if (format === 'T20') return legalBalls < 36 ? 'EARLY' : legalBalls < 90 ? 'MIDDLE' : 'LATE';
    if (format === 'ODI') return legalBalls < 60 ? 'EARLY' : legalBalls < 240 ? 'MIDDLE' : 'LATE';
    return legalBalls < 150 ? 'EARLY' : legalBalls < 360 ? 'MIDDLE' : 'LATE';
  };

  for (let simIdx = 0; simIdx < simulationCount; simIdx++) {
    const seed = `${seedPrefix}:${format}:${simIdx}`;
    let runs = 0;
    let wickets = 0;
    let legalBalls = 0;
    let attemptOrdinal = 0;
    let freeHit = false;
    let pEarly = 0;
    let pMid = 0;
    let pLate = 0;
    const seamBp = 4200 + (simIdx % 5) * 600;
    const turnBp = 4000 + ((simIdx * 3) % 5) * 600;

    while (wickets < 10 && legalBalls < maxLegalBalls && attemptOrdinal < maxLegalBalls + 120) {
      const orderDepth = Math.min(9, wickets);
      const batSkill = Math.max(28, 68 - orderDepth * 4);
      const bowlSkill = 60 + ((Math.floor(legalBalls / 6) + simIdx) % 4) * 3;
      const bucket = bucketFor(legalBalls);
      const agg: 0 | 1 | 2 | 3 | 4 =
        format === 'RED_BALL'
          ? 1
          : bucket === 'LATE' && wickets <= 6
            ? 3
            : 2;

      const g = generateDelivery({
        kind: 'GENERATE_DELIVERY',
        generatorVersion: 'LC_CONDITIONAL_DELIVERY_V1',
        stagePackId: 'synthetic-alpha-01-delivery-v1',
        stagePackHash: DELIVERY_STAGE_PACK_SHA256,
        randomVersion: RANDOM_VERSION,
        probabilityVersion: PROBABILITY_VERSION,
        modelId: PROBABILITY_MODEL_ID,
        modelHash: MODEL_PACK_SHA256,
        lutVersion: EXP_LUT_VERSION,
        lutHash: EXP_LUT_SHA256,
        rulesHash,
        matchId: `mc-${format}-${simIdx}`,
        seed,
        attemptOrdinal,
        format,
        phase: expectedGeneratorPhase(format, legalBalls),
        context: {
          rulesId,
          inningsIndex: 0,
          deliveryIndex: attemptOrdinal,
          battingTeamId: 'BAT',
          bowlingTeamId: 'BOWL',
          strikerId: `b-${wickets + 1}`,
          nonStrikerId: `b-${Math.min(11, wickets + 2)}`,
          strikerEnd: 'NORTH',
          endsBefore: { north: `b-${wickets + 1}`, south: `b-${Math.min(11, wickets + 2)}` },
          bowlerId: `bw-${(Math.floor(legalBalls / 6) % 5) + 1}`,
          keeperId: 'kp-1',
          outfieldIds: slots.map(s => s.playerId),
          legalBalls,
          runs,
          wickets,
          allocatedBalls: allottedLegalBalls,
          targetToWin: null,
          freeHitPending: freeHit,
          ballAgeLegalBalls: format === 'RED_BALL' ? legalBalls % 480 : legalBalls,
        },
        bowling: {
          bowlingStyle: (Math.floor(legalBalls / 6) % 5) >= 3 ? 'OFF_SPIN' : 'FAST',
          controlRating: bowlSkill,
          movementRating: bowlSkill,
          fatigueBp: Math.min(6000, Math.floor(legalBalls * 8)),
          line: 'OFF',
          intendedLength: 'GOOD',
          effort: 'NORMAL',
          variationId: 'stock',
        },
        batting: {
          defenceRating: batSkill,
          timingRating: batSkill,
          powerRating: batSkill,
          rotationRating: batSkill,
          vsPaceRating: batSkill,
          vsSpinRating: batSkill,
          aggression: agg,
          intent: 'NORMAL',
          attemptedStroke: true,
          shotSectorWeights: [12, 14, 14, 12, 12, 12, 12, 12],
        },
        conditions: { seamBp, turnBp },
        field: {
          keeper: { keepingRating: 66, catchingRating: 66, throwingRating: 64 },
          slots,
        },
      });
      attemptOrdinal++;
      const r = g.resolution;
      const ballRuns =
        r.batRuns + r.extras.wides + r.extras.noBalls + r.extras.byes + r.extras.legByes + r.extras.penalties;
      runs += ballRuns;
      if (bucket === 'EARLY') pEarly += ballRuns;
      else if (bucket === 'MIDDLE') pMid += ballRuns;
      else pLate += ballRuns;
      if (r.dismissal !== null) wickets++;
      const legal = r.legality === 'LEGAL';
      if (legal) {
        legalBalls++;
        freeHit = false;
      } else if (r.extras.noBalls > 0 && format !== 'RED_BALL') {
        freeHit = true;
      }
    }

    inningsTotals.push(runs);
    inningsWickets.push(wickets);
    phaseRuns.EARLY.push(pEarly);
    phaseRuns.MIDDLE.push(pMid);
    phaseRuns.LATE.push(pLate);
    if (wickets >= 10) stoppingConditions.ALL_OUT++;
    else stoppingConditions.ALLOCATION_OR_CAP_REACHED++;
  }

  const sortedRuns = [...inningsTotals].sort((a, b) => a - b);
  return {
    version: CROSS_FORMAT_DIAGNOSTICS_VERSION,
    format,
    simulationCount,
    seedPrefix,
    modelStatus: 'SYNTHETIC_ALPHA' as const,
    empiricallyCalibrated: false as const,
    inningsRuns: meanAndSe(inningsTotals),
    inningsWickets: meanAndSe(inningsWickets),
    phases: {
      earlyRuns: meanAndSe(phaseRuns.EARLY),
      middleRuns: meanAndSe(phaseRuns.MIDDLE),
      lateRuns: meanAndSe(phaseRuns.LATE),
    },
    tails: {
      min: sortedRuns[0] ?? 0,
      p01: percentile(sortedRuns, 0.01),
      p05: percentile(sortedRuns, 0.05),
      p10: percentile(sortedRuns, 0.1),
      p50: percentile(sortedRuns, 0.5),
      p90: percentile(sortedRuns, 0.9),
      p95: percentile(sortedRuns, 0.95),
      p99: percentile(sortedRuns, 0.99),
      max: sortedRuns[sortedRuns.length - 1] ?? 0,
    },
    stoppingConditions,
    summaryDigestSha256: sha256Hex(canonicalStateBytes({ sortedRuns, inningsWickets, stoppingConditions })),
  };
}
