export type CiEvidence = {
  version: string; kind: string; commit: string; upstreamStatus: string; status: string;
  primary: { path: string; sha256: string; value: Record<string, unknown> };
  observations: Array<{ path: string; sha256: string; value: Record<string, unknown> }>;
  missing: Array<{ path: string; reason: string }>;
  retention: string;
};
export function collectCiEvidence(options: { root: string; kind: string; startedAfterMs: number; commit: string; upstreamStatus?: string }): CiEvidence;
export function publishCiEvidence(evidence: CiEvidence, summaryPath: string): void;
