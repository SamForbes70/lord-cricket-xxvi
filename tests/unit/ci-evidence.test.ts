/** Checks evidence freshness and preserves failed verification when artifact uploads are unavailable. */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { collectCiEvidence, combineCiEvidence, legSummary, publishCiEvidence } from "../../scripts/ci-evidence.mjs";
function setup(kind = "windows", scope = "all") {
  const root = mkdtempSync(join(tmpdir(), "lc-ci-evidence-")), startedAfterMs = Date.now() - 2000;
  const directory = kind === "windows" ? "test-results/owner-acceptance-test" : "docs/verification-pass07a";
  const path = `${directory}/${kind === "windows" ? "acceptance.json" : "pass07a-results.json"}`;
  const report = kind === "windows" ? { ...scope === "all" ? {} : { scope }, startedAtUtc: new Date().toISOString(), source: { commit: "test-commit" }, status: "PASS", commands: [{ status: "PASS", exitCode: 0 }] }
    : { startedAtUTC: new Date().toISOString(), status: "PASS", gates: [{ status: "PASS", exitCode: 0 }] };
  const put = (name: string, value: unknown) => { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), JSON.stringify(value)); };
  put(path, report);
  const base = kind === "windows" ? directory : "test-results/acceptance-observations";
  for (const name of ["chromium-performance.json", "chromium-engine-performance.json", "firefox-performance.json", "firefox-engine-performance.json"]) {
    if (scope === "all" || name.startsWith(`${scope}-`)) put(`${base}/${name}`, { browser: name, referenceHardwareAccepted: false });
  }
  return { root, path, report, put, options: { root, kind, startedAfterMs, commit: "test-commit", scope }, clean: () => rmSync(root, { recursive: true, force: true }) };
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
  it("keeps the full Windows run in the version 1 shape", () => {
    const s = setup();
    try { const result = collectCiEvidence(s.options); expect(result.version).toBe("LC_CI_EVIDENCE_V1"); expect(result).not.toHaveProperty("scope"); }
    finally { s.clean(); }
  });
  it.each([["core", 0], ["chromium", 2], ["firefox", 2]] as const)("retains the %s leg with only its own observations", (scope, count) => {
    const s = setup("windows", scope);
    try {
      const result = collectCiEvidence(s.options);
      expect(result).toMatchObject({ version: "LC_CI_EVIDENCE_V2", scope, status: "PASS" });
      expect(result.observations).toHaveLength(count);
      expect(result.observations.every(observation => observation.path.split("/").pop()!.startsWith(scope))).toBe(true);
    } finally { s.clean(); }
  });
  it("rejects a leg report attributed to another leg, and a leg claimed as a full run", () => {
    const s = setup("windows", "chromium");
    try {
      expect(() => collectCiEvidence({ ...s.options, scope: "firefox" })).toThrow("SCOPE");
      expect(() => collectCiEvidence({ ...s.options, scope: "all" })).toThrow("SCOPE");
      expect(() => collectCiEvidence({ ...s.options, kind: "linux", scope: "chromium" })).toThrow("ARGUMENT");
    } finally { s.clean(); }
  });
  it("fails a browser leg that lacks its own observation", () => {
    const s = setup("windows", "firefox");
    try { rmSync(join(s.root, "test-results/owner-acceptance-test/firefox-engine-performance.json")); expect(collectCiEvidence(s.options).status).toBe("FAIL"); }
    finally { s.clean(); }
  });
});

describe("Windows leg aggregation", () => {
  const plans = { all: ["browser-installation", "build", "unit", "match-ui", "career"], core: ["browser-installation", "build", "unit"],
    chromium: ["browser-installation", "build", "match-ui", "career"], firefox: ["browser-installation", "build", "match-ui", "career"] };
  const leg = (scope: string, overrides: Record<string, unknown> = {}, counts: Record<string, number> = { "match-ui": 126, career: 12 }) => JSON.stringify({
    version: "LC_CI_LEG_SUMMARY_V1", scope, commit: "c", status: "PASS", upstreamStatus: "success", primary: { path: "p", sha256: "0".repeat(64) }, evidenceSha256: "0".repeat(64),
    commands: plans[scope as keyof typeof plans].map(name => ({ name, status: "PASS", exitCode: 0, elapsedMs: 1, passed: counts[name] ?? null })),
    observations: scope === "core" ? [] : [`${scope}-performance.json`, `${scope}-engine-performance.json`], missing: [], ...overrides });
  const legs = () => ({ core: leg("core"), chromium: leg("chromium"), firefox: leg("firefox") });
  const combine = (changes: Record<string, string | undefined> = {}, legsResult = "success") => combineCiEvidence({ legs: { ...legs(), ...changes }, legsResult, commit: "c", plans });
  it("passes three complete legs from this commit", () => {
    const result = combine();
    expect(result).toMatchObject({ version: "LC_CI_EVIDENCE_AGGREGATE_V1", status: "PASS", problems: [] });
    expect(result.browserCounts["match-ui"]).toEqual({ chromium: 126, firefox: 126 });
  });
  it("builds leg records from collected evidence", () => {
    const s = setup("windows", "core");
    try {
      s.put(s.path, { ...s.report, commands: [{ name: "unit", status: "PASS", exitCode: 0, elapsedMs: 5, evidence: { passed: 900 } }] });
      const summary = legSummary(collectCiEvidence(s.options));
      expect(summary).toMatchObject({ version: "LC_CI_LEG_SUMMARY_V1", scope: "core", commit: "test-commit", status: "PASS", commands: [{ name: "unit", passed: 900 }], observations: [] });
      expect(() => legSummary(collectCiEvidence(setup().options))).toThrow("ARGUMENT");
    } finally { s.clean(); }
  });
  it.each([
    ["a failed leg job", {}, "failure"],
    ["a missing leg", { firefox: undefined }, "success"],
    ["a leg from another commit", { core: leg("core", { commit: "other" }) }, "success"],
    ["a failed leg", { chromium: leg("chromium", { status: "FAIL" }) }, "success"],
    ["a leg recorded as another leg", { firefox: leg("chromium") }, "success"],
    ["a leg that skipped a planned step", { core: leg("core", { commands: [] }) }, "success"],
    ["a leg without its observations", { chromium: leg("chromium", { observations: [] }) }, "success"],
    ["browsers that ran different numbers of tests", { firefox: leg("firefox", {}, { "match-ui": 120, career: 12 }) }, "success"],
    ["a browser suite with no tests", { chromium: leg("chromium", {}, { "match-ui": 0, career: 12 }), firefox: leg("firefox", {}, { "match-ui": 0, career: 12 }) }, "success"],
  ] as const)("fails on %s", (_label, changes, legsResult) => {
    const result = combine(changes as Record<string, string | undefined>, legsResult);
    expect(result.status).toBe("FAIL"); expect(result.problems.length).toBeGreaterThan(0);
  });
  it("fails when no leg ran a step of the full plan", () => {
    const result = combineCiEvidence({ legs: legs(), legsResult: "success", commit: "c", plans: { ...plans, all: [...plans.all, "lint"] } });
    expect(result.problems).toContain("no leg ran lint");
  });
});
