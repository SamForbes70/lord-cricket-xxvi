export type CiEvidence = {
  version: string; kind: string; scope?: string; commit: string; upstreamStatus: string; status: string;
  primary: { path: string; sha256: string; value: Record<string, unknown> };
  observations: Array<{ path: string; sha256: string; value: Record<string, unknown> }>;
  missing: Array<{ path: string; reason: string }>;
  retention: string;
};
export type CiLegSummary = {
  version: string; scope: string; commit: string; status: string; upstreamStatus: string;
  primary: { path: string; sha256: string }; evidenceSha256: string;
  commands: Array<{ name: string; status: string; exitCode: number | null; elapsedMs: number | null; passed: number | null }>;
  observations: string[]; missing: string[];
};
export type CiEvidenceAggregate = {
  version: string; kind: string; commit: string; legsResult: string; status: string; problems: string[];
  browserCounts: Record<string, Record<string, number | null>>; legs: Record<string, CiLegSummary>; retention: string;
};
export function expectedObservations(scope: string): string[];
export function collectCiEvidence(options: { root: string; kind: string; startedAfterMs: number; commit: string; upstreamStatus?: string; scope?: string }): CiEvidence;
export function publishCiEvidence(evidence: CiEvidence | CiEvidenceAggregate, summaryPath: string): void;
export function legSummary(evidence: CiEvidence): CiLegSummary;
export function combineCiEvidence(options: { legs: Record<string, string | undefined>; legsResult: string; commit: string; plans: Record<string, string[]> }): CiEvidenceAggregate;
