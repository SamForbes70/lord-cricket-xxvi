# Collect Windows acceptance evidence

This procedure runs the supported browser suites and records machine, source and browser evidence.
The collector uses fresh browser contexts and leaves existing browser saves untouched.

Prerequisites:

- Node.js 22.12 or later and npm are available.
- Git is available, with a clean checkout of the latest `main`.
- The registry and Playwright download hosts are reachable.
- Ports 4173, 4180, 4189, 4191 and 4192 are free.

Estimated duration: 10–20 minutes, plus initial browser downloads.
For failures, return `acceptance.json` and the failed command's log to this development thread.

## Run the collector

1. Open PowerShell in the repository directory containing `package.json`.
2. Run the collector on your Windows PC:

   ```powershell
   node scripts/owner-acceptance.mjs --owner-pc
   ```

3. Open the `acceptance.json` path printed at completion.
4. Return the generated evidence directory with your results.

## Verify the result

1. Confirm that each required command has `status: "PASS"` and exit code `0`.
2. Confirm that `source.commit` matches `source.completedCommit`.
3. Confirm that both source dirty flags are `false`.
4. Confirm that the browser reports contain actual Chromium and Firefox versions and passed test counts.
5. Confirm that `ownerPcGate` identifies the declared Windows location.

The collector stops after a failed or blocked command and retains its actual output.
The collector uploads no files and closes no GitHub issues.
Its location flag records your declaration; hosted Windows runs remain hosted evidence.
A dirty checkout or missing Git metadata leaves source acceptance unestablished.

## Performance observations

The collector records 30 command acknowledgements per browser, viewport dimensions and browser versions.
It separates page-lifetime long tasks from tasks overlapping measured commands.
Firefox can omit the Long Tasks API; the report records that limitation.
Main-thread JavaScript heap bytes exclude workers and native allocations.

The worker also measures 20 T20 matches, 20 five-day matches and a complete 56-fixture league.
The storage probe measures 20 commits and 20 validated loads of the completed season.
These measurements do not establish acceptance on the four-core, 8 GB reference laptop.
The report keeps reference performance unaccepted until the hardware and complete measurements qualify.
The collector also leaves unrecorded human observations unrecorded.
Previously supplied successful human playthrough evidence remains valid.

## Optional commands

1. Run `node scripts/owner-acceptance.mjs --plan` to inspect the command plan without executing it.
2. Run `node scripts/owner-acceptance.mjs --skip-install` when the pinned npm dependencies are already installed.

The second command still installs the supported browsers and collects acceptance evidence.
An omitted owner-location declaration leaves `ownerPcGate` unestablished.
