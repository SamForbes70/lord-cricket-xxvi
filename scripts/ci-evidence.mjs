/** Retains structured CI evidence in job logs and summaries when artifact storage is unavailable. */
import { readFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";

export function collectCiEvidence({ root, kind, startedAfterMs, commit, upstreamStatus = "success" }) {
  if (!["linux", "windows"].includes(kind) || !Number.isFinite(startedAfterMs) || startedAfterMs <= 0 || !commit) throw new Error("CI_EVIDENCE_ARGUMENT");
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
  const observations = [], missing = [];
  const base = kind === "windows" ? directory : "test-results/acceptance-observations";
  for (const name of ["chromium-performance.json", "chromium-engine-performance.json", "firefox-performance.json", "firefox-engine-performance.json"]) {
    try { observations.push(fresh(`${base}/${name}`)); } catch (error) { missing.push({ path: `${base}/${name}`, reason: error.message }); }
  }
  const commands = kind === "windows" ? primary.value.commands : primary.value.gates;
  const allCommandsPassed = Array.isArray(commands) && commands.length > 0 && commands.every(command => command.status === "PASS" && command.exitCode === 0);
  return { version: "LC_CI_EVIDENCE_V1", kind, commit, upstreamStatus,
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const match = /^--kind=(linux|windows)$/.exec(process.argv[2] ?? "");
  if (!match || process.argv.length !== 3) throw new Error("CI_EVIDENCE_ARGUMENT");
  const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (revision.status !== 0) throw new Error("CI_EVIDENCE_GIT");
  const evidence = collectCiEvidence({ root: process.cwd(), kind: match[1], startedAfterMs: Number(process.env.LCXXVI_CI_STARTED_AT),
    commit: revision.stdout.trim(), upstreamStatus: process.env.LCXXVI_UPSTREAM_STATUS ?? "failure" });
  publishCiEvidence(evidence, process.env.GITHUB_STEP_SUMMARY);
  if (evidence.status !== "PASS") process.exitCode = 1;
}
