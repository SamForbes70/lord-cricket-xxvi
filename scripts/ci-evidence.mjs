/** Retains structured CI evidence in job logs and summaries when artifact storage is unavailable. */
import { readFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { ACCEPTANCE_SCOPES, BROWSERS, BROWSER_SUITES, SPLIT_SCOPES } from "./acceptance-scope.mjs";

const OBSERVATION_FILES = ["chromium-performance.json", "chromium-engine-performance.json", "firefox-performance.json", "firefox-engine-performance.json"];
/** The observation files one acceptance scope must produce: each browser leg writes its own browser's pair. */
export function expectedObservations(scope) {
  if (scope === "all") return OBSERVATION_FILES;
  if (scope === "core") return [];
  if (BROWSERS.includes(scope)) return OBSERVATION_FILES.filter(name => name.startsWith(`${scope}-`));
  throw new Error("CI_EVIDENCE_ARGUMENT");
}

export function collectCiEvidence({ root, kind, startedAfterMs, commit, upstreamStatus = "success", scope = "all" }) {
  if (!["linux", "windows"].includes(kind) || !Number.isFinite(startedAfterMs) || startedAfterMs <= 0 || !commit) throw new Error("CI_EVIDENCE_ARGUMENT");
  if (!ACCEPTANCE_SCOPES.includes(scope) || (kind === "linux" && scope !== "all")) throw new Error("CI_EVIDENCE_ARGUMENT");
  const fresh = relative => {
    const path = join(root, relative);
    if (statSync(path).mtimeMs < startedAfterMs) throw new Error(`CI_EVIDENCE_STALE_FILE:${relative}`);
    const bytes = readFileSync(path);
    return { path: relative, sha256: createHash("sha256").update(bytes).digest("hex"), value: JSON.parse(bytes.toString("utf8")) };
  };
  let directory = "docs/verification-pass07a";
  if (kind === "windows") {
    const names = readdirSync(join(root, "test-results"), { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.startsWith("owner-acceptance-"));
    names.sort((a, b) => statSync(join(root, "test-results", b.name)).mtimeMs - statSync(join(root, "test-results", a.name)).mtimeMs);
    if (!names.length) throw new Error("CI_EVIDENCE_MISSING_COLLECTOR");
    directory = `test-results/${names[0].name}`;
  }
  const primary = fresh(`${directory}/${kind === "windows" ? "acceptance.json" : "pass07a-results.json"}`);
  const start = Date.parse(kind === "windows" ? primary.value.startedAtUtc : primary.value.startedAtUTC);
  if (!Number.isFinite(start) || start < startedAfterMs || start > Date.now()) throw new Error("CI_EVIDENCE_STALE_RUN");
  if (kind === "windows" && primary.value.source?.commit !== commit) throw new Error("CI_EVIDENCE_COMMIT");
  // A leg's report must say which leg it is, and a full run's report must not claim to be a leg.
  if (kind === "windows" && (primary.value.scope ?? "all") !== scope) throw new Error("CI_EVIDENCE_SCOPE");
  const observations = [], missing = [];
  const base = kind === "windows" ? directory : "test-results/acceptance-observations";
  for (const name of expectedObservations(scope)) {
    try { observations.push(fresh(`${base}/${name}`)); } catch (error) { missing.push({ path: `${base}/${name}`, reason: error.message }); }
  }
  const commands = kind === "windows" ? primary.value.commands : primary.value.gates;
  const allCommandsPassed = Array.isArray(commands) && commands.length > 0 && commands.every(command => command.status === "PASS" && command.exitCode === 0);
  return { version: scope === "all" ? "LC_CI_EVIDENCE_V1" : "LC_CI_EVIDENCE_V2", kind, ...scope === "all" ? {} : { scope }, commit, upstreamStatus,
    status: upstreamStatus === "success" && primary.value.status === "PASS" && allCommandsPassed && missing.length === 0 ? "PASS" : "FAIL",
    primary, observations, missing,
    retention: "Structured results and checksums are retained in this job log and summary. Full artifacts, screenshots and traces remain best-effort uploads subject to GitHub storage quota." };
}

export function publishCiEvidence(evidence, summaryPath) {
  const json = JSON.stringify(evidence).replace(/`/g, "\\u0060");
  if (Buffer.byteLength(json) > 900_000) throw new Error("CI_EVIDENCE_SUMMARY_LIMIT");
  if (!summaryPath) throw new Error("CI_EVIDENCE_SUMMARY_PATH");
  appendFileSync(summaryPath, `## Verification evidence\n\n${evidence.retention}\n\n\`\`\`json\n${json}\n\`\`\`\n`);
  const chunks = json.match(/[\s\S]{1,8000}/g) ?? [];
  console.log(`LCXXVI_CI_EVIDENCE_BEGIN ${JSON.stringify({ chunks: chunks.length, sha256: createHash("sha256").update(json).digest("hex") })}`);
  for (const [index, chunk] of chunks.entries()) console.log(`LCXXVI_CI_EVIDENCE_CHUNK ${index + 1}/${chunks.length} ${JSON.stringify(chunk)}`);
  console.log("LCXXVI_CI_EVIDENCE_END");
}

/** A compact record of one Windows leg, passed to the aggregating job as a job output (artifacts are best effort). */
export function legSummary(evidence) {
  if (!SPLIT_SCOPES.includes(evidence.scope)) throw new Error("CI_EVIDENCE_ARGUMENT");
  const commands = Array.isArray(evidence.primary.value.commands) ? evidence.primary.value.commands : [];
  return { version: "LC_CI_LEG_SUMMARY_V1", scope: evidence.scope, commit: evidence.commit, status: evidence.status, upstreamStatus: evidence.upstreamStatus,
    primary: { path: evidence.primary.path, sha256: evidence.primary.sha256 },
    evidenceSha256: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
    commands: commands.map(command => ({ name: command.name, status: command.status, exitCode: command.exitCode, elapsedMs: command.elapsedMs ?? null, passed: command.evidence?.passed ?? null })),
    observations: evidence.observations.map(observation => observation.path.split("/").pop()), missing: evidence.missing.map(entry => entry.path) };
}

/**
 * Checks that the split Windows legs together are the whole acceptance run: every leg present, passed and from this
 * commit; each leg ran exactly its planned steps; together they cover every step of the full plan; each browser leg wrote
 * its own observations; and both browsers passed the same number of tests in every browser suite, so neither leg ran a
 * subset (or both browsers).
 */
export function combineCiEvidence({ legs, legsResult, commit, plans }) {
  if (!commit || !plans || !Array.isArray(plans.all)) throw new Error("CI_EVIDENCE_ARGUMENT");
  const problems = [], summaries = {};
  if (legsResult !== "success") problems.push(`legs result ${legsResult}`);
  for (const scope of SPLIT_SCOPES) {
    let leg = null;
    try { leg = JSON.parse(legs?.[scope] ?? ""); } catch { problems.push(`${scope}: no leg evidence`); continue; }
    summaries[scope] = leg;
    if (leg.version !== "LC_CI_LEG_SUMMARY_V1" || leg.scope !== scope) problems.push(`${scope}: wrong leg record`);
    if (leg.commit !== commit) problems.push(`${scope}: commit ${leg.commit}`);
    if (leg.status !== "PASS" || leg.upstreamStatus !== "success") problems.push(`${scope}: status ${leg.status}, upstream ${leg.upstreamStatus}`);
    const names = (leg.commands ?? []).map(command => command.name);
    if (JSON.stringify(names) !== JSON.stringify(plans[scope])) problems.push(`${scope}: ran [${names}] but planned [${plans[scope]}]`);
    if ((leg.commands ?? []).some(command => command.status !== "PASS" || command.exitCode !== 0)) problems.push(`${scope}: a command did not pass`);
    const observations = [...leg.observations ?? []].sort(), wanted = [...expectedObservations(scope)].sort();
    if (JSON.stringify(observations) !== JSON.stringify(wanted) || (leg.missing ?? []).length) problems.push(`${scope}: observations [${observations}]`);
  }
  const covered = new Set(Object.values(summaries).flatMap(leg => (leg.commands ?? []).map(command => command.name)));
  for (const name of plans.all) if (!covered.has(name)) problems.push(`no leg ran ${name}`);
  const browserCounts = {};
  for (const name of BROWSER_SUITES) {
    const counts = BROWSERS.map(browser => summaries[browser]?.commands?.find(command => command.name === name)?.passed ?? null);
    browserCounts[name] = Object.fromEntries(BROWSERS.map((browser, index) => [browser, counts[index]]));
    if (!plans.all.includes(name)) continue;
    if (counts.some(count => !Number.isSafeInteger(count) || count < 1) || new Set(counts).size !== 1) problems.push(`${name}: browser test counts ${JSON.stringify(browserCounts[name])}`);
  }
  return { version: "LC_CI_EVIDENCE_AGGREGATE_V1", kind: "windows", commit, legsResult, status: problems.length ? "FAIL" : "PASS", problems, browserCounts, legs: summaries,
    retention: "Each leg's structured results and checksums are retained in that leg's job log and summary; this aggregate retains the leg records it checked. Full artifacts, screenshots and traces remain best-effort uploads subject to GitHub storage quota." };
}

function planStepNames(scope) {
  const plan = spawnSync(process.execPath, [fileURLToPath(new URL("./owner-acceptance.mjs", import.meta.url)), "--plan", "--skip-install", `--scope=${scope}`], { encoding: "utf8" });
  if (plan.status !== 0) throw new Error("CI_EVIDENCE_PLAN");
  return JSON.parse(plan.stdout).steps.map(step => step.name);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // --kind=linux, --kind=windows (one full run), --kind=windows --scope=<leg> (one split leg), or --combine (the legs).
  const args = process.argv.slice(2);
  const match = /^--kind=(linux|windows)$/.exec(args[0] ?? ""), scopeMatch = /^--scope=(core|chromium|firefox)$/.exec(args[1] ?? "");
  const combine = args.length === 1 && args[0] === "--combine";
  if (!combine && (!match || !(args.length === 1 || (args.length === 2 && scopeMatch && match[1] === "windows")))) throw new Error("CI_EVIDENCE_ARGUMENT");
  const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (revision.status !== 0) throw new Error("CI_EVIDENCE_GIT");
  if (combine) {
    const plans = Object.fromEntries(["all", ...SPLIT_SCOPES].map(scope => [scope, planStepNames(scope)]));
    // The workflow passes toJSON(needs.windows-acceptance.outputs): one leg-<scope> output per leg.
    const outputs = JSON.parse(process.env.LCXXVI_LEG_OUTPUTS || "{}");
    const legs = Object.fromEntries(SPLIT_SCOPES.map(scope => [scope, outputs[`leg-${scope}`]]));
    const evidence = combineCiEvidence({ legs, legsResult: process.env.LCXXVI_LEGS_RESULT ?? "failure", commit: revision.stdout.trim(), plans });
    for (const problem of evidence.problems) console.error(`windows acceptance aggregate: ${problem}`);
    publishCiEvidence(evidence, process.env.GITHUB_STEP_SUMMARY);
    if (evidence.status !== "PASS") process.exitCode = 1;
  } else {
    const evidence = collectCiEvidence({ root: process.cwd(), kind: match[1], startedAfterMs: Number(process.env.LCXXVI_CI_STARTED_AT),
      commit: revision.stdout.trim(), upstreamStatus: process.env.LCXXVI_UPSTREAM_STATUS ?? "failure", scope: scopeMatch?.[1] ?? "all" });
    publishCiEvidence(evidence, process.env.GITHUB_STEP_SUMMARY);
    if (scopeMatch) {
      if (!process.env.GITHUB_OUTPUT) throw new Error("CI_EVIDENCE_OUTPUT_PATH");
      appendFileSync(process.env.GITHUB_OUTPUT, `leg-${scopeMatch[1]}=${JSON.stringify(legSummary(evidence))}\n`);
    }
    if (evidence.status !== "PASS") process.exitCode = 1;
  }
}
