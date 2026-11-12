# Reference-hardware performance budgets

The owner confirmed these budgets on 12 November 2026 (Australia/Brisbane). They gate V01-028, which stays `BLOCKED_EXTERNAL` until they are measured on a recorded qualifying host.

## Reference hardware

A four-core, 8 GB laptop running a supported browser. The repository defines nothing more specific: no CPU model, operating system or browser version. Record the exact host (CPU, memory, operating system, browser name and version) with every measurement. A host that does not meet four cores and 8 GB does not qualify.

## Confirmed budgets

The values are the ones `tests/acceptance/performance.spec.ts` already reports as proposed. Confirming them changes no code; that spec still labels them "proposed" in its output.

| # | Budget | Threshold | Measured by |
| --- | --- | --- | --- |
| 1 | Command acknowledgement, p95 | under 100 ms | 30 samples per browser; click dispatch to committed revision rendered |
| 2 | Long tasks overlapping measured commands, maximum | 50 ms | Long Tasks API; Firefox can omit it, which the report records |
| 3 | T20 engine-only match, p95 | 1000 ms | 20 matches in a worker |
| 4 | Five-day match, p95 | 5000 ms | 20 matches in a worker |
| 5 | 56-match league, elapsed | 60,000 ms | Full default-world league in a worker |
| 6 | IndexedDB save, p95 | 500 ms | 20 commits of a completed 56-fixture season |
| 7 | Active-game load, p95 | 2000 ms | 20 validated loads of the completed season |
| 8 | Total application memory, including workers and native allocations | not set | Not yet measured |

## Open decision: the memory budget

Budget 8 has no threshold anywhere in the repository, so none is confirmed here. The collector's main-thread JavaScript heap figure excludes workers and native allocations, so it cannot stand in for it. The owner needs to set a figure, and a way to measure total memory (including workers and native allocations) has to be chosen, before V01-028 can be accepted.

## Evidence rules

- Hosted CI, cloud and Linux-container runs are observations only and never count as reference acceptance.
- Each measurement must name the host and the tested revision.
- Passing all budgets on a qualifying host does not by itself accept V01-028; the owner accepts it.
