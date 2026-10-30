/** Checks evidence freshness and preserves failed verification when artifact uploads are unavailable. */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { collectCiEvidence, publishCiEvidence } from "../../scripts/ci-evidence.mjs";
function setup(kind = "windows") {
  const root = mkdtempSync(join(tmpdir(), "lc-ci-evidence-")), startedAfterMs = Date.now() - 2000;
  const directory = kind === "windows" ? "test-results/owner-acceptance-test" : "docs/verification-pass07a";
  const path = `${directory}/${kind === "windows" ? "acceptance.json" : "pass07a-results.json"}`;
  const report = kind === "windows" ? { startedAtUtc: new Date().toISOString(), source: { commit: "test-commit" }, status: "PASS", commands: [{ status: "PASS", exitCode: 0 }] }
    : { startedAtUTC: new Date().toISOString(), status: "PASS", gates: [{ status: "PASS", exitCode: 0 }] };
  const put = (name: string, value: unknown) => { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), JSON.stringify(value)); };
  put(path, report);
  const base = kind === "windows" ? directory : "test-results/acceptance-observations";
  for (const name of ["chromium-performance.json", "chromium-engine-performance.json", "firefox-performance.json", "firefox-engine-performance.json"]) put(`${base}/${name}`, { browser: name, referenceHardwareAccepted: false });
  return { root, path, report, put, options: { root, kind, startedAfterMs, commit: "test-commit" }, clean: () => rmSync(root, { recursive: true, force: true }) };
}
describe("CI evidence retention", () => {
  it.each(["linux", "windows"])("retains fresh %s evidence without artifact service access", kind => {
    const s = setup(kind);
    try { const result = collectCiEvidence(s.options); expect(result.status).toBe("PASS"); expect(result.observations).toHaveLength(4); expect(result.primary.sha256).toMatch(/^[a-f0-9]{64}$/); }
    finally { s.clean(); }
  });
  it("rejects a historical report even when the copied file is fresh", () => {
    const s = setup();
    try { s.put(s.path, { ...s.report, startedAtUtc: "2020-01-01T00:00:00Z" }); expect(() => collectCiEvidence(s.options)).toThrow("STALE_RUN"); }
    finally { s.clean(); }
  });
  it("rejects a report from another source commit", () => {
    const s = setup();
    try { expect(() => collectCiEvidence({ ...s.options, commit: "different" })).toThrow("COMMIT"); }
    finally { s.clean(); }
  });
  it("retains failed commands and upstream failures as failures", () => {
    const s = setup();
    try {
      expect(collectCiEvidence({ ...s.options, upstreamStatus: "failure" }).status).toBe("FAIL");
      s.put(s.path, { ...s.report, commands: [{ status: "FAIL", exitCode: 1 }] });
      expect(collectCiEvidence(s.options).status).toBe("FAIL");
    } finally { s.clean(); }
  });
  it("does not accept incomplete browser observations", () => {
    const s = setup();
    try { rmSync(join(s.root, "test-results/owner-acceptance-test/firefox-performance.json")); expect(collectCiEvidence(s.options).status).toBe("FAIL"); }
    finally { s.clean(); }
  });
  it("writes structured evidence to the job summary and logs", () => {
    const s = setup(), log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const result = collectCiEvidence(s.options), summary = join(s.root, "summary.md"); publishCiEvidence(result, summary);
      expect(readFileSync(summary, "utf8")).toContain('"status":"PASS"');
      expect(readFileSync(summary, "utf8")).toContain("best-effort"); expect(log).toHaveBeenCalledWith(expect.stringContaining("LCXXVI_CI_EVIDENCE_BEGIN"));
      const chunks = log.mock.calls.map(call => call[0] as string).filter(line => line.startsWith("LCXXVI_CI_EVIDENCE_CHUNK "));
      const restored = chunks.map(line => JSON.parse(line.replace(/^LCXXVI_CI_EVIDENCE_CHUNK \d+\/\d+ /, ""))).join("");
      expect(JSON.parse(restored)).toEqual(result);
      expect(() => publishCiEvidence(result, "")).toThrow("SUMMARY_PATH");
    } finally { log.mockRestore(); s.clean(); }
  });
});
