# Lord Cricket XXVI | M7A Evidence and Remaining Gates

Baseline: Pass 12G-R `56a908d7ccf0c6995722ccf34fab1a4996750728`.

## Findings

1. M6 has no demonstrated browser failure, because Chrome rejects origin navigation with `ERR_BLOCKED_BY_ADMINISTRATOR` before app code executes. Both inherited M6F IndexedDB and M6G management UI gates remain **BLOCKED**, not PASS. Only a different, authorised browser host can close these gates. Never bypass browser policy.
2. Current M3 formal human playthrough remains PENDING.
3. M7 was not implemented in the inherited build. It cannot be marked completed by re-running M6 core tests.
4. The current synthetic cricket model generates low T20 run totals: in 64 seeded matches, 128 innings averaged 84.875 runs, p10 64, median 84, p90 105, 7.13 wickets/innings. This is descriptive sample output, NOT a claim about reference cricket distributions. It is a substantial quality warning to assess with approved real data.
5. Engine/season audit scripts may take longer than a single execution timebox. Run suites independently or shard. A timeout is UNKNOWN, not a PASS or evidence of a functional bug. The complete 507-test set was subsequently run in two shards: 497 + 10, all PASS.

## Implemented in M7A

- Canonical event-driven T20 Manhattan, cumulative worm, player partnerships and eight-sector summaries. Sector data is only output where the engine records direction, never fabricated distance/impact coordinates. Optional final-scorecard reconciliation throws on divergence. Final T20 UI displays tables and lightweight Manhattan/sector bars.
- `LC_T20_TACTICAL_CAPTAIN_V1`: stateless heuristic policy on public score/innings, legal bowler candidate ratings/availability, and observed fatigue, with deterministic tie-breaking, required chase run rate, conservative wicket preservation and bowler effort/length choices. Transparent and not empirically calibrated.
- A separate `runTacticalT20` engine adapter in apps/batch that executes only accepted `LC_T20_MATCH_V1` commands and preserves the frozen Pass 12D `LC_FIXTURE_CAPTAIN_V1` policy and golden outcome corpus. It is **not yet the opponent controller in the player-facing exhibition/career UI**.
- Seeded repeatability, legal-command selection, public-view allow-list and completion tests.
- Synthetic diagnostics and runtime timings from Node, marked descriptive with exact environment. Does not claim reference-hardware/browser p95.

## M7 acceptance remaining

- Approved ball-by-ball source and legal-permission review, format-specific train/validation/test split by match/time, immutable model version and held-out calibration report. Must not overwrite `synthetic-alpha-01` coefficients or rewrite existing saves silently.
- Wide scenario grid with paired-seed tactical ablations, exploitation search, legal command tests, resource management and full three-format match coverage.
- Player-facing AI opposition with opt-in/out and clear delegation semantics, persisted in command history; tests in real browser.
- Empirical T20/ODI/red-ball quality evidence, minimum volume and confidence intervals, early endings/chases handled correctly.
- Runtime tests on documented four-core/8GB reference laptop in supported browser, full-season timing, memory, worker responsiveness, save/load p95; current Linux host is NOT that target.
- Existing M6F/M6G browser and M3 human gates close before release.

## Policy

SYNTHETIC_ALPHA remains in force. No verified DLS. No real-player data claim. No inaccurate declaration of M6 or M7 PASS.
