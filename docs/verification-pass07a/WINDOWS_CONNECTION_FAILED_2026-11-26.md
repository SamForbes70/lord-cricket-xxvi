# Hosted Windows `net::ERR_CONNECTION_FAILED` on the browser suite (Directive 02, item E1)

Date: 26 November 2026. Base revision: `main` at `4558fdb`. Status: **cause not proven; diagnostics added, not a fix.**

## Summary

The `windows-browser-acceptance` job sometimes fails one Chromium test with `net::ERR_CONNECTION_FAILED` on `http://127.0.0.1:4180`, the `vite preview` server that `playwright.ui.config.ts` starts. The evidence below rules out the preview server dying, being restarted or being replaced, and rules out a link with run length or memory. What is left is a single TCP connection from Chromium that failed within a few milliseconds while the server was serving other connections. Chromium's error name does not say why, and the retained traces do not keep the operating-system error. This change records that error, and the server's own life, so that the next occurrence names its cause. It does not retry, skip or otherwise hide a failure.

## Occurrences

All `verify` workflow runs listed by the REST API from 10 to 26 November 2026 (389 runs, main and pull request branches) were checked. 107 concluded `failure`, with 136 failed jobs (105 `windows-browser-acceptance`, 31 `pass07a`). The logs of all 136 were fetched and searched for `ERR_CONNECTION`, `ERR_ADDRESS`, `ERR_NO_BUFFER`, `ERR_FAILED`, `ECONNRESET` and `ERR_EMPTY_RESPONSE`. Three jobs match, all `windows-browser-acceptance`, all Chromium, all on `main`:

| Date (UTC) | Commit | Run / job | Test | Position | Signature |
| --- | --- | --- | --- | --- | --- |
| 16 Nov 22:33 (end of run) | `dcc71dd` | 43959691703 / 133623454176 | `tests\ui\match.spec.ts:67` cancellation waits for the current command to commit | Chromium half; artifacts no longer listed | `page.goto: net::ERR_CONNECTION_FAILED at http://127.0.0.1:4180/#exhibition` |
| 25 Nov 07:11:46 | `b564908` | 45563229102 / 139031701984 | `tests\ui\audio-stage8.spec.ts:3` | test 5 of 228, about 4 minutes into `match-ui` (step started 07:07:27) | console `Failed to load resource: net::ERR_CONNECTION_FAILED` |
| 26 Nov 04:23:40 | `2c15c95` | 45750418506 / 139676582966 | `tests\ui\pavilion-opposition-watch.spec.ts:4` | test 65 of 234, about 21 minutes into `match-ui` (step started 04:02:25) | `page.goto: net::ERR_CONNECTION_FAILED at http://127.0.0.1:4180/#title` |

About three in 380 hosted Windows runs. The run after each one passed. The brief described the 26 November failure as about 1.5 hours into the run; that is when Playwright printed its summary. The failure itself was test 65, 21 minutes in, as `match-ui.json` (`startTime` 04:23:40.863Z, duration 195 ms) and `match-ui.log` in the run's `windows-browser-acceptance` artifact show.

## Evidence

From the two artifacts still available (downloaded through `gh api repos/SamForbes70/lord-cricket-xxvi/actions/artifacts/<id>/zip`):

1. **The server was alive at the moment of failure.** In the 25 November trace (`0-trace.network`), five font requests were issued in the same millisecond (07:11:46.379Z to 46.380Z). Four completed with HTTP 200, one of them over a *new* connection (`inter-latin-600`, connect 1.5 ms). Only `barlow-condensed-latin-600-normal-DepVgxBB.woff2` failed, with `net::ERR_CONNECTION_FAILED`. The server was accepting connections at that instant.
2. **The failure was immediate.** In the 26 November trace the navigation started at monotonic 1276999.5 ms and failed at 1277005.1 ms: 5.6 ms, on the test's first request in a new browser context.
3. **The server was not restarted.** Playwright starts the `webServer` once per run. After each failure the remaining tests of both browsers passed against the same server (233 of 234 on 26 November, 227 of 228 on 25 November), and `match-ui.log` contains no server output at all (Playwright prints the server's standard error).
4. **Only Chromium.** Firefox was never affected, although it runs the same tests against the same server. With three occurrences this is suggestive, not conclusive.
5. **Not tied to run length.** The two timed occurrences were 4 and 21 minutes into a step of about 95 minutes.

## Hypotheses

| Hypothesis | Verdict | Why |
| --- | --- | --- |
| `vite preview` crashes, exits or is killed (for example under memory pressure) | Ruled out | Evidence 1, 3 and 5. |
| Server idle timeout or keep-alive closing | Ruled out | A closed idle socket is retried by Chromium; a new connection opened in the same millisecond succeeded (evidence 1). |
| Another server reusing 4180, or a test stopping and restarting the server | Ruled out | `--strictPort`; no test starts or stops a server on 4180; any other server would answer HTTP, not fail the connect. |
| IPv4 or IPv6 resolution | Ruled out | The URL is the IPv4 literal `127.0.0.1`; no name is resolved. |
| Nothing listening (refused connect) | Ruled out | Chromium would report `ERR_CONNECTION_REFUSED`. [Inference] On Windows a refused loopback connect also takes about 2 seconds, because Windows retries the SYN; these failed in under 6 ms. |
| One Chromium TCP connect failing with an operating-system error that Chromium has no name for | **Most likely, not proven** | [Inference] Chromium's Windows socket code maps any connect error it does not recognise to `ERR_CONNECTION_FAILED`. The error code itself is in Chromium's NetLog but not in Playwright traces. Candidates for that code include a Windows Filtering Platform or Defender filter on the hosted image, an ephemeral-port collision, and a race in Chromium's socket set-up when a new context starts. None can be told apart from the existing logs. |

Not reproduced on Linux: nine Chromium tests including the two affected specs passed three times locally with the diagnostics on, and a deliberately refused connect produced `ERR_CONNECTION_REFUSED` with `os_error=111`, not `ERR_CONNECTION_FAILED`. The fault appears specific to the hosted Windows runner.

## Change (diagnostics only)

- `playwright.ui.config.ts`: when `LCXXVI_CHROMIUM_NETLOG_DIR` is set, Chromium is launched with `--log-net-log=<dir>/chromium-<pid>-<time>.netlog.json --net-log-capture-mode=Default`. Each worker loads the config afresh, so a browser restarted after a failure writes a new file. When the variable is unset (the Linux job, local runs) nothing changes. The two browsers that `managed-recovery.spec.ts` launches itself for its retained-profile test are not logged. The `webServer` command is now `node scripts/ui-preview-server.mjs`, which runs the same `vite preview --config apps/web/vite.config.ts --host 127.0.0.1 --port 4180 --strictPort`, directly under Node rather than through `npx`.
- `scripts/ui-preview-server.mjs`: when `LCXXVI_PREVIEW_SERVER_LOG` is set, appends JSON lines for the server's start and process id, its output, any exit code or signal, every failed 15-second liveness probe (with the Node error code), and a probe count every 5 minutes. Lines are written as they happen because Playwright ends the server with a forced process-tree kill on Windows.
- `scripts/chromium-netlog-summary.mjs`: reads every NetLog line by line (a killed browser leaves an unterminated file), keeps every failed network event that is not routine (cancelled loads, cache misses, cache lookups and Chromium's UDP network probe are left out) with its `net_error` name and `os_error` code, plus all events of each failing source, and writes one small JSON file. It then deletes the raw logs, which reach tens of megabytes. Tested by `tests/unit/chromium-netlog-summary.test.ts`.
- `scripts/owner-acceptance.mjs`: the `match-ui` step now sets those two variables (the NetLog only on Windows) and writes beside its log:
  - `match-ui-preview-server.jsonl`
  - `match-ui-chromium-netlog-summary.json`
  - `match-ui-network-diagnostics.json`, which on Windows includes `netstat -s -p tcp`, TCP connection-state counts, connections on port 4180 and `netsh int ipv4 show dynamicport tcp`, taken before and after the step.
  Step status, exit codes, `acceptance.json` and its version are unchanged; a failure to collect diagnostics is recorded in that file, not thrown.

Measured cost (Linux, Chromium, the same nine tests): 3.2 minutes with the NetLog against 3.1 minutes without; a second pair gave 3.4 and 2.8 minutes, within run-to-run noise. The summary of a clean run is under 1 KB.

## How to tell if it recurs, and what it means

Download the `windows-browser-acceptance` artifact of the failing run and open `test-results/owner-acceptance-*/`:

1. `match-ui-chromium-netlog-summary.json`: find the `TCP_CONNECT_ATTEMPT` failure at the failing test's time (`wallTimeUtc`) and read `osError`. [Inference] 10061 (refused) would mean the server was not listening; 10048, 10055 or 10049 would point at local ports (compare `TIME_WAIT` counts in `match-ui-network-diagnostics.json`); 10013 would point at a firewall or filter; any other value names the next thing to investigate.
2. `match-ui-preview-server.jsonl`: a `server-exit` line, or `probe-error` lines near the failure, would mean the server side after all.
3. If the summary shows no failure at the failing time, the error arose before any socket was opened, inside Chromium, and the `failingSourceEvents` of the `URL_REQUEST` show where.

Once the error is known, fix that cause in its own pull request and record it here. Do not add retries to hide it.

## Verification

Recorded in the pull request description, with commands and revision.
