# M7 scenario quality harness

The original design's sections 8 and 22 require reproducible model-quality scenarios before release claims.
This developer tool extends the single-setup diagnostic into a bounded team/ground grid.
It runs the accepted engine and existing captain policies, with no coefficient, save or gameplay-model changes.

## Implemented behaviour

`npm run m7:scenarios` runs both baseline and tactical captains for each declared scenario.
The grid uses four sorted adjacent team pairings, covering all eight fictional teams.
Each pairing runs at all eight grounds with the existing corpus XI selection algorithm.
That algorithm retains a keeper and six bowling-capable players before filling each XI.
The default two seeds per cell produce 64 scenario pairs and 128 policy runs.
Both sides use the selected captain policy; this is not a single-side human-versus-AI experiment.

The first seed in each cell repeats under both policies, adding 64 repeat runs.
Each repeat must match every report field, including the final event and scorecard hashes.
The protocol sidecar records seeds, selected XIs, grounds and model/rule/world hashes before simulation.
The runner rejects invalid seed counts, duplicate arguments and unknown options.
The supported seed count is one through eight per cell.

The observer records only accepted delivery events and the plans active when their command began.
It reconciles delivery-derived runs, wickets and legal balls with the authoritative scorecard.
It also records command counts, phase counters and delivery-plan exposure histograms.
The histograms cover both innings and identify aggression, batting intent, bowling length and effort.
They do not reconstruct conditional probability tables or measured ball trajectories.

## Reporting and comparisons

First innings supply the reported score distributions, dot fractions, boundary fractions and wicket means.
Successful chase endings remain separate from all-out and allocation-end outcomes.
Summaries include each ground, each pairing and the whole declared cohort.
Each paired difference requires matching seed, teams, ground and first batting team.
Missing or duplicate policy runs fail rather than silently bias the comparison.

The two policies share an initial seed and setup, not guaranteed identical later draw addresses or match states.
Comparisons describe whole captain policies inside this simulator, rather than individual causal tactical effects.
Four pairings do not cover every opponent, every XI or every skill/pitch combination.
This small grid cannot satisfy the original design's empirical or 10,000-match release requirements.
No real reference cohort is read, fitted or relabelled as untouched validation.

## Running the tool

Prerequisites: Node >=22.12, installed dependencies and built workspace packages.
The command runs locally without a backend or source-data download.
Expected duration for the default grid is approximately one minute on the measured cloud host.
Other hardware can take longer; this is not a reference-laptop performance budget.
If the command fails, retain its error and report the failing invocation through the project issue tracker.

1. Run `npm run build` from the repository root.
2. Run `npm run m7:scenarios -- --seeds-per-cell=2 --out=scenarios.json`.
3. Inspect `scenarios.json.protocol.json` for the declared cohort and source hashes.
4. Inspect `scenarios.json` for policy, ground, pairing and repeatability results.

On Windows PowerShell, use `npm.cmd` if script execution policy prevents `npm`.
The runner's command exits nonzero for failed reconciliation or divergent repeats.
Output without `--out` goes to standard output; the protocol sidecar requires an output path.
Choose a new output filename to preserve an earlier result.

## Fresh execution evidence

[verification-scenario-quality/](verification-scenario-quality/) retains the full default grid, protocol and gate logs.
The grid contains 64 scenario pairs, 128 policy runs and 64 successful repeats.

| First-innings metric | Baseline captain | Tactical captains |
| --- | ---: | ---: |
| Matches | 64 | 64 |
| Mean runs | 84.7031 | 84.7656 |
| Mean wickets | 8.1250 | 8.3125 |
| P10 / P50 / P90 | 66 / 84 / 103 | 65 / 83 / 107 |
| Dot-attempt fraction | 65.7359% | 66.1303% |
| Boundary-attempt fraction | 8.4696% | 8.5505% |
| Successful chases | 28 | 31 |

The paired mean first-innings difference is +0.0625 runs for tactical minus baseline.
That small observed difference does not establish statistical equivalence or independently validated tactical quality.
Per-ground baseline means range from 78.625 to 95.000 runs in this grid.
Low scoring therefore recurs beyond the earlier single setup, including under both existing policies.
It does not isolate a faulty coefficient, rating transformation or generator stage.

The earlier 89.15-run diagnostic used different XIs, seeds and a narrower setup.
Comparing these means cannot establish a regression or improvement in the unchanged gameplay model.
The useful next investigation is a separate feature/probability trace with declared interventions.
Changing coefficients merely to hit a desired total remains outside this tool.

## Validation and preserved boundaries

Four new tests cover deterministic grid construction, bounds, pairing integrity and observer transparency.
Both policy observers match their existing authoritative runners' event and scorecard hashes.
The full TypeScript suite now contains 542 tests across 31 files.
Expected-count metadata is updated without excluding existing tests.
Existing schemas, build, typecheck, lint, scoring and deterministic-vector gates remain required.
The six Python summary tests from the preceding diagnostic also remain green.

The batch module and CLI are separate from the browser worker.
No files under `packages/`, no probability coefficients and no dependency versions change.
The simulation worker retains its original SHA-256, recorded with the fresh evidence.
This implementation is stacked on PR #4; neither PR #3 nor PR #4 is merged by this work.
