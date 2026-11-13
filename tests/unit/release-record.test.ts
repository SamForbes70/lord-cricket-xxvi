import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateReleaseRecord } from '../../scripts/build-release-record.js';
import { CONFIRMED_MEMORY_BUDGET_MB, parseConfiguredMemoryBudgetBytes } from '../acceptance/memory-probe.js';

describe('V01-029 & V01-028: release record and memory budget parser', () => {
  it('packages tested revision, SHA-256 manifests, honest external gates, and keeps public deployment un-authorised', () => {
    const record = generateReleaseRecord(process.cwd());
    expect(record.schema).toBe('LC_V01_RELEASE_RECORD_V1');
    expect(record.modelStatus).toBe('SYNTHETIC_ALPHA');
    expect(record.empiricallyCalibrated).toBe(false);
    expect(record.publicDeploymentAuthorised).toBe(false);
    expect(record.testedRevision.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(record.manifests.packageLockSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.manifests.scoringKernelSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.capabilities.length).toBeGreaterThanOrEqual(5);
    expect(record.knownLimits.length).toBeGreaterThanOrEqual(4);
    expect(record.recoveryInstructions.length).toBeGreaterThanOrEqual(4);
  });

  it('every evidence file a capability cites exists, so the record cannot cite a test that is not there', () => {
    const record = generateReleaseRecord(process.cwd());
    const missing = record.capabilities.flatMap(c => c.evidence.filter(e => !e.startsWith('npm run') && !existsSync(e)).map(e => `${c.capabilityId}: ${e}`));
    expect(missing).toEqual([]);
  });

  it('uses the owner-confirmed memory budget by default and lets LCXXVI_MEMORY_BUDGET_MB override it', () => {
    expect(CONFIRMED_MEMORY_BUDGET_MB).toBe(768);
    expect(parseConfiguredMemoryBudgetBytes(undefined)).toBe(768 * 1024 * 1024);
    expect(parseConfiguredMemoryBudgetBytes('')).toBe(768 * 1024 * 1024);
    expect(parseConfiguredMemoryBudgetBytes('1024')).toBe(1024 * 1024 * 1024);
    expect(() => parseConfiguredMemoryBudgetBytes('0')).toThrow(/INVALID_LCXXVI_MEMORY_BUDGET_MB/);
    expect(() => parseConfiguredMemoryBudgetBytes('abc')).toThrow(/INVALID_LCXXVI_MEMORY_BUDGET_MB/);
  });
});
