/** Validates current-run test evidence without substituting historical counts. */
export function vitestEvidence(report, startedAt) {
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  if (!Number.isFinite(startedAt) || !Number.isFinite(report.startTime) || report.startTime < startedAt) throw new Error("STALE_UNIT_EVIDENCE");
  if (!integer(report.numTotalTests) || report.numTotalTests === 0 || report.numPassedTests !== report.numTotalTests || report.numFailedTests !== 0 || report.numPendingTests !== 0 || report.numTodoTests !== 0 || report.success !== true || !Array.isArray(report.testResults) || report.testResults.length === 0) throw new Error("INCOMPLETE_UNIT_EVIDENCE");
  return { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests, files: report.testResults.length, source: "CURRENT_RUN_VITEST_JSON" };
}

export function playwrightEvidence(report) {
  const stats = report.stats;
  if (!stats || !Number.isSafeInteger(stats.expected) || stats.expected < 1 || stats.unexpected !== 0 || stats.flaky !== 0 || stats.skipped !== 0) throw new Error("INCOMPLETE_BROWSER_EVIDENCE");
  return { passed: stats.expected, failed: stats.unexpected, flaky: stats.flaky, skipped: stats.skipped, source: "CURRENT_RUN_PLAYWRIGHT_JSON" };
}

/** Uses only fixed arguments when Windows requires its command processor to launch npm. */
export function npmInvocation(args, platform = process.platform, commandProcessor = process.env.ComSpec ?? "cmd.exe") {
  if (args.some(arg => !/^[A-Za-z0-9_.,:/=-]+$/.test(arg))) throw new Error("UNSAFE_NPM_ARGUMENT");
  return platform === "win32" ? { executable: commandProcessor, args: ["/d", "/s", "/c", `npm ${args.join(" ")}`] } : { executable: "npm", args };
}
