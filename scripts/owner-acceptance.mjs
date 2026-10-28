/** Collects local acceptance evidence without uploading files or opening an existing browser profile. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { arch, availableParallelism, cpus, hostname, platform, release, totalmem } from "node:os";
import { playwrightEvidence, vitestEvidence, npmInvocation } from "./acceptance-evidence.mjs";

const flags = new Set(process.argv.slice(2));
if ([...flags].some(flag => !["--plan", "--skip-install", "--owner-pc"].includes(flag)) || flags.size !== process.argv.slice(2).length) throw new Error("UNKNOWN_OR_DUPLICATE_ACCEPTANCE_ARGUMENT");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const directory = `test-results/owner-acceptance-${stamp}-${process.pid}`;
const steps = [
  ...flags.has("--skip-install") ? [] : [{ name: "installation", args: ["ci"] }],
  { name: "browser-installation", args: ["exec", "--", "playwright", "install", "chromium", "firefox"] },
  ...["schemas:check", "build", "typecheck", "lint", "fixtures:engine"].map(name => ({ name: name.replace(":", "-"), args: ["run", name] })),
  { name: "frozen-world", node: true, args: ["scripts/verify-world.mjs"] },
  { name: "unit", args: ["test", "--", "--maxWorkers=2", "--reporter=default", "--reporter=json", `--outputFile=${directory}/unit.json`], report: "unit.json" },
  { name: "match-ui", args: ["exec", "--", "playwright", "test", "--config=playwright.ui.config.ts", "--reporter=list,json", `--output=${directory}/ui`, "--trace=retain-on-failure"], report: "match-ui.json" },
  { name: "career", args: ["exec", "--", "playwright", "test", "--config=playwright.m6g.portable.config.ts", "--reporter=list,json", `--output=${directory}/career`, "--trace=retain-on-failure"], report: "career.json" },
  { name: "research-browser-build", args: ["exec", "--", "vite", "build", "--config=vite.m7k.config.ts"] },
  { name: "research-browser", args: ["exec", "--", "playwright", "test", "--config=playwright.m7k.config.ts", "--reporter=list,json", `--output=${directory}/research`, "--trace=retain-on-failure"], report: "research-browser.json" },
  { name: "performance-build", args: ["exec", "--", "vite", "build", "--config=vite.acceptance.config.ts"] },
  { name: "performance-observations", args: ["exec", "--", "playwright", "test", "--config=playwright.acceptance.config.ts", "--reporter=list,json", `--output=${directory}/performance`, "--trace=retain-on-failure"], report: "performance-observations.json" },
];
if (flags.has("--plan")) {
  console.log(JSON.stringify({ version: "LC_OWNER_ACCEPTANCE_PLAN_V1", declaredOwnerPc: flags.has("--owner-pc"), steps, externalUploads: false, existingBrowserProfilesOpened: false }, null, 2));
} else {
  mkdirSync("test-results", { recursive: true });
  mkdirSync(directory, { recursive: false });
  const git = args => spawnSync("git", args, { encoding: "utf8", timeout: 10000 });
  const revision = git(["rev-parse", "HEAD"]), changes = git(["status", "--porcelain"]);
  const npmVersionInvocation = npmInvocation(["--version"]);
  const npmVersion = spawnSync(npmVersionInvocation.executable, npmVersionInvocation.args, { encoding: "utf8", timeout: 10000 });
  const report = { version: "LC_OWNER_ACCEPTANCE_EVIDENCE_V1", startedAtUtc: new Date().toISOString(), directory,
    declaredOwnerPc: flags.has("--owner-pc"), hostedCi: process.env.GITHUB_ACTIONS === "true",
    host: { platform: platform(), release: release(), arch: arch(), logicalCpus: cpus().length, availableParallelism: availableParallelism(), cpuModel: cpus()[0]?.model ?? null, totalMemoryBytes: totalmem(), fingerprint: createHash("sha256").update(hostname()).digest("hex") },
    source: { commit: revision.status === 0 ? revision.stdout.trim() : null, dirty: changes.status === 0 ? changes.stdout.trim() !== "" : null,
      lockfileSha256: createHash("sha256").update(readFileSync("package-lock.json")).digest("hex"),
      scoringKernelSha256: createHash("sha256").update(readFileSync("packages/domain/src/scoring-kernel.ts")).digest("hex") },
    browserOverrides: { chromiumExecutableOverridePresent: Boolean(process.env.LCXXVI_CHROMIUM_EXECUTABLE), firefoxContentSandboxDisabled: process.env.MOZ_DISABLE_CONTENT_SANDBOX === "1" },
    node: process.version, npm: npmVersion.status === 0 ? npmVersion.stdout.trim() : null, commands: [], status: "RUNNING", ownerPcGate: "NOT_ESTABLISHED", referenceHardwarePerformance: "NOT_ACCEPTED_INCOMPLETE_BUDGET_COVERAGE", humanChecklist: "EXISTING_OWNER_REPORT_RETAINED_NO_NEW_OBSERVATIONS_INFERRED" };
  const save = () => writeFileSync(join(directory, "acceptance.json"), JSON.stringify(report, null, 2) + "\n");
  save();
  for (const step of steps) {
    const started = Date.now(), invocation = step.node ? { executable: process.execPath, args: step.args } : npmInvocation(step.args);
    console.log(`${step.name}: running`);
    const result = spawnSync(invocation.executable, invocation.args, { encoding: "utf8", timeout: 900000, maxBuffer: 64000000,
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: join(process.cwd(), directory, step.report ?? "unused.json"),
        LCXXVI_UI_EVIDENCE_DIR: join(process.cwd(), directory, "ui-images"), LCXXVI_ACCEPTANCE_DIR: join(process.cwd(), directory) } });
    const log = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`;
    const logPath = join(directory, `${step.name}.log`); writeFileSync(logPath, log);
    let evidence = null, evidenceError = null;
    if (step.report && result.status === 0) {
      try {
        const payload = JSON.parse(readFileSync(join(directory, step.report), "utf8"));
        evidence = step.name === "unit" ? vitestEvidence(payload, started) : playwrightEvidence(payload);
      } catch (error) { evidenceError = error.message; }
    }
    const status = result.error?.code === "ETIMEDOUT" ? "BLOCKED" : result.status === 0 && !evidenceError ? "PASS" : "FAIL";
    report.commands.push({ name: step.name, executable: invocation.executable, args: invocation.args, startedAtUtc: new Date(started).toISOString(), elapsedMs: Date.now() - started, exitCode: result.status, signal: result.signal, status, evidence, evidenceError, log: logPath, sha256: createHash("sha256").update(log).digest("hex") });
    save(); console.log(`${step.name}: ${status}`);
    if (status !== "PASS") { report.status = status; process.exitCode = 1; break; }
  }
  const completedRevision = git(["rev-parse", "HEAD"]), completedChanges = git(["status", "--porcelain"]);
  report.source.completedCommit = completedRevision.status === 0 ? completedRevision.stdout.trim() : null;
  report.source.completedDirty = completedChanges.status === 0 ? completedChanges.stdout.trim() !== "" : null;
  report.source.frozenInputsUnchanged = report.source.lockfileSha256 === createHash("sha256").update(readFileSync("package-lock.json")).digest("hex") && report.source.scoringKernelSha256 === createHash("sha256").update(readFileSync("packages/domain/src/scoring-kernel.ts")).digest("hex");
  if (report.status === "RUNNING") report.status = "PASS";
  if (report.status === "PASS" && report.declaredOwnerPc && report.host.platform === "win32" && !report.hostedCi && report.source.commit && report.source.dirty === false && report.source.completedDirty === false && report.source.completedCommit === report.source.commit && report.source.frozenInputsUnchanged) report.ownerPcGate = "PASS_AT_DECLARED_OWNER_LOCATION_REQUIRES_REPORT_REVIEW";
  report.completedAtUtc = new Date().toISOString(); save();
  console.log(`Evidence: ${join(directory, "acceptance.json")}`);
}
