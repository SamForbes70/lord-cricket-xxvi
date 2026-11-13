import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RED5_PLANNING_BUDGET,
  RED5_CONTINUATION_UTILITY_VERSION,
  evaluateRed5DeclarationRollouts,
  evaluateRed5FollowOnRollouts,
  scoreRed5RolloutOutcome,
} from '@lcxxvi/ai';
import { canonicalJson } from '@lcxxvi/contracts';
import {
  RED5_WEATHER_FORECAST_VERSION,
  RED5_WEATHER_SCHEDULE_VERSION,
  cloneRed5SessionForPlanning,
  computeUncertainRed5Forecast,
  createRed5Session,
  executeRed5Command,
  generateRed5WeatherSchedule,
  nextSafeBoundaryWeatherInterruption,
  red5FixtureAutopilotStep,
  simulateRed5DeclarationContinuation,
  validateODIMatchSetup,
  validateRed5MatchSetup,
  validateT20MatchSetup,
} from '@lcxxvi/simulation';

const worldBytes = readFileSync('packages/data/worlds/fictional-eight-01.json');
const manifest = JSON.parse(
  readFileSync('packages/data/worlds/fictional-eight-01.manifest.json', 'utf8'),
);
const red5Request = JSON.parse(
  readFileSync('tests/fixtures/world/red5-valid-setup.json', 'utf8'),
);
const t20Request = JSON.parse(
  readFileSync('tests/fixtures/world/t20-valid-setup.json', 'utf8'),
);
const odiRequest = JSON.parse(
  readFileSync('tests/fixtures/world/odi-valid-setup.json', 'utf8'),
);

function reachReadyOverBoundary(seed: string, oversToPlay = 1) {
  const setup = validateRed5MatchSetup(
    { ...red5Request, setup: { ...red5Request.setup, seed } },
    worldBytes,
    manifest,
  );
  let session = createRed5Session(setup);
  while (
    session.core.phase !== 'READY' ||
    session.core.innings.length === 0 ||
    session.core.innings[0]!.innings.legalBalls < oversToPlay * 6
  ) {
    session = executeRed5Command(session, red5FixtureAutopilotStep(session)).session;
  }
  while (session.core.phase !== 'READY' || session.core.innings[0]!.innings.legalBalls % 6 !== 0) {
    session = executeRed5Command(session, red5FixtureAutopilotStep(session)).session;
  }
  return session;
}

describe('V01-022: declaration and follow-on rollout evaluation', () => {
  it('uses an explicit versioned utility across innings win, outright win, draw and loss', () => {
    expect(
      scoreRed5RolloutOutcome(
        { completed: true, winnerTeamId: 'T1', isDraw: false, isTie: false, wonByInnings: true, evaluatingTeamLeadRuns: 85 },
        'T1',
        'AGGRESSIVE',
      ),
    ).toBe(1200);
    expect(
      scoreRed5RolloutOutcome(
        { completed: true, winnerTeamId: 'T1', isDraw: false, isTie: false, wonByInnings: false, evaluatingTeamLeadRuns: 45 },
        'T1',
        'BALANCED',
      ),
    ).toBe(1000);
    const conservativeDraw = scoreRed5RolloutOutcome(
      { completed: true, winnerTeamId: null, isDraw: true, isTie: false, wonByInnings: false, evaluatingTeamLeadRuns: -40 },
      'T1',
      'CONSERVATIVE',
    );
    const aggressiveDraw = scoreRed5RolloutOutcome(
      { completed: true, winnerTeamId: null, isDraw: true, isTie: false, wonByInnings: false, evaluatingTeamLeadRuns: -40 },
      'T1',
      'AGGRESSIVE',
    );
    expect(conservativeDraw).toBeGreaterThan(aggressiveDraw);
    expect(
      scoreRed5RolloutOutcome(
        { completed: true, winnerTeamId: 'T2', isDraw: false, isTie: false, wonByInnings: false, evaluatingTeamLeadRuns: -30 },
        'T1',
        'BALANCED',
      ),
    ).toBeLessThan(0);
  });

  it('evaluates declaration and follow-on branches via versioned budgets and rejects invalid budgets', () => {
    const decl = evaluateRed5DeclarationRollouts({
      evaluatingTeamId: 'T1',
      profile: 'BALANCED',
      budget: DEFAULT_RED5_PLANNING_BUDGET,
      simulateAction: action =>
        action === 'DECLARE_NOW'
          ? { completed: true, winnerTeamId: 'T1', isDraw: false, isTie: false, wonByInnings: false, evaluatingTeamLeadRuns: 60 }
          : { completed: true, winnerTeamId: null, isDraw: true, isTie: false, wonByInnings: false, evaluatingTeamLeadRuns: 140 },
    });
    expect(decl.utilityVersion).toBe(RED5_CONTINUATION_UTILITY_VERSION);
    expect(decl.recommendedDeclare).toBe(true);
    expect(decl.rolloutsEvaluated).toBe(DEFAULT_RED5_PLANNING_BUDGET.rolloutsPerAction * 2);

    const followOn = evaluateRed5FollowOnRollouts({
      evaluatingTeamId: 'T1',
      profile: 'AGGRESSIVE',
      simulateAction: action =>
        action === 'ENFORCE'
          ? { completed: true, winnerTeamId: 'T1', isDraw: false, isTie: false, wonByInnings: true, evaluatingTeamLeadRuns: 95 }
          : { completed: true, winnerTeamId: null, isDraw: true, isTie: false, wonByInnings: false, evaluatingTeamLeadRuns: 220 },
    });
    expect(followOn.recommendedEnforce).toBe(true);
    expect(followOn.enforceMeanUtility).toBe(1200);

    expect(() =>
      evaluateRed5DeclarationRollouts({
        evaluatingTeamId: 'T1',
        profile: 'BALANCED',
        budget: { ...DEFAULT_RED5_PLANNING_BUDGET, rolloutsPerAction: 0 },
        simulateAction: () => ({ completed: true, winnerTeamId: null, isDraw: true, isTie: false, wonByInnings: false, evaluatingTeamLeadRuns: 0 }),
      }),
    ).toThrow(/LC_RED5_INVALID_PLANNING_BUDGET/);
  });

  it('clones continuations onto an independent planning seed without mutating live state or consuming live draws', () => {
    const live = reachReadyOverBoundary('v01-022-live-isolation-seed', 2);
    const beforeSnapshot = canonicalJson(live);
    const cloneA = cloneRed5SessionForPlanning(live, 'DECL_DECLARE_NOW', 0);
    expect(cloneA.setup.seed).not.toBe(live.setup.seed);

    const evaluation = evaluateRed5DeclarationRollouts({
      evaluatingTeamId: live.core.innings[0]!.innings.battingTeamId,
      profile: 'BALANCED',
      budget: { version: 'LC_RED5_PLANNING_BUDGET_V1', rolloutsPerAction: 1, maxCommandsPerRollout: 80, continueOversBeforeReview: 2 },
      simulateAction: (action, rolloutIndex, budget) =>
        simulateRed5DeclarationContinuation({
          liveSession: live,
          action,
          rolloutIndex,
          maxCommands: budget.maxCommandsPerRollout,
          continueOversBeforeReview: budget.continueOversBeforeReview,
        }),
    });
    expect(evaluation.rolloutsEvaluated).toBe(2);
    expect(canonicalJson(live)).toBe(beforeSnapshot);

    // Advancing the live session produces the exact same next delivery as an untouched fresh run.
    const control = reachReadyOverBoundary('v01-022-live-isolation-seed', 2);
    const liveNext = executeRed5Command(live, red5FixtureAutopilotStep(live)).session;
    const controlNext = executeRed5Command(control, red5FixtureAutopilotStep(control)).session;
    expect(liveNext.lastEventHash).toBe(controlNext.lastEventHash);
  });
});

describe('V01-023: seeded weather and uncertain forecasts', () => {
  it('generates versioned 30-minute segments in an independent random domain and is repeatable', () => {
    const s1 = generateRed5WeatherSchedule('weather-seed-alpha', 'match-alpha');
    const s2 = generateRed5WeatherSchedule('weather-seed-alpha', 'match-alpha');
    const s3 = generateRed5WeatherSchedule('weather-seed-beta', 'match-alpha');
    expect(s1.version).toBe(RED5_WEATHER_SCHEDULE_VERSION);
    expect(s1.segments).toHaveLength(75);
    expect(canonicalJson(s1)).toBe(canonicalJson(s2));
    expect(canonicalJson(s1)).not.toBe(canonicalJson(s3));
  });

  it('exposes coarse uncertain forecasts without revealing the hidden segment schedule', () => {
    const forecast = computeUncertainRed5Forecast({
      seed: 'weather-seed-alpha',
      matchId: 'match-alpha',
      day: 1,
      localSeconds: 11 * 3600,
    });
    expect(forecast.version).toBe(RED5_WEATHER_FORECAST_VERSION);
    expect(['CLEAR', 'UNSETTLED', 'WET']).toContain(forecast.outlook);
    expect(['LOW', 'MODERATE', 'HIGH']).toContain(forecast.rainRiskBand);
    expect(forecast.estimatedRainChanceRangePct[1]).toBeGreaterThan(forecast.estimatedRainChanceRangePct[0]);
    expect(Object.keys(forecast).sort()).toEqual([
      'day',
      'estimatedRainChanceRangePct',
      'outlook',
      'rainRiskBand',
      'summaryText',
      'version',
    ]);
  });

  it('applies interruptions only at safe over boundaries and keeps limited-overs rain disabled', () => {
    let rainySeed = 'rain-scan-0';
    for (let i = 0; i < 200; i++) {
      const candidate = `rain-scan-${i}`;
      const sched = generateRed5WeatherSchedule(candidate, red5Request.setup.matchId);
      if (sched.segments.slice(0, 3).some(seg => seg.state === 'RAIN')) {
        rainySeed = candidate;
        break;
      }
    }
    const setup = validateRed5MatchSetup(
      { ...red5Request, setup: { ...red5Request.setup, seed: rainySeed } },
      worldBytes,
      manifest,
    );
    let session = createRed5Session(setup);
    // Toss phase is not a safe weather boundary.
    expect(nextSafeBoundaryWeatherInterruption({ session, appliedSegmentKeys: new Set() })).toBeNull();

    while (
      session.core.phase !== 'READY' ||
      session.core.innings.length === 0 ||
      session.core.innings[0]!.innings.legalBalls < 1
    ) {
      session = executeRed5Command(session, red5FixtureAutopilotStep(session)).session;
    }
    // Mid-over (legalBalls % 6 !== 0) is never interrupted.
    if (session.core.innings[0]!.innings.legalBalls % 6 !== 0) {
      expect(nextSafeBoundaryWeatherInterruption({ session, appliedSegmentKeys: new Set() })).toBeNull();
    }

    // Limited-overs rules manifests and setup capabilities keep limitedOversRain strictly false.
    const t20Setup = validateT20MatchSetup(t20Request, worldBytes, manifest);
    const odiSetup = validateODIMatchSetup(odiRequest, worldBytes, manifest);
    expect(red5Request.setup.capabilities.limitedOversRain).toBe(false);
    expect(t20Request.setup.capabilities.limitedOversRain).toBe(false);
    expect(odiRequest.setup.capabilities.limitedOversRain).toBe(false);
    expect(t20Setup.versions.rules).toBe('LC_T20_01');
    expect(odiSetup.versions.rules).toBe('LC_ODI_01');
  });
});
