# Windows and human acceptance handoff

The workflow in `.github/workflows/verify.yml` provides automated Windows-runner acceptance and retains its own logs/screenshots. Check PR #2 for that result. The owner's **local Windows and human M3** gate remains **NOT RUN** until an actual tester records it. Hosted automation is not a human playthrough or a reference-PC performance result; Linux runs do not fulfil Windows coverage.

## Automated browser run on Windows

Use a clean checkout of PR #2's `codex/baseline-recovery-acceptance` branch, Node >=22.12, npm, Git and Python 3. Preserve any local changes; do not reset a working checkout to prepare acceptance. Keep an existing `LCXXVI_CHROMIUM_EXECUTABLE` override unset unless it intentionally names a supported Windows Chromium executable.

From the repository root in PowerShell, capture the commit, versions, full command output and each command's `$LASTEXITCODE`. Stop if installation or build fails; do not report later browser commands as executed. The following commands use Playwright-managed Windows browsers and fresh test contexts:

```powershell
git rev-parse HEAD
git status --short
node --version
npm --version
python --version
npm ci
npx playwright install chromium firefox
npm run schemas:check
npm run build
npm run typecheck
npm run lint

$evidence = Join-Path (Get-Location) 'test-results\windows-acceptance'
New-Item -ItemType Directory -Force $evidence
$env:LCXXVI_UI_EVIDENCE_DIR = Join-Path $evidence 'ui-images'
npx playwright test --config playwright.ui.config.ts --reporter list --output test-results/windows-acceptance/ui --trace on
npx playwright test --config playwright.m6g.portable.config.ts --reporter list --output test-results/windows-acceptance/career --trace on
```

Keep ports 4173 and 4180 free: the test runners manage their own preview servers. The UI suite covers a complete keyboard-controlled T20, replay identity, desktop 100%/150%, reduced motion, 390px narrow layout, long names and tactics rejection. The career suite covers save/reload and export/import into an empty browser context. Record browser-specific passed/failed/interrupted/skipped counts, browser versions and screenshots/traces. Retain the actual command's exit status if piping output to a log.

Do not use the Linux-only `playwright.m6g.config.ts` on Windows: its executable path names `/usr/bin/chromium`. The portable configuration above supplies both browser projects.

## Human M3 playthrough

Run `node start.mjs` after building and use a dedicated browser profile or export existing `.lcxxvi` careers first. Never clear an owner's IndexedDB to obtain a clean test. Follow [M3_HUMAN_ACCEPTANCE.md](../M3_HUMAN_ACCEPTANCE.md) for the full match: XIs/captain/keeper, toss, batting/bowling choices, tactics, both innings, eligibility explanations, terminal controls and replay/scorecard verification. Check desktop 100%/150%, narrow display and keyboard navigation with your own eyes and input.

The checklist's historical note that M4 saves are disabled is not current capability evidence: M4 durability is implemented and automated separately. Human acceptance remains a distinct, unsigned gate until an actual tester completes it.

Return a completed record containing:

- Windows version, browser/version, tested commit, tester and date.
- PASS/FAIL for every checklist step; actual score/result and any inaccessible decision/control.
- Replay event/scorecard hashes and whether presentation changes preserved them.
- Screenshots or traces for problems and the 100%/150%/narrow views.
- Automated suite logs and exact exit codes, separately from the human verdict.

## Preserved owner release

The original owner ZIP is not mounted in the cloud task. When it becomes available, retain the original bytes, record its SHA-256, inspect its manifest and verify available expected hashes before extraction. Extract outside the source checkout, preserving all existing saves and source changes.

Compare the actual extracted index/assets and local HTTP responses with the rebuilt app. Record intentional differences from this PR's layout changes separately from unexpected differences. In particular, the simulation worker must retain its accepted hash; a changed presentation bundle is expected after the layout fix. Use separate ports/processes and fresh automated profiles. Do not label comparison with historical hash records as a fresh verification of the owner archive.
