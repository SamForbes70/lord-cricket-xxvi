# Lord Cricket XXVI | Pass 13 / M7A

## Acceptance result

**M7A IMPLEMENTATION AND NON-BROWSER VERIFICATION PASS; M7 MILESTONE NOT YET ACCEPTED.**

M6F and M6G browser/IndexedDB gates remain BLOCKED by administrator policy, not passed. M3 human acceptance pending. M7 model calibration, in-app opponent integration and reference-browser performance remain incomplete.

## Baseline and root cause of apparent stall

- Recovered exact Pass 12G-R commit `56a908d7ccf0c6995722ccf34fab1a4996750728` from the provided Git bundle.
- `npm ci --offline` from pinned cache, source build PASS.
- Re-ran two M6G Chromium tests against local production preview, both `net::ERR_BLOCKED_BY_ADMINISTRATOR` at `page.goto('http://127.0.0.1:4173/')` before app code.
- Re-ran inherited M6F IndexedDB browser test, `net::ERR_BLOCKED_BY_ADMINISTRATOR` at `page.goto('https://lcxxvi.test/')` before app code.
- The execution host is restricted. Cannot claim to have provisioned a permissive host or passed browser tests. Provided a portable Chromium/Firefox config and steps to rerun externally on an authorised host.
- A 56-match complete management acceptance attempt exceeded a 120s command timebox without reporting a failure. This attempt is TIMEOUT/UNKNOWN, not a newly verified PASS; the inherited Pass 12G-R report records its original headless PASS. M7 changes leave its accepted match/season kernels unchanged.
- Initial combined unit run was resource-constrained; subsequent complete two-shard run passed all tests.

## Implementation

1. Added pure deterministic `LC_T20_TACTICAL_CAPTAIN_V1` policy with public-only view, observed chase/wickets/remaining balls, eligible bowler rating/fatigue/quota, phase-sensitive aggression/effort/length and deterministic tie-breaking. No hidden seed or future draw access.
2. Added a batch-only autonomous tactical engine adapter using the **existing** `LC_T20_MATCH_V1` for all deliveries and only its legal commands. Frozen Pass 12D captain policy and result hashes unchanged. Not yet the opponent in the player-facing match UI.
3. Added event-derived T20 analytics for partnerships, over summaries, cumulative worm and eight shot sectors, checking optional final scorecard reconciliation and not creating fictional tracking positions. Wired completed-match analytics to React match view.
4. Added a repeatable synthetic simulation-quality and timing diagnostic and an explicit versioned calibration plan.
5. Added portable Playwright M6G config for authorised Chromium/Firefox runners, browser-gate instructions and capability matrix updates.

## Verified gates

| Gate | Result |
| --- | --- |
| Frozen source identification | PASS |
| Offline frozen lockfile installation | PASS |
| 163 generated schemas | PASS |
| Production build | PASS |
| Type check | PASS |
| ESLint and all seven dependency/ambient boundaries | PASS |
| Unit tests (all, two independent shards) | **PASS 507/507 over 24 files** |
| New M7 AI/analytics unit and engine integration | PASS 7/7 (included above) |
| M6F real IndexedDB Chromium | BLOCKED by `ERR_BLOCKED_BY_ADMINISTRATOR` |
| M6G management Chromium, 2 cases | BLOCKED by `ERR_BLOCKED_BY_ADMINISTRATOR` |
| M6 complete headless re-audit in this host | TIMEOUT at 120 seconds; prior Pass 12G-R report claims PASS |
| Statistical empirical calibration | NOT STARTED (no approved held-out cricket dataset) |
| Browser memory/latency/reference machine budget | NOT RUN |
| Formal M3 human playthrough | PENDING |

## Statistical diagnostics: frozen SYNTHETIC_ALPHA

From 64 independent fixed-seed T20 matches (128 innings) executed by `scripts/audit-m7-quality.ts`:

| Measurement | Observed |
| --- | ---: |
| Mean runs per innings | 84.875 |
| Median innings runs | 84 |
| p10 / p90 innings runs | 64 / 105 |
| Mean wickets per innings | 7.1328125 |
| Dot fraction of attempts | 0.6395747 |
| Boundary fraction of attempts | 0.0886899 |
| Illegal fraction of attempts | 0.0156676 |
| Legal deliveries observed | 14,073 |
| Event entries observed | 20,573 |

**These innings totals warrant calibration investigation; they are not empirical validation or an approved target comparison.** Seed 0 was independently re-run with identical final event chain hash. No model coefficients were changed.

## Performance observations (not release acceptance)

- Test execution: Node v22.16.0 on AMD EPYC 9V74 host, 5 logical CPUs exposed, 6.25 GB memory, no browser.
- `runFixtureT20` sample: p50 **403.70 ms**, p95 **479.93 ms**, maximum **607.82 ms** across 64 matches.
- Node process RSS after sample **162,205,696 bytes**.
- These timings cannot establish the design's four-core/8GB **browser** performance budgets, save/load timing or 56-match season performance.
- Production build still flags some JavaScript chunks >500 kB; code splitting remains a potential improvement.

## Source compatibility

Changed only additive AI, projection, batch adapter, web presentation, test, scripts, package dependency metadata and documentation. Frozen scoring, RNG, probability coefficients, generator, T20/ODI/red-ball match engines, Pass 12A-F scheduler/season/persistence primitives and 163 schema definitions remain unchanged. No save migration or model version bump was needed because accepted simulation semantics have not changed.

## Next pass: M7B

Obtain an approved reference ball-by-ball dataset and assess rights; implement versioned empirical calibration with held-out match/time split. Wire tactical captain as optional opponent in the human match worker with authority, actor logs, save/resume and Playwright proof. Extend analytics tests, paired-seed exploitation tests, format coverage and benchmark on reference browser hardware. Rerun all browser gates on an authorised non-blocked execution host and complete human playthrough before M7/M8 release claims.
