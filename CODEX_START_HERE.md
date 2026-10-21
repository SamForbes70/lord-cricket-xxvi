# Lord Cricket XXVI: Start here in Codex

This is the **recovered complete TypeScript source repository with its full available Git history**. It was restored from the Pass 22 / M7J bundle in the original 17 October 2026 owner package. The code from historical commit `5b8b9da990d657197fb56bbfd33152f87b875f5c` was verified byte-for-byte against every source ZIP entry (894 entries).

## Open this project
1. Extract the outer ZIP to a normal Windows folder, e.g. `C:\Projects\Lord_Cricket_XXVI_Codex_Migration_2026-10-21`.
2. In Codex desktop/app, **open the inner `Lord_Cricket_XXVI` folder**, the one with `.git`, `AGENTS.md`, `apps`, `packages`, `tests`, and `package.json`.
3. Do not point Codex at only the `ORIGINAL_OWNER_RELEASE` ZIP or the outer migration folder.
4. Use `docs/codex-migration/FIRST_CODEX_TASK.md` as the initial task.
5. Install Node.js >=22.12, Git and Python 3 on your own Windows PC before running verification. `npm ci` requires registry access; no `node_modules` is shipped.

## Baseline checks
```
git status --short
git log --oneline -3
git cat-file -t 5b8b9da990d657197fb56bbfd33152f87b875f5c
git diff 5b8b9da990d657197fb56bbfd33152f87b875f5c -- apps packages scripts tests
npm ci
npm run schemas:check
npm run build
npm run typecheck
npm run lint
python scripts/m7j-restore-fixtures.py
python -m unittest discover -s tests -p "test_m7*.py" -v
npm run management:acceptance
```
Use the test and browser matrix in `docs/codex-migration/VERIFICATION_AND_GATES.md` for the other suites.

## Push to a private GitHub repository (optional but recommended)
Create an empty private repo first on GitHub. In this recovered project directory:
```
git remote add origin https://github.com/YOUR_USERNAME/lord-cricket-xxvi.git
git push -u origin main
```
Replace YOUR_USERNAME and URL with your own new private repo. Do not force-push or publish private saves, API keys or Cricsheet raw data. The recovered Git history is already present, so do not initialise another repository.

## Play the existing owner build without rebuilding
Extract `../ORIGINAL_OWNER_RELEASE/Lord_Cricket_XXVI_START_HERE_2026-10-17.zip` and use `PLAY_LORD_CRICKET.cmd` then `OPEN_LORD_CRICKET.url`. This is a localhost browser app, not a native .exe. Browser careers are saved in IndexedDB, not in the game directory; use Settings export to back them up.

**Important:** The empirical research candidates are not part of production gameplay. Real browser match/save tests and formal human acceptance were still outstanding when this release was packed.
