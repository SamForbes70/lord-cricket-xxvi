# Reference-hardware performance budgets

The owner confirmed Budgets 1 to 7 on 12 November 2026 (Australia/Brisbane). They gate V01-028, which stays `BLOCKED_EXTERNAL` until Budget 8's numeric threshold is confirmed by the owner and all eight budgets are measured on a recorded qualifying host.

## Reference hardware

A four-core, 8 GB laptop running a supported browser. The repository defines nothing more specific: no CPU model, operating system or browser version. Record the exact host (CPU, memory, operating system, browser name and version) with every measurement. A host that does not meet four cores and 8 GB does not qualify.

## Confirmed budgets and automated harness

`tests/acceptance/performance.spec.ts` and `tests/acceptance/memory-probe.ts` measure all eight metrics automatically across Chromium and Firefox (`npx playwright test --config playwright.acceptance.config.ts`):

| # | Budget | Threshold | Measured by |
| --- | --- | --- | --- |
| 1 | Command acknowledgement, p95 | under 100 ms | 30 samples per browser; click dispatch to committed revision rendered |
| 2 | Long tasks overlapping measured commands, maximum | 50 ms | Long Tasks API; Firefox can omit it, which the report records |
| 3 | T20 engine-only match, p95 | 1000 ms | 20 matches in a worker |
| 4 | Five-day match, p95 | 5000 ms | 20 matches in a worker |
| 5 | 56-match league, elapsed | 60,000 ms | Full default-world league in a worker |
| 6 | IndexedDB save, p95 | 500 ms | 20 commits of a completed 56-fixture season |
| 7 | Active-game load, p95 | 2000 ms | 20 validated loads of the completed season |
| 8 | Total application memory, including workers and native allocations | pending owner confirmation (`LCXXVI_MEMORY_BUDGET_MB`) | OS browser process-tree PSS/RSS (Linux `/proc/<pid>/smaps_rollup` + `ps`) or PrivatePageCount/WorkingSetSize (Windows `Get-CimInstance Win32_Process`) plus `measureUserAgentSpecificMemory` and main-thread JS heap |

## Open decision: the memory budget threshold

Budget 8 is now measured end-to-end across all active browser, renderer, Web Worker and native processes (`totalApplicationMemory` in `<browser>-performance.json` and `<browser>-engine-performance.json`), while its pass/fail numeric threshold remains unconfirmed until the owner sets it (for example via `LCXXVI_MEMORY_BUDGET_MB=<megabytes>`). When `LCXXVI_MEMORY_BUDGET_MB` is unset, the harness records `thresholdConfirmedByOwner: false` and `withinConfirmedThreshold: null` without guessing a threshold.

## Evidence rules

- Hosted CI, cloud and Linux-container runs are observations only and never count as reference acceptance.
- Each measurement must name the host and the tested revision.
- Passing all budgets on a qualifying host does not by itself accept V01-028; the owner accepts it.
