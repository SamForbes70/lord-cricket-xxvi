# Pass 06.0 repair acceptance evidence

`results.json` and per-gate `*.log` were emitted by a fresh successful native `node scripts/verify.mjs` run. The command used the original pinned `package-lock.json` and locally hash-verified offline npm cache. `HOME=/root` corrected this container’s root/other-user Firefox HOME conflict; `PLAYWRIGHT_BROWSERS_PATH` selected the exact hash-verified Playwright 1.56.0 Chromium and Firefox bundles. Browser content sandboxing was not disabled.

`source-integrity.json` checks frozen file hashes and all 84 inherited JSON schemas against the supplied Pass 06.0 archive. `initial-failures/` preserves unsuccessful source and browser test logs before repair. `security-audit-offline.json` is cached/offline evidence only, not a fresh registry vulnerability audit. The older `docs/verification-pass06/` results are historical and intentionally retain their original BLOCKED status.

The full set of final gates returned PASS. This is the bounded scorer/random/probability/one-shot-generator acceptance, not a playable-game acceptance.
