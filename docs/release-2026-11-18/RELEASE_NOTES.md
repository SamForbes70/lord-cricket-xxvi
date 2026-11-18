# Lord Cricket XXVI, alpha release of 18 November 2026

An offline cricket management game in the browser. Everything in it is fictional: the eight clubs, the players, the grounds and every result. The match model is a synthetic alpha (`synthetic-alpha-01`). It makes no claim to match real cricket.

## What you can play

- **Career.** A persistent multi-season T20 career with eight clubs: player ageing and a youth academy, contracts and budgets, tactical briefings, statistics and leaderboards, awards, and stories about your players and your manager.
- **Matches.** T20, one-day and five-day matches with a live 2D field, highlights, text commentary and optional sound and narration.
- **Exhibition rules (opt-in).** Super overs to settle ties, rain-shortened T20 and one-day matches with revised targets from a fictional resource table, and player reviews (DRS).
- **Scenario challenges.** Fictional match situations to win from.
- **Tournaments.** Built-in fictional competitions, competitions you make yourself, tours against a touring XI picked from the other clubs, and tournaments whose squads are rebuilt by an auction with fictional budgets. Teams carry built-in crests.

## How to play

Download `lord-cricket-xxvi-game-<commit>.zip`, extract the whole folder, then:

- **Windows 10 or 11:** double-click `Play-Lord-Cricket.bat`. No installs are needed: it uses Node.js or Python if you have them, or builds a small launcher EXE with Windows' own .NET compiler. The EXE is unsigned, so Windows SmartScreen may warn you first.
- **Mac or Linux:** run `bash start-game.sh` (needs Node.js 18 or later, or Python 3).

The game opens at http://127.0.0.1:4180/. Saves live in that browser profile: use **Export .lcxxvi** to keep backups.

## Known limits

- Stage 16 (product-quality acceptance) was passed by the owner's direct instruction. The owner-PC measurements, observed playtest, screen-reader walkthrough and 20-season soak were not run.
- Tested by hosted CI on Linux and on Windows (Chromium and Firefox) only. Nothing has been run on Safari or macOS.
- Rain-shortened matches and player reviews are exhibition-only.
- An older build cannot read saves made by this one.

The full record, with SHA-256 manifests, the tested revision and every gate, is `docs/release-2026-11-18/RELEASE_RECORD.json`.
