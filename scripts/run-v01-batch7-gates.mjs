import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import {
  validateT20MatchSetup,
} from '../packages/simulation/dist/index.js';
import {
  runPairedSkillFieldPitchSweep,
  runT20ExploitationPolicyPairs,
} from '../apps/batch/dist/exploitation-gates.js';
import {
  runCrossFormatReplayGate,
  runReleaseScaleFormatSimulations,
} from '../apps/batch/dist/cross-format-diagnostics.js';

if (!isMainThread) {
  const worldBytes = readFileSync('packages/data/worlds/fictional-eight-01.json');
  const manifest = JSON.parse(readFileSync('packages/data/worlds/fictional-eight-01.manifest.json', 'utf8'));
  const t20Template = JSON.parse(readFileSync('tests/fixtures/world/t20-valid-setup.json', 'utf8'));
  const odiTemplate = JSON.parse(readFileSync('tests/fixtures/world/odi-valid-setup.json', 'utf8'));
  const red5Template = JSON.parse(readFileSync('tests/fixtures/world/red5-valid-setup.json', 'utf8'));

  const { task } = workerData;
  if (task.kind === 'REPLAY_CHUNK') {
    // Run a slice of matches for one format via runCrossFormatReplayGate on matching seed prefix
    const res = runCrossFormatReplayGate({
      worldBytes,
      manifest,
      t20Template,
      odiTemplate,
      red5Template,
      matchesPerFormat: task.count,
      seedPrefix: task.seedPrefix,
    });
    parentPort.postMessage(res);
  } else if (task.kind === 'MC_FORMAT') {
    const res = runReleaseScaleFormatSimulations({
      format: task.format,
      simulationCount: task.simulationCount,
      seedPrefix: task.seedPrefix,
    });
    parentPort.postMessage(res);
  } else if (task.kind === 'SWEEP') {
    const sweeps = ['T20', 'ODI', 'RED_BALL'].map(format =>
      runPairedSkillFieldPitchSweep({ format, sampleCount: 600, seedPrefix: 'LC_V01_024_RELEASE' }),
    );
    const setups = Array.from({ length: 12 }, (_, idx) =>
      validateT20MatchSetup(
        {
          ...t20Template,
          setup: {
            ...t20Template.setup,
            matchId: `v01-024-m-${idx}`,
            gameId: `v01-024-g-${idx}`,
            seed: `LC_V01_024_POLICY:${idx}`,
          },
        },
        worldBytes,
        manifest,
      ),
    );
    const policies = runT20ExploitationPolicyPairs(setups);
    parentPort.postMessage({ sweeps, policies });
  }
} else {
  const runWorker = task =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { task } });
      w.on('message', resolve);
      w.on('error', reject);
      w.on('exit', code => {
        if (code !== 0) reject(new Error(`Worker exited with ${code}`));
      });
    });

  const startedAt = new Date().toISOString();
  console.log(`Starting V01-024 & V01-025 release-scale diagnostics (parallelism=${availableParallelism()})...`);

  // 5 chunks x 20 matches/format = 100 fixed replay+resimulation matches per enabled format (300 total)
  const replayChunksPromise = Promise.all(
    [0, 1, 2, 3, 4].map(chunk =>
      runWorker({
        kind: 'REPLAY_CHUNK',
        count: 20,
        seedPrefix: `LC_V01_025_REPLAY_C${chunk}`,
      }),
    ),
  );

  // 10,000 reproducible simulations per format across T20, ODI, RED_BALL (30,000 total)
  const mcPromise = Promise.all(
    ['T20', 'ODI', 'RED_BALL'].map(format =>
      runWorker({
        kind: 'MC_FORMAT',
        format,
        simulationCount: 10000,
        seedPrefix: 'LC_V01_025_MC10K',
      }),
    ),
  );

  const sweepPromise = runWorker({ kind: 'SWEEP' });

  const [replayChunks, mcResults, v01024] = await Promise.all([replayChunksPromise, mcPromise, sweepPromise]);

  // Aggregate the 5 x 20 = 100 replay matches per format
  const replaySummary = ['T20', 'ODI', 'RED_BALL'].map(format => {
    const entries = replayChunks.map(chunk => chunk.formats.find(f => f.format === format));
    const stoppingReasons = {};
    let matches = 0;
    let replayPassed = 0;
    let resimulationPassed = 0;
    let totalEvents = 0;
    for (const e of entries) {
      matches += e.matches;
      replayPassed += e.replayPassed;
      resimulationPassed += e.resimulationPassed;
      totalEvents += e.totalEvents;
      for (const [k, v] of Object.entries(e.stoppingReasons)) {
        stoppingReasons[k] = (stoppingReasons[k] ?? 0) + v;
      }
    }
    return {
      format,
      matches,
      replayPassed,
      resimulationPassed,
      totalEvents,
      stoppingReasons,
      chunkDigests: entries.map(e => e.aggregateChainDigestSha256),
    };
  });

  const outDir = 'docs/verification-v01-batch7-diagnostics';
  mkdirSync(outDir, { recursive: true });
  const payload = {
    schema: 'LC_V01_BATCH7_DIAGNOSTICS_EVIDENCE_V1',
    startedAtUtc: startedAt,
    completedAtUtc: new Date().toISOString(),
    modelStatus: 'SYNTHETIC_ALPHA',
    empiricallyCalibrated: false,
    v01_024: v01024,
    v01_025: {
      replay100PerFormat: replaySummary,
      simulations10000PerFormat: mcResults,
    },
  };
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(payload, null, 2) + '\n');
  console.log('Completed V01-024 & V01-025 release-scale gate ->', join(outDir, 'results.json'));
}
