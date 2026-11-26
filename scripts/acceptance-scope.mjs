/**
 * Splits the owner acceptance plan into legs that hosted Windows CI runs in parallel
 * (docs/verification-pass07a/WINDOWS_CI_SPLIT_2026-11-26.md). The default scope, "all", is the unchanged single run used
 * on the owner's PC. A split scope never adds, drops or loosens a check: every step of "all" belongs to at least one leg,
 * the browser suites run with Playwright's own --project filter, and an unknown step stops the run until it is assigned.
 */
export const ACCEPTANCE_SCOPES = ["all", "core", "chromium", "firefox"];
export const SPLIT_SCOPES = ["core", "chromium", "firefox"];
export const BROWSERS = ["chromium", "firefox"];

/** Steps that are not browser suites: they run once, in the core leg. */
const CORE_ONLY = new Set(["schemas-check", "typecheck", "lint", "fixtures-engine", "frozen-world", "unit", "persistence-m4"]);
/** Builds that each browser leg needs before its suites can serve the game. */
const BROWSER_PREREQUISITES = new Set(["research-browser-build", "performance-build"]);
/** Playwright suites with one project per browser: each browser leg runs its own project. */
export const BROWSER_SUITES = new Set(["match-ui", "career", "research-browser", "performance-observations"]);
/** Steps every leg runs: installing dependencies, and the production build the preview servers and the EXE serve. */
const EVERY_LEG = new Set(["installation", "build"]);

export function parseAcceptanceArguments(argv) {
  const known = new Set(["--plan", "--skip-install", "--owner-pc"]);
  const flags = new Set();
  let scope = null;
  for (const argument of argv) {
    const match = /^--scope=(.*)$/.exec(argument);
    if (match) {
      if (scope !== null || !ACCEPTANCE_SCOPES.includes(match[1])) throw new Error("UNKNOWN_OR_DUPLICATE_ACCEPTANCE_ARGUMENT");
      scope = match[1];
    } else if (known.has(argument) && !flags.has(argument)) flags.add(argument);
    else throw new Error("UNKNOWN_OR_DUPLICATE_ACCEPTANCE_ARGUMENT");
  }
  scope ??= "all";
  // The owner-PC gate is established only by one complete run.
  if (scope !== "all" && flags.has("--owner-pc")) throw new Error("OWNER_PC_REQUIRES_FULL_SCOPE");
  return { flags, scope };
}

/** Returns the steps one scope runs, in the original order. */
export function scopeSteps(steps, scope) {
  if (!ACCEPTANCE_SCOPES.includes(scope)) throw new Error(`UNKNOWN_ACCEPTANCE_SCOPE:${scope}`);
  if (scope === "all") return steps;
  const browser = BROWSERS.includes(scope) ? scope : null;
  const selected = [];
  for (const step of steps) {
    if (step.name === "browser-installation") {
      if (!BROWSERS.every(name => step.args.includes(name))) throw new Error("ACCEPTANCE_BROWSER_INSTALLATION_SHAPE");
      // The core leg's persistence suite runs in Chromium only.
      const wanted = browser ?? "chromium";
      selected.push({ ...step, args: step.args.filter(arg => !BROWSERS.includes(arg) || arg === wanted) });
    } else if (EVERY_LEG.has(step.name)) selected.push(step);
    else if (CORE_ONLY.has(step.name)) { if (!browser) selected.push(step); }
    else if (BROWSER_PREREQUISITES.has(step.name)) { if (browser) selected.push(step); }
    else if (BROWSER_SUITES.has(step.name)) {
      if (!browser) continue;
      if (step.args.some(arg => arg.startsWith("--project"))) throw new Error(`ACCEPTANCE_PROJECT_ALREADY_SET:${step.name}`);
      selected.push({ ...step, args: [...step.args, `--project=${browser}`] });
    } else throw new Error(`UNASSIGNED_ACCEPTANCE_STEP:${step.name}`);
  }
  return selected;
}
