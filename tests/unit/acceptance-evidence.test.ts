/** Prevents stale or partial test results from becoming acceptance evidence. */
import { describe, it, expect } from "vitest";
import { vitestEvidence, playwrightEvidence, npmInvocation } from "../../scripts/acceptance-evidence.mjs";
const valid = { startTime: 1000, numTotalTests: 602, numPassedTests: 602, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, success: true, testResults: [{ name: "current.test.ts" }] };
describe("current-run acceptance evidence", () => {
  it("runs fixed npm commands on Windows without shell metacharacters", () => {
    expect(npmInvocation(["run", "build"], "win32", "cmd.exe")).toEqual({ executable: "cmd.exe", args: ["/d", "/s", "/c", "npm run build"] });
    expect(npmInvocation(["run", "build"], "linux")).toEqual({ executable: "npm", args: ["run", "build"] });
    expect(() => npmInvocation(["run", "build&other"], "win32")).toThrow();
    expect(() => npmInvocation(["%SECRET%"], "win32")).toThrow();
  });
  it("records observed counts without a fixed suite total", () => {
    expect(vitestEvidence(valid, 999)).toMatchObject({ passed: 602, files: 1 });
    expect(vitestEvidence({ ...valid, numTotalTests: 607, numPassedTests: 607 }, 999).passed).toBe(607);
  });
  it("rejects stale, failed, skipped, empty and incomplete unit evidence", () => {
    expect(() => vitestEvidence(valid, 1001)).toThrow("STALE");
    for (const changed of [{ numFailedTests: 1 }, { numPendingTests: 1 }, { numTodoTests: 1 }, { numPassedTests: 601 }, { success: false }, { testResults: [] }, { numTotalTests: 0 }, { numTotalTests: NaN }]) expect(() => vitestEvidence({ ...valid, ...changed }, 999)).toThrow();
  });
  it("requires fully passed browser suites and preserves actual counts", () => {
    const stats = { expected: 6, unexpected: 0, flaky: 0, skipped: 0 };
    expect(playwrightEvidence({ stats }).passed).toBe(6);
    for (const changed of [{ unexpected: 1 }, { flaky: 1 }, { skipped: 1 }, { expected: 0 }]) expect(() => playwrightEvidence({ stats: { ...stats, ...changed } })).toThrow();
  });
});
