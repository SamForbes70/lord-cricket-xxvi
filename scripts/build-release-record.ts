/**
 * V01-029: Deterministic V0.1 release candidate record and manifest packager.
 * Reconciles every advertised capability with passing evidence, records owner-PC
 * and human gates honestly without fabrication, and keeps public deployment
 * separately authorised.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ReleaseCapabilityEntry {
  readonly capabilityId: string;
  readonly advertised: string;
  readonly status: string;
  readonly evidence: readonly string[];
}

export interface V01ReleaseRecord {
  readonly schema: 'LC_V01_RELEASE_RECORD_V1';
  readonly generatedAtUtc: string;
  readonly modelStatus: 'SYNTHETIC_ALPHA';
  readonly empiricallyCalibrated: false;
  readonly publicDeploymentAuthorised: false;
  readonly publicDeploymentNote: string;
  readonly testedRevision: {
    readonly commit: string | null;
    readonly branch: string | null;
    readonly workingTreeClean: boolean | null;
  };
  readonly manifests: {
    readonly packageLockSha256: string;
    readonly scoringKernelSha256: string;
    readonly defaultWorldSha256: string;
    readonly defaultWorldManifestSha256: string;
    readonly v01BacklogSha256: string;
    readonly offlineAssetManifestSha256: string | null;
    readonly batch7DiagnosticsSha256: string | null;
  };
  readonly externalAndOwnerGates: Record<string, string>;
  readonly capabilities: readonly ReleaseCapabilityEntry[];
  readonly knownLimits: readonly string[];
  readonly recoveryInstructions: readonly string[];
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function generateReleaseRecord(rootDir = process.cwd()): V01ReleaseRecord {
  const gitRev = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' });
  const gitBranch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: rootDir, encoding: 'utf8' });
  const gitStatus = spawnSync('git', ['status', '--porcelain'], { cwd: rootDir, encoding: 'utf8' });

  const offlineManifestPath = join(rootDir, 'apps/web/dist/offline-manifest.json');
  const batch7ResultsPath = join(rootDir, 'docs/verification-v01-batch7-diagnostics/results.json');

  const manifests = {
    packageLockSha256: sha256File(join(rootDir, 'package-lock.json')),
    scoringKernelSha256: sha256File(join(rootDir, 'packages/domain/src/scoring-kernel.ts')),
    defaultWorldSha256: sha256File(join(rootDir, 'packages/data/worlds/fictional-eight-01.json')),
    defaultWorldManifestSha256: sha256File(join(rootDir, 'packages/data/worlds/fictional-eight-01.manifest.json')),
    v01BacklogSha256: sha256File(join(rootDir, 'docs/V01_BACKLOG.json')),
    offlineAssetManifestSha256: existsSync(offlineManifestPath) ? sha256File(offlineManifestPath) : null,
    batch7DiagnosticsSha256: existsSync(batch7ResultsPath) ? sha256File(batch7ResultsPath) : null,
  };

  const capabilities: ReleaseCapabilityEntry[] = [
    {
      capabilityId: 'CAP-MATCH-ENGINES',
      advertised: 'Deterministic T20, ODI, and five-day red-ball match engines with hash-chained replay',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'npm run verify:09:core',
        'npm run smoke',
        'docs/verification-v01-batch7-diagnostics/results.json',
      ],
    },
    {
      capabilityId: 'CAP-T20-CAREER-AND-RECOVERY',
      advertised: 'Single-season 8-team 56-fixture T20 management career with durable IndexedDB managed-match recovery and slot-scoped bindings',
      status: 'VERIFIED_ENGINEERING_OWNER_ACCEPTED',
      evidence: [
        'npm run management:acceptance',
        'tests/ui/managed-recovery.spec.ts',
        'tests/m4/managed-binding-persistence.spec.ts',
        'tests/unit/managed-binding.test.ts',
      ],
    },
    {
      capabilityId: 'CAP-WORLD-EDITING-AND-ROSTER-IMPORT',
      advertised: 'Pre-game world editing and JSON roster pack import across exhibition and T20 career play',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'tests/ui/roster-import.spec.ts',
        'tests/ui/roster-career.spec.ts',
        'docs/verification-v01-world-editing/REPORT.md',
      ],
    },
    {
      capabilityId: 'CAP-TACTICAL-AI-AND-RAIN',
      advertised: 'Cross-format T20/ODI/red-ball tactical AI profiles, reversible delegation, and deterministic red-ball weather/forecast interruptions',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'tests/unit/tactical-captains-v01.test.ts',
        'tests/unit/red5-rollout-weather.test.ts',
        'tests/ui/tactical-formats.spec.ts',
      ],
    },
    {
      capabilityId: 'CAP-CAREER-ARCHIVES-AND-REPLAY',
      advertised: 'Completed career match event archives, replay without recomputing outcomes, and checkpoint inspection and recovery, in portable career archives',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'tests/unit/v01-career-event-archive-recovery.test.ts',
        'tests/ui/career-replay-and-recovery.spec.ts',
      ],
    },
    {
      capabilityId: 'CAP-SYNTHETIC-DIAGNOSTICS',
      advertised: 'Fixed-seed cross-format replay (100 matches per format) and release-scale synthetic diagnostics, with synthetic claims only',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'tests/unit/v01-batch7-diagnostics.test.ts',
        'docs/verification-v01-batch7-diagnostics/results.json',
        'docs/verification-v01-batch7-diagnostics/FOLLOW_UP_2026-11-13.md',
      ],
    },
    {
      capabilityId: 'CAP-OFFLINE-AND-ACCESSIBILITY',
      advertised: 'Precached offline shell, transaction-deferred safe updates, retained engine assets (/engineering.html recovery), keyboard/contrast/150%/200%-zoom accessibility',
      status: 'VERIFIED_BROWSER_AUTOMATION_HUMAN_AT_OWNER_DECLARED',
      evidence: [
        'tests/unit/offline-safe-updates.test.ts',
        'tests/ui/offline-assets.spec.ts',
        'tests/ui/accessibility-release-audit.spec.ts',
        'tests/ui/match.spec.ts',
      ],
    },
  ];

  const knownLimits = [
    'Model calibration status is SYNTHETIC_ALPHA (synthetic-alpha-01); zero empirical realism or ICC certification claims are made.',
    'Playable career scope in V0.1 is a single-season 8-team T20 league; multi-season persistent world, player lifecycle, and squad economy remain gated behind explicit V0.1 owner acceptance.',
    'Duckworth-Lewis-Stern (DLS) and limited-overs rain targets remain disabled in V0.1; weather interruptions apply to five-day red-ball matches only.',
    'Career saves can be exported, imported, switched, and recovered into new slots, while direct UI deletion of career slots is omitted in V0.1.',
    'The eight performance budgets are confirmed (docs/PERFORMANCE_BUDGETS.md, memory budget 768 MiB). The reference-laptop run, owner-PC run and human screen-reader walkthrough are owner-declared complete on 13 November 2026 with no measurements or observations stored in this repository; the only recorded observations are from a Linux container and hosted CI.',
    'The delegation journal kept its version identifier (LC_DELEGATION_JOURNAL_V1) while its schema widened (FIELD, DECLARATION, FOLLOW_ON, NEW_BALL and an optional red-ball profile). Older journals still validate, but a build that predates the widening will reject a journal that uses the new values.',
    'testedRevision is the commit the record was generated on, which is the commit before the record itself: a file cannot contain its own commit hash.',
    'Match and career recovery were verified in Chromium and Firefox on hosted Windows and in Chromium on Linux; no run exists on Safari or on macOS.',
  ];

  const recoveryInstructions = [
    'Interrupted career fixture match: reopen #career, #roster-career, or #exhibition in the same browser profile; durable managed-binding:<matchGameId> records re-associate or settle completed results automatically.',
    'Unwanted or stuck pending career match: open #exhibition and click "Abandon career match" to release the binding without corrupting the career save.',
    'Damaged newest match or career checkpoint: open the affected save or click "Create recovered copy" to roll back deterministically to the newest valid hash-verified checkpoint in a fresh slot while preserving pending match bindings.',
    'Cross-device backup or browser reset: export portable .lcxxvi archives from #exhibition, #career, or #roster-career and re-import them with full event-chain hash verification.',
    'Staged offline update or asset trouble: updates wait until active match/save transactions finish; /engineering.html remains precached as an explicit diagnostic and recovery surface.',
  ];

  return {
    schema: 'LC_V01_RELEASE_RECORD_V1',
    generatedAtUtc: new Date().toISOString(),
    modelStatus: 'SYNTHETIC_ALPHA',
    empiricallyCalibrated: false,
    publicDeploymentAuthorised: false,
    publicDeploymentNote: 'Public deployment requires separate explicit owner authorisation after V0.1 acceptance.',
    testedRevision: {
      commit: gitRev.status === 0 ? gitRev.stdout.trim() : null,
      branch: gitBranch.status === 0 ? gitBranch.stdout.trim() : null,
      workingTreeClean: gitStatus.status === 0 ? gitStatus.stdout.trim() === '' : null,
    },
    manifests,
    externalAndOwnerGates: {
      v01_011_managedMatchRecoveryOwnerAcceptance: 'OWNER_ACCEPTED_2026_11_13',
      v01_028_referenceHardwarePerformance: 'OWNER_DECLARED_COMPLETE_2026_11_13_NO_REFERENCE_HOST_MEASUREMENTS_IN_REPOSITORY',
      ownerWindowsPcAcceptanceRun: 'OWNER_DECLARED_COMPLETE_2026_11_13_NO_COLLECTOR_OUTPUT_IN_REPOSITORY',
      humanAssistiveTechnologyWalkthrough: 'OWNER_DECLARED_COMPLETE_2026_11_13_NO_OBSERVATIONS_IN_REPOSITORY',
      reviewOwnersRulesDataModel: 'OWNER_HOLDS_ALL_THREE_ROLES_2026_11_13',
      researchTrack_RES_001_002_003: 'BLOCKED_EXTERNAL_DATA_AND_SEPARATE_PROMOTION_GATE',
    },
    capabilities,
    knownLimits,
    recoveryInstructions,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = join(process.cwd(), 'docs/release-v01');
  mkdirSync(outDir, { recursive: true });
  const record = generateReleaseRecord(process.cwd());
  writeFileSync(join(outDir, 'RELEASE_RECORD.json'), JSON.stringify(record, null, 2) + '\n');
  console.log('Wrote docs/release-v01/RELEASE_RECORD.json');
}
