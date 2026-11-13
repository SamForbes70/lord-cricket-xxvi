import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { platform } from "node:os";

export interface TotalApplicationMemoryObservation {
  readonly method: "LINUX_PROC_PSS_AND_RSS" | "WINDOWS_CIM_WORKING_SET" | "UNSUPPORTED_OS_FALLBACK";
  readonly browserName: string;
  readonly matchedProcessCount: number;
  readonly totalRssOrWorkingSetBytes: number | null;
  readonly totalPssOrPrivateBytes: number | null;
  readonly includesWorkersAndNativeAllocations: boolean;
  readonly mainThreadJsHeapBytes: number | null;
  readonly userAgentSpecificBytes: number | null;
  readonly confirmedThresholdBytes: number | null;
  readonly thresholdConfirmedByOwner: boolean;
  readonly withinConfirmedThreshold: boolean | null;
}

/**
 * Owner-confirmed total application memory budget (13 November 2026), in MiB: 768.
 * It is compared with process-tree PSS on Linux and private bytes on Windows, so shared pages are counted once.
 * The figure was chosen for a four-core, 8 GB reference laptop. It is a target, not a measurement: a Linux
 * container observation (headless Chromium, 17 processes) measured about 596 MiB PSS, which is not reference hardware.
 * LCXXVI_MEMORY_BUDGET_MB overrides it for experiments.
 */
export const CONFIRMED_MEMORY_BUDGET_MB = 768;

export function parseConfiguredMemoryBudgetBytes(envValue = process.env.LCXXVI_MEMORY_BUDGET_MB): number | null {
  if (envValue === undefined || envValue.trim() === "") return CONFIRMED_MEMORY_BUDGET_MB * 1024 * 1024;
  const mb = Number(envValue);
  if (!Number.isFinite(mb) || mb <= 0) {
    throw new Error(`INVALID_LCXXVI_MEMORY_BUDGET_MB: ${envValue}`);
  }
  return Math.round(mb * 1024 * 1024);
}

function sampleLinuxBrowserMemory(browserName: string): {
  count: number;
  rssBytes: number | null;
  pssBytes: number | null;
} {
  const ps = spawnSync("ps", ["-eo", "pid=,rss=,comm=,args="], { encoding: "utf8", timeout: 5000 });
  if (ps.status !== 0 || !ps.stdout) return { count: 0, rssBytes: null, pssBytes: null };
  const token = browserName === "firefox" ? "firefox" : "chrom";
  let count = 0;
  let rssKb = 0;
  let pssKb = 0;
  let pssAvailable = true;
  for (const rawLine of ps.stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const rss = Number(m[2]);
    const comm = m[3]!.toLowerCase();
    const args = m[4]!.toLowerCase();
    if (!comm.includes(token) && !args.includes(token)) continue;
    count += 1;
    rssKb += rss;
    try {
      const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, "utf8");
      const pssMatch = rollup.match(/^Pss:\s+(\d+)\s+kB/m);
      if (pssMatch) pssKb += Number(pssMatch[1]);
      else pssAvailable = false;
    } catch {
      pssAvailable = false;
    }
  }
  if (count === 0) return { count: 0, rssBytes: null, pssBytes: null };
  return {
    count,
    rssBytes: rssKb * 1024,
    pssBytes: pssAvailable && pssKb > 0 ? pssKb * 1024 : null,
  };
}

function sampleWindowsBrowserMemory(browserName: string): {
  count: number;
  workingSetBytes: number | null;
  privateBytes: number | null;
} {
  const filterToken = browserName === "firefox" ? "firefox" : "chrom";
  const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -match '${filterToken}' } | Select-Object WorkingSetSize,PrivatePageCount | ConvertTo-Json -Compress`;
  const res = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    timeout: 10000,
  });
  if (res.status !== 0 || !res.stdout.trim()) {
    return { count: 0, workingSetBytes: null, privateBytes: null };
  }
  try {
    const parsed = JSON.parse(res.stdout.trim()) as
      | { WorkingSetSize?: number; PrivatePageCount?: number }
      | { WorkingSetSize?: number; PrivatePageCount?: number }[];
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    if (rows.length === 0) return { count: 0, workingSetBytes: null, privateBytes: null };
    let ws = 0;
    let priv = 0;
    for (const row of rows) {
      ws += Number(row.WorkingSetSize ?? 0);
      priv += Number(row.PrivatePageCount ?? 0);
    }
    return { count: rows.length, workingSetBytes: ws, privateBytes: priv };
  } catch {
    return { count: 0, workingSetBytes: null, privateBytes: null };
  }
}

export function measureTotalApplicationMemory(params: {
  browserName: string;
  mainThreadJsHeapBytes: number | null;
  userAgentSpecificBytes: number | null;
}): TotalApplicationMemoryObservation {
  const thresholdBytes = parseConfiguredMemoryBudgetBytes();
  const os = platform();
  if (os === "linux") {
    const linux = sampleLinuxBrowserMemory(params.browserName);
    const primary = linux.pssBytes ?? linux.rssBytes;
    return {
      method: "LINUX_PROC_PSS_AND_RSS",
      browserName: params.browserName,
      matchedProcessCount: linux.count,
      totalRssOrWorkingSetBytes: linux.rssBytes,
      totalPssOrPrivateBytes: linux.pssBytes,
      includesWorkersAndNativeAllocations: linux.count > 0,
      mainThreadJsHeapBytes: params.mainThreadJsHeapBytes,
      userAgentSpecificBytes: params.userAgentSpecificBytes,
      confirmedThresholdBytes: thresholdBytes,
      thresholdConfirmedByOwner: thresholdBytes !== null,
      withinConfirmedThreshold:
        thresholdBytes !== null && primary !== null ? primary <= thresholdBytes : null,
    };
  }
  if (os === "win32") {
    const win = sampleWindowsBrowserMemory(params.browserName);
    const primary = win.privateBytes ?? win.workingSetBytes;
    return {
      method: "WINDOWS_CIM_WORKING_SET",
      browserName: params.browserName,
      matchedProcessCount: win.count,
      totalRssOrWorkingSetBytes: win.workingSetBytes,
      totalPssOrPrivateBytes: win.privateBytes,
      includesWorkersAndNativeAllocations: win.count > 0,
      mainThreadJsHeapBytes: params.mainThreadJsHeapBytes,
      userAgentSpecificBytes: params.userAgentSpecificBytes,
      confirmedThresholdBytes: thresholdBytes,
      thresholdConfirmedByOwner: thresholdBytes !== null,
      withinConfirmedThreshold:
        thresholdBytes !== null && primary !== null ? primary <= thresholdBytes : null,
    };
  }
  return {
    method: "UNSUPPORTED_OS_FALLBACK",
    browserName: params.browserName,
    matchedProcessCount: 0,
    totalRssOrWorkingSetBytes: null,
    totalPssOrPrivateBytes: null,
    includesWorkersAndNativeAllocations: false,
    mainThreadJsHeapBytes: params.mainThreadJsHeapBytes,
    userAgentSpecificBytes: params.userAgentSpecificBytes,
    confirmedThresholdBytes: thresholdBytes,
    thresholdConfirmedByOwner: thresholdBytes !== null,
    withinConfirmedThreshold: null,
  };
}
