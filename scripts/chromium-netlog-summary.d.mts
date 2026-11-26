export type NetLogFileSummary = {
  file: string; bytes?: number; complete?: boolean; events?: number; unparsed?: number;
  firstEventUtc?: string | null; lastEventUtc?: string | null; error?: string;
  failureCounts?: Record<string, number>;
  failures?: Array<{ type: string | number; sourceId?: number; sourceType?: string | number; netErrorName: string | null; osError: number | null; params?: Record<string, unknown> }>;
  failingSourceEvents?: Array<{ sourceId: number; events: unknown[] }>;
};
export type NetLogSummary = { version: string; purpose: string; generatedAtUtc: string; directory: string; rawLogsKept: boolean; files: NetLogFileSummary[]; totalFailures: number };
export function summariseNetLog(path: string): Promise<NetLogFileSummary>;
export function summariseNetLogDirectory(directory: string, outFile: string, options?: { keepRaw?: boolean }): Promise<NetLogSummary>;
