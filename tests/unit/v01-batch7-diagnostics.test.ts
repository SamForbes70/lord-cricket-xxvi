import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateT20MatchSetup } from '@lcxxvi/simulation';
import {
  EXPLOITATION_GATE_VERSION,
  runPairedSkillFieldPitchSweep,
  runT20ExploitationPolicyPairs,
} from '../../apps/batch/src/exploitation-gates.js';
import {
  CROSS_FORMAT_DIAGNOSTICS_VERSION,
  runCrossFormatReplayGate,
  runReleaseScaleFormatSimulations,
} from '../../apps/batch/src/cross-format-diagnostics.js';

const worldBytes = readFileSync('packages/data/worlds/fictional-eight-01.json');
const manifest = JSON.parse(readFileSync('packages/data/worlds/fictional-eight-01.manifest.json', 'utf8'));
const t20Template = JSON.parse(readFileSync('tests/fixtures/world/t20-valid-setup.json', 'utf8'));
const odiTemplate = JSON.parse(readFileSync('tests/fixtures/world/odi-valid-setup.json', 'utf8'));
const red5Template = JSON.parse(readFileSync('tests/fixtures/world/red5-valid-setup.json', 'utf8'));

describe('V01-024: synthetic quality and tactical exploitation gates', () => {
  it('verifies directional monotonicity across skills, fields and pitches across T20, ODI and RED_BALL', () => {
    for (const format of ['T20', 'ODI', 'RED_BALL'] as const) {
      const sweep = runPairedSkillFieldPitchSweep({ format, sampleCount: 300 });
      expect(sweep.monotonicityChecks.higherBatScoresMore).toBe(true);
      expect(sweep.monotonicityChecks.higherBatDismissedLessOrEqual).toBe(true);
      expect(sweep.monotonicityChecks.higherBowlConcedesLess).toBe(true);
      expect(sweep.monotonicityChecks.higherSeamRaisesDismissalsOrCutsScoring).toBe(true);
      expect(sweep.monotonicityChecks.higherTurnRaisesDismissalsOrCutsScoring).toBe(true);
      expect(sweep.monotonicityChecks.boundaryProtectionCutsBoundaries).toBe(true);
    }
  }, 30_000);

  it('evaluates neutral baseline, tactical captain and extreme one-note exploitation policies without changing model weights', () => {
    const setups = [0, 1].map(idx =>
      validateT20MatchSetup(
        {
          ...t20Template,
          setup: {
            ...(t20Template.setup as Record<string, unknown>),
            matchId: `exp-m-${idx}`,
            gameId: `exp-g-${idx}`,
            seed: `exp-seed-${idx}`,
          },
        },
        worldBytes,
        manifest,
      ),
    );
    const report = runT20ExploitationPolicyPairs(setups);
    expect(report.version).toBe(EXPLOITATION_GATE_VERSION);
    expect(report.coefficientsChanged).toBe(false);
    expect(report.empiricallyValidated).toBe(false);
    expect(report.nonDominanceFindings.blindSlogIncreasesWicketsVsBaseline).toBe(true);
    expect(report.nonDominanceFindings.blindDefendScoresLessThanTactical).toBe(true);
  }, 60_000);
});

describe('V01-025: cross-format replay and release-scale diagnostics', () => {
  it('replays and resimulates all three enabled formats identically from deterministic seeds', () => {
    const replay = runCrossFormatReplayGate({
      worldBytes,
      manifest,
      t20Template,
      odiTemplate,
      red5Template,
      matchesPerFormat: 1,
      seedPrefix: 'UNIT_REPLAY_CHECK',
    });
    const repeat = runCrossFormatReplayGate({
      worldBytes,
      manifest,
      t20Template,
      odiTemplate,
      red5Template,
      matchesPerFormat: 1,
      seedPrefix: 'UNIT_REPLAY_CHECK',
    });
    expect(replay.version).toBe(CROSS_FORMAT_DIAGNOSTICS_VERSION);
    expect(replay.empiricallyCalibrated).toBe(false);
    expect(replay.formats.map(f => f.format)).toEqual(['T20', 'ODI', 'RED_BALL']);
    for (const f of replay.formats) {
      expect(f.replayPassed).toBe(1);
      expect(f.resimulationPassed).toBe(1);
    }
    expect(replay.formats.map(f => f.aggregateChainDigestSha256)).toEqual(
      repeat.formats.map(f => f.aggregateChainDigestSha256),
    );
  }, 60_000);

  it('produces reproducible innings, phase, tail, uncertainty and stopping diagnostics without claiming empirical calibration', () => {
    const a = runReleaseScaleFormatSimulations({ format: 'T20', simulationCount: 50, seedPrefix: 'UNIT_MC' });
    const b = runReleaseScaleFormatSimulations({ format: 'T20', simulationCount: 50, seedPrefix: 'UNIT_MC' });
    expect(a.summaryDigestSha256).toBe(b.summaryDigestSha256);
    expect(a.empiricallyCalibrated).toBe(false);
    expect(a.stoppingConditions.ALL_OUT + a.stoppingConditions.ALLOCATION_OR_CAP_REACHED).toBe(50);
    expect(a.tails.min).toBeLessThanOrEqual(a.tails.p50);
    expect(a.tails.p50).toBeLessThanOrEqual(a.tails.max);
  }, 30_000);
});
