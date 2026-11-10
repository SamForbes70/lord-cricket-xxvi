/** Checks that the local acceptance runner has a non-executing plan and rejects unknown options. */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
describe("owner acceptance command plan", () => {
  it("retains the real failed exit code and runs no later suite after installation fails", () => {
    const directory = mkdtempSync(join(tmpdir(), "owner-acceptance-failure-"));
    try {
      const bin = join(directory, "bin"); mkdirSync(bin);
      const windows = process.platform === "win32";
      writeFileSync(join(bin, windows ? "npm.cmd" : "npm"), windows ? "@echo off\r\nexit /b 42\r\n" : "#!/bin/sh\nexit 42\n", { mode: 0o755 });
      mkdirSync(join(directory, "packages/domain/src"), { recursive: true });
      writeFileSync(join(directory, "package-lock.json"), "{}"); writeFileSync(join(directory, "packages/domain/src/scoring-kernel.ts"), "synthetic fixture");
      const run = spawnSync(process.execPath, [resolve("scripts/owner-acceptance.mjs")], { cwd: directory, env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` }, encoding: "utf8" });
      expect(run.status).toBe(1);
      const folder = readdirSync(join(directory, "test-results"))[0]!;
      const report = JSON.parse(readFileSync(join(directory, "test-results", folder, "acceptance.json"), "utf8"));
      expect(report.status).toBe("FAIL"); expect(report.commands).toHaveLength(1);
      expect(report.commands[0]).toMatchObject({ name: "installation", status: "FAIL", exitCode: 42 });
      expect(report.ownerPcGate).toBe("NOT_ESTABLISHED");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("includes both-browser career, match, research and observation gates without opening a profile", () => {
    const plan = JSON.parse(execFileSync(process.execPath, ["scripts/owner-acceptance.mjs", "--plan", "--owner-pc"], { encoding: "utf8" }));
    expect(plan.steps.map((s: { name: string }) => s.name)).toEqual(expect.arrayContaining(["installation", "unit", "match-ui", "career", "research-browser", "performance-observations"]));
    expect(plan.steps.find((s: { name: string }) => s.name === "match-ui").timeoutMs).toBe(1_800_000);
    expect(plan.externalUploads).toBe(false); expect(plan.existingBrowserProfilesOpened).toBe(false);
  });
  it("rejects unknown or duplicate flags before running commands", () => {
    for (const args of [["--unknown"], ["--plan", "--plan"]]) expect(spawnSync(process.execPath, ["scripts/owner-acceptance.mjs", ...args]).status).not.toBe(0);
  });
});
