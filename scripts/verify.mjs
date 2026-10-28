import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { vitestEvidence } from "./acceptance-evidence.mjs";
const directory = process.env.LCXXVI_VERIFY_DIR ?? "docs/verification";
mkdirSync(directory, { recursive: true });
const gates = [
  ["installation", ["ci"]],
  ["schemas", ["run", "schemas:check"]],
  ["build", ["run", "build"]],
  ["typecheck", ["run", "typecheck"]],
  ["lint", ["run", "lint"]],
  ["fixtures", ["run", "fixtures:audit"]],
  ["scorer", ["run", "fixtures:engine"]],
  ["vectors", ["run", "vectors:check"]],
  ["probability-vectors", ["run", "probability:check"]],
  ["generator-vectors", ["run", "generator:check"]],
  ["unit", ["test", "--", "--maxWorkers=2", "--reporter=default", "--reporter=json", `--outputFile=${directory}/unit-results.json`]],
  ["smoke", ["run", "smoke"]],
];
const results = [];
let installed = false;
const offlineEvidenceMode = process.env.LCXXVI_VERIFY_OFFLINE === "1";
for (const [name, args] of gates) {
  const started = Date.now();
  if (name === "installation" && offlineEvidenceMode) {
    const previous = readFileSync(`${directory}/installation.log`, "utf8");
    if (!previous.includes("EXIT_CODE") && !previous.includes("npm error"))
      throw new Error("Offline evidence mode requires a recorded failed npm ci attempt");
    results.push({ gate: name, command: "npm ci (earlier failed attempt; see installation.log)",
      exitCode: null, status: "BLOCKED", elapsedMs: 0,
      reason: "Recorded npm ci failure; dependencies unavailable. Re-run standard verification after registry access returns." });
    console.log("installation: BLOCKED (recorded failed attempt)");
    continue;
  }
  if (name !== "installation" && !installed && !["vectors", "probability-vectors", "generator-vectors"].includes(name)) {
    const reason = "BLOCKED: npm ci did not complete; production dependencies not installed";
    writeFileSync(`${directory}/${name}.log`, reason + "\n");
    results.push({ gate: name, command: `npm ${args.join(" ")}`, exitCode: null,
      status: "BLOCKED", elapsedMs: 0, reason });
    console.log(`${name}: BLOCKED`);
    continue;
  }
  const independent = !installed && (["vectors", "probability-vectors", "generator-vectors"].includes(name));
  const executable = independent ? "python3" : "npm";
  const arguments_ = independent
    ? [name === "vectors" ? "scripts/check-determinism-vectors.py" : name === "probability-vectors" ? "scripts/reference_probability.py" : "scripts/check-generator-vectors.py"]
    : args;
  if (name === "unit") rmSync(`${directory}/unit-results.json`, { force: true });
  const result = spawnSync(executable, arguments_, {
    encoding: "utf8",
    maxBuffer: 10_000_000,
    // The full season/persistence suite outgrew the original 90-second budget.
    timeout: name === "smoke" ? 660_000 : name === "unit" ? 300_000 : 90_000,
  });
  const log =
    (result.stdout ?? "") +
    (result.stderr ?? "") +
    (result.error?.message ?? "");
  writeFileSync(`${directory}/${name}.log`, log);
  if (name === "installation") installed = result.status === 0;
  let unitEvidence = null, evidenceError = null;
  if (name === "unit" && result.status === 0) {
    try { unitEvidence = vitestEvidence(JSON.parse(readFileSync(`${directory}/unit-results.json`, "utf8")), started); }
    catch (error) { evidenceError = error.message; }
  }
  results.push({
    ...(unitEvidence ? { unitEvidence } : {}),
    ...(evidenceError ? { evidenceError } : {}),
    gate: name,
    command: `${executable} ${arguments_.join(" ")}`,
    exitCode: result.status,
    status: result.status === 0 && !evidenceError ? "PASS" : "FAIL",
    ...(result.error ? { error: result.error.message } : {}),
    elapsedMs: Date.now() - started,
  });
  console.log(`${name}: ${results.at(-1).status}`);
}
const manifest = {
  verifiedAt: new Date().toISOString(),
  node: process.version,
  npm: offlineEvidenceMode ? "10.9.2 (observed before failed installation)" :
    spawnSync("npm", ["--version"], { encoding: "utf8", timeout: 5_000 }).stdout.trim(),
  offlineEvidenceMode,
  platform: process.platform,
  architecture: process.arch,
  firefoxContentSandboxDisabled:
    process.env.MOZ_DISABLE_CONTENT_SANDBOX === "1",
  lockfileSha256: createHash("sha256")
    .update(readFileSync("package-lock.json"))
    .digest("hex"),
  schemaVersion: "1.0.0",
  scoringImplemented: true,
  randomServiceImplemented: true,
  randomVersion: "SHA256_COUNTER_V1",
  stateHashVersion: "LC_CANONICAL_JSON_V1_SHA256",
  randomSamplerImplemented: true,
  samplerScope: "VERSIONED_CATEGORICAL_ONLY",
  conditionalDeliveryGeneratorImplemented: true,
  conditionalDeliveryGeneratorVerified: results.every((r) => r.status === "PASS"),
  generatorVersion: "LC_CONDITIONAL_DELIVERY_V1",
  generatorStagePackHash: "34efa3037702e44a134ea38b414eab3e97c6f79f10b3e5458bc2ab05412e5d7a",
  modelStatus: "SYNTHETIC_ALPHA",
  probabilityVersion: "LC_INTEGER_PROBABILITY_V1",
  modelHash: "d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab",
  lutHash: "d0cb73226646dec41e482127fc745ef64213f1c71f898ed7ad8c345ce591f825",
  scoringEngine: "LC_SCORING_V1",
  matchEngineImplemented: false,
  milestone: "M0_PARTIAL",
  nextPass: "Complete seeded T20 orchestration, only after all Pass 06 mandatory gates pass",
  gates: results,
};
writeFileSync(
  `${directory}/results.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
process.exitCode = results.every((r) => r.status === "PASS") ? 0 : 1;
