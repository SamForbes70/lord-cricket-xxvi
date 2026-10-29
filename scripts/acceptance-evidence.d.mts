export function vitestEvidence(report: unknown, startedAt: number): { passed: number; failed: number; skipped: number; files: number; source: string };
export function playwrightEvidence(report: unknown): { passed: number; failed: number; flaky: number; skipped: number; source: string };
export function npmInvocation(args: string[], platform?: string, commandProcessor?: string): { executable: string; args: string[] };
