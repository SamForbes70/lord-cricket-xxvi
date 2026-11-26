/** Checks that the hosted Windows legs together run every acceptance step, each browser suite once per browser. */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ACCEPTANCE_SCOPES, BROWSER_SUITES, SPLIT_SCOPES, parseAcceptanceArguments, scopeSteps } from "../../scripts/acceptance-scope.mjs";

type Step = { name: string; args: string[]; timeoutMs?: number; report?: string };
const plan = (...args: string[]) => JSON.parse(execFileSync(process.execPath, ["scripts/owner-acceptance.mjs", "--plan", ...args], { encoding: "utf8" })) as { version: string; scope?: string; steps: Step[] };
const full = plan().steps;

describe("acceptance scopes", () => {
  it("keeps the default full run unchanged", () => {
    const all = plan();
    expect(all.version).toBe("LC_OWNER_ACCEPTANCE_PLAN_V1"); expect(all).not.toHaveProperty("scope");
    expect(scopeSteps(full, "all")).toBe(full);
    expect(plan("--scope=all").steps.map(step => step.name)).toEqual(full.map(step => step.name));
  });
  it("runs every step of the full plan in at least one leg, with no new step", () => {
    const legs = Object.fromEntries(SPLIT_SCOPES.map(scope => [scope, plan(`--scope=${scope}`)]));
    for (const scope of SPLIT_SCOPES) { expect(legs[scope]!.version).toBe("LC_OWNER_ACCEPTANCE_PLAN_V2"); expect(legs[scope]!.scope).toBe(scope); }
    const covered = new Set(SPLIT_SCOPES.flatMap(scope => legs[scope]!.steps.map(step => step.name)));
    expect([...covered].sort()).toEqual(full.map(step => step.name).sort());
  });
  it("runs the non-browser checks once, in the core leg", () => {
    const core = scopeSteps(full, "core").map(step => step.name);
    for (const name of ["schemas-check", "typecheck", "lint", "fixtures-engine", "frozen-world", "unit", "persistence-m4"]) {
      expect(core).toContain(name);
      for (const browser of ["chromium", "firefox"]) expect(scopeSteps(full, browser).map(step => step.name)).not.toContain(name);
    }
    for (const name of BROWSER_SUITES) expect(core).not.toContain(name);
    expect(scopeSteps(full, "core").find(step => step.name === "browser-installation")!.args.slice(-1)).toEqual(["chromium"]);
  });
  it("runs each browser suite once per browser with Playwright's project filter and unchanged limits", () => {
    for (const browser of ["chromium", "firefox"]) {
      const other = browser === "chromium" ? "firefox" : "chromium", steps = scopeSteps(full, browser);
      expect(steps.find(step => step.name === "browser-installation")!.args).toContain(browser);
      expect(steps.find(step => step.name === "browser-installation")!.args).not.toContain(other);
      for (const name of BROWSER_SUITES) {
        const original = full.find(step => step.name === name)!, scoped = steps.find(step => step.name === name)!;
        expect(scoped.args).toEqual([...original.args, `--project=${browser}`]);
        expect(scoped.timeoutMs).toBe(original.timeoutMs); expect(scoped.report).toBe(original.report);
      }
      expect(steps.map(step => step.name)).toEqual(expect.arrayContaining(["build", "research-browser-build", "performance-build"]));
    }
    expect(scopeSteps(full, "chromium").find(step => step.name === "match-ui")!.timeoutMs).toBe(8_400_000);
  });
  it("refuses an unassigned step, a preset project and an unknown scope", () => {
    expect(() => scopeSteps([...full, { name: "new-suite", args: [] }], "core")).toThrow("UNASSIGNED_ACCEPTANCE_STEP:new-suite");
    expect(() => scopeSteps(full.map(step => step.name === "career" ? { ...step, args: [...step.args, "--project=firefox"] } : step), "chromium")).toThrow("ACCEPTANCE_PROJECT_ALREADY_SET");
    expect(() => scopeSteps(full, "webkit")).toThrow("UNKNOWN_ACCEPTANCE_SCOPE");
  });
  it("parses arguments strictly and keeps the owner-PC gate to a full run", () => {
    expect(parseAcceptanceArguments([]).scope).toBe("all");
    expect(parseAcceptanceArguments(["--skip-install", "--scope=firefox"])).toEqual({ flags: new Set(["--skip-install"]), scope: "firefox" });
    for (const args of [["--scope=webkit"], ["--scope=core", "--scope=core"], ["--plan", "--plan"], ["--unknown"]]) expect(() => parseAcceptanceArguments(args)).toThrow("UNKNOWN_OR_DUPLICATE_ACCEPTANCE_ARGUMENT");
    expect(() => parseAcceptanceArguments(["--owner-pc", "--scope=core"])).toThrow("OWNER_PC_REQUIRES_FULL_SCOPE");
    expect(parseAcceptanceArguments(["--owner-pc"]).scope).toBe("all");
    expect(spawnSync(process.execPath, ["scripts/owner-acceptance.mjs", "--plan", "--owner-pc", "--scope=chromium"]).status).not.toBe(0);
    expect(ACCEPTANCE_SCOPES).toEqual(["all", ...SPLIT_SCOPES]);
  });
  it("matches the hosted workflow's legs and keeps the windows-browser-acceptance check name", () => {
    const workflow = readFileSync(".github/workflows/verify.yml", "utf8").replace(/\r\n/g, "\n"); // Windows checkouts use CRLF
    expect(workflow).toContain(`scope: [${SPLIT_SCOPES.join(", ")}]`);
    expect(workflow).toContain("run: node scripts/owner-acceptance.mjs --skip-install --scope=${{ matrix.scope }}");
    expect(workflow).toContain("run: node scripts/ci-evidence.mjs --kind=windows --scope=${{ matrix.scope }}");
    expect(workflow).toMatch(/\n {2}windows-browser-acceptance:\n {4}needs: windows-acceptance\n {4}if: always\(\)\n/);
    expect(workflow).toContain("run: node scripts/ci-evidence.mjs --combine");
    for (const scope of SPLIT_SCOPES) expect(workflow).toContain(`leg-${scope}: \${{ steps.evidence.outputs.leg-${scope} }}`);
  });
});
