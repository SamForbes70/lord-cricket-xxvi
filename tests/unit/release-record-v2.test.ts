import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RELEASE_DIRECTORY, RELEASE_TAG, generateReleaseRecordV2 } from '../../scripts/build-release-record-v2.js';

describe('Stage 17: release record V2', () => {
  it('records the owner-authorised release, the Stage 16 gate as passed by direction with nothing run, and synthetic status', () => {
    const record = generateReleaseRecordV2(process.cwd());
    expect(record.schema).toBe('LC_RELEASE_RECORD_V2');
    expect(record.releaseTag).toBe(RELEASE_TAG);
    expect(record.modelStatus).toBe('SYNTHETIC_ALPHA');
    expect(record.empiricallyCalibrated).toBe(false);
    expect(record.publicDeploymentAuthorised).toBe(true);
    expect(record.publicDeploymentAuthorisation.ownerWords).toContain('then do stage 17');
    expect(record.externalAndOwnerGates.stage16ProductQualityAcceptance).toBe('OWNER_DIRECTED_PASS_2026_11_18_NONE_OF_FOUR_PARTS_RUN');
    expect(record.knownLimits.some((l) => l.includes('None of its four parts'))).toBe(true);
    expect(record.manifests.scoringKernelSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('every evidence file a capability cites exists, and capability ids are unique', () => {
    const record = generateReleaseRecordV2(process.cwd());
    const missing = record.capabilities.flatMap((c) => c.evidence.filter((e) => !e.startsWith('npm run') && !existsSync(e)).map((e) => `${c.capabilityId}: ${e}`));
    expect(missing).toEqual([]);
    const ids = record.capabilities.map((c) => c.capabilityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the V0.1 record unchanged and un-authorised', () => {
    const v1 = JSON.parse(readFileSync('docs/release-v01/RELEASE_RECORD.json', 'utf8'));
    expect(v1.schema).toBe('LC_V01_RELEASE_RECORD_V1');
    expect(v1.publicDeploymentAuthorised).toBe(false);
  });

  it('the sealed V2 record, when present, matches the generator apart from time and revision', () => {
    const path = `${RELEASE_DIRECTORY}/RELEASE_RECORD.json`;
    if (!existsSync(path)) return;
    const sealed = JSON.parse(readFileSync(path, 'utf8'));
    const fresh = generateReleaseRecordV2(process.cwd());
    const strip = (r: Record<string, unknown>) => ({ ...r, generatedAtUtc: null, testedRevision: null, manifests: null });
    expect(strip(sealed)).toEqual(strip(JSON.parse(JSON.stringify(fresh))));
  });
});
