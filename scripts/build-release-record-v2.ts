/**
 * Stage 17: the release record for the first GitHub Release (owner direction, 18 November 2026).
 *
 * `LC_RELEASE_RECORD_V2` is a new version beside `LC_V01_RELEASE_RECORD_V1`, which stays unchanged in
 * `docs/release-v01/`. V2 records the owner's authorisation of a public release, the Stage 16 gate as passed by
 * direction with nothing measured, and the capabilities built since V0.1, each with evidence that exists in the tree.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateReleaseRecord, type ReleaseCapabilityEntry } from './build-release-record.js';

export const RELEASE_TAG = 'alpha-2026-11-19';
export const RELEASE_DIRECTORY = 'docs/release-2026-11-18';

export interface ReleaseRecordV2 {
  readonly schema: 'LC_RELEASE_RECORD_V2';
  readonly releaseTag: string;
  readonly generatedAtUtc: string;
  readonly modelStatus: 'SYNTHETIC_ALPHA';
  readonly empiricallyCalibrated: false;
  readonly publicDeploymentAuthorised: true;
  readonly publicDeploymentAuthorisation: {
    readonly date: '2026-11-18';
    readonly ownerWords: string;
    readonly scope: string;
  };
  readonly testedRevision: { readonly commit: string | null; readonly branch: string | null; readonly workingTreeClean: boolean | null };
  readonly manifests: ReturnType<typeof generateReleaseRecord>['manifests'];
  readonly externalAndOwnerGates: Record<string, string>;
  readonly capabilities: readonly ReleaseCapabilityEntry[];
  readonly knownLimits: readonly string[];
  readonly recoveryInstructions: readonly string[];
}

const OWNER_WORDS =
  'Pass stage 16 - direct instruction - no arguments, then do stage 17 Ignore the blocked agents. Playing tour and auction matches should be user playable.';

export function generateReleaseRecordV2(rootDir = process.cwd()): ReleaseRecordV2 {
  const v1 = generateReleaseRecord(rootDir);

  const capabilities: ReleaseCapabilityEntry[] = [
    ...v1.capabilities.filter((c) => c.capabilityId !== 'CAP-T20-CAREER-AND-RECOVERY'),
    {
      capabilityId: 'CAP-MULTI-SEASON-CAREER',
      advertised:
        'Persistent multi-season 8-club T20 career: player lifecycle and youth academy, contracts and budgets, tactical briefings, durable managed-match recovery',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'tests/unit/player-lifecycle-stage3.test.ts',
        'tests/unit/squad-economy-stage4.test.ts',
        'tests/unit/tactical-briefing-stage5.test.ts',
        'tests/unit/world-state-v5.test.ts',
        'tests/ui/player-lifecycle-stage3.spec.ts',
        'tests/ui/managed-recovery.spec.ts',
      ],
    },
    {
      capabilityId: 'CAP-PRESENTATION',
      advertised: 'Live 2D field and highlights, contextual text commentary, optional procedural sound and narration',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'tests/unit/field-presentation-stage6.test.ts',
        'tests/unit/commentary-stage7.test.ts',
        'tests/unit/audio-stage8.test.ts',
        'tests/ui/field-presentation-stage6.spec.ts',
      ],
    },
    {
      capabilityId: 'CAP-HISTORY-AWARDS-STORIES',
      advertised: 'Historical statistics and leaderboards, match and season awards, player and manager stories',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'tests/unit/historical-stats-stage9.test.ts',
        'tests/unit/awards-stage10.test.ts',
        'tests/unit/career-stories-stage11.test.ts',
        'tests/ui/career-stories-stage11.spec.ts',
      ],
    },
    {
      capabilityId: 'CAP-SCENARIOS',
      advertised: 'Fictional scenario challenges',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: ['tests/unit/scenario-mode-stage12.test.ts', 'tests/ui/scenario-mode-stage12.spec.ts'],
    },
    {
      capabilityId: 'CAP-EXHIBITION-RULES',
      advertised:
        'Opt-in exhibition rules: ICC-style super overs, rain-shortened T20 and one-day matches with a fictional resource table, and player reviews (DRS)',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'tests/unit/super-over-stage14.test.ts',
        'tests/unit/rain-match-stage14.test.ts',
        'tests/unit/rain-targets-stage14.test.ts',
        'tests/unit/player-reviews-stage14.test.ts',
        'tests/ui/super-over-stage14.spec.ts',
        'tests/ui/rain-stage14.spec.ts',
      ],
    },
    {
      capabilityId: 'CAP-CAPTAINCY',
      advertised:
        "Captain's highlights: limited-overs exhibitions, managed T20 fixtures and two close-finish scenarios played in bounded passages with plans; rival captains with observable tendencies and an opt-in match-aware opponent; a match-day selection room in career; the Pavilion redesign of club selection, career home and the scoreboard",
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'tests/ui/scenario-mode-stage12.spec.ts',
        'tests/ui/managed-recovery.spec.ts',
        'tests/ui/edited-world.spec.ts',
        'docs/verification-captains-pavilion/PLAY.md',
        'docs/verification-close-finish/PLAYTEST.md',
      ],
    },
    {
      capabilityId: 'CAP-TOURNAMENTS',
      advertised:
        'Fictional tournaments: built-in and user-made competitions, tours against a touring XI, squads rebuilt by auction, and built-in team crests; the player can play their own team\'s matches, including tour and auction matches',
      status: 'VERIFIED_SYNTHETIC_ALPHA',
      evidence: [
        'tests/unit/tournament-stage15.test.ts',
        'tests/unit/user-tournaments-stage15.test.ts',
        'tests/unit/tours-stage15.test.ts',
        'tests/unit/auction-stage15.test.ts',
        'tests/unit/team-crests-stage15.test.ts',
        'tests/unit/playable-generated-stage15.test.ts',
        'tests/unit/bowler-plan.test.ts',
        'tests/ui/tournament-stage15.spec.ts',
      ],
    },
  ];

  const knownLimits = [
    'Model calibration status is SYNTHETIC_ALPHA (synthetic-alpha-01): all teams, players and results are fictional, and no claim of realism or ICC certification is made.',
    'Stage 16 was passed by the owner\'s direct instruction on 18 November 2026. None of its four parts (owner-PC measurements including the 768 MiB memory budget, observed playtest, screen-reader walkthrough, 20-season soak) were run, and the repository holds no results from them.',
    'Test evidence comes from hosted CI (Linux, and Windows with Chromium and Firefox) and Linux containers only. Nothing has been run on Safari or macOS.',
    'Rain-shortened matches and player reviews are exhibitions only and never enter career or tournament tables. Weather in careers applies to five-day red-ball matches only.',
    'Tournament matches between generated squads (tours and auctions) have no super over: a tied knockout goes to the higher-placed side.',
    'The Windows launcher EXE is unsigned (owner decision), so Windows SmartScreen may warn before it runs.',
    'Saves live in the browser profile, tied to http://127.0.0.1:4180. Clearing browser data deletes them: export .lcxxvi backups. An older build cannot read saves written by this one.',
    'The close-finish and captaincy features were checked by automated browser runs only: no human playtest responses or voluntary replays were collected (docs/verification-close-finish/PLAYTEST.md).',
    'testedRevision is the commit the record was generated on, which is the commit before the record itself: a file cannot contain its own commit hash.',
  ];

  return {
    schema: 'LC_RELEASE_RECORD_V2',
    releaseTag: RELEASE_TAG,
    generatedAtUtc: new Date().toISOString(),
    modelStatus: 'SYNTHETIC_ALPHA',
    empiricallyCalibrated: false,
    publicDeploymentAuthorised: true,
    publicDeploymentAuthorisation: {
      date: '2026-11-18',
      ownerWords: OWNER_WORDS,
      scope: `A GitHub Release (${RELEASE_TAG}) of the public repository, with the game and source zips built from the tagged commit.`,
    },
    testedRevision: v1.testedRevision,
    manifests: v1.manifests,
    externalAndOwnerGates: {
      ...v1.externalAndOwnerGates,
      stage16ProductQualityAcceptance: 'OWNER_DIRECTED_PASS_2026_11_18_NONE_OF_FOUR_PARTS_RUN',
      pausedAgents: 'OWNER_DIRECTED_IGNORE_2026_11_18',
      exeCodeSigning: 'UNSIGNED_BY_OWNER_DECISION_2026_11_17',
    },
    capabilities,
    knownLimits,
    recoveryInstructions: v1.recoveryInstructions,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = join(process.cwd(), RELEASE_DIRECTORY);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'RELEASE_RECORD.json'), JSON.stringify(generateReleaseRecordV2(process.cwd()), null, 2) + '\n');
  console.log(`Wrote ${RELEASE_DIRECTORY}/RELEASE_RECORD.json`);
}
