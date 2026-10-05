# Lord Cricket XXVI | Pass 11 / M5B red-ball exhibition and match clock

The browser application supports manual fictional T20, ODI and five-day red-ball exhibition matches on the same deterministic statistical architecture. Red-ball is a distinct event-sourced match state machine with four-innings arbitration and a deterministic five-day clock. One Web Worker remains authoritative for active match state, and the M4 IndexedDB persistence boundary stores and restores all three supported formats.

**Model status: SYNTHETIC_ALPHA.** The shipped profiles are custom Lord Cricket XXVI game rules, not claims of certified ICC competition compliance or empirical realism. The approved fictional world remains 160 players, eight squads and eight grounds. Limited-overs rain and DLS remain disabled. Automatic stochastic red-ball weather scheduling, league management, training, tactical opponent AI and empirical calibration are not enabled in this pass.

## Run

With Node 22.12 or later:

```sh
npm ci
npm run build
npm run dev
```

Open the local URL printed by Vite. `/engineering.html` retains the historical engineering shell. The packaged playable build uses `node start.mjs` and requires no npm installation.

## Supported exhibition formats

- **T20:** accepted 20-over vertical slice under `LC_T20_MATCH_V1`.
- **ODI:** 50-over exhibition under `LC_ODI_MATCH_V1`, including the accepted ODI bowler quotas, model phases and field phases.
- **Red ball:** five-day exhibition under `LC_RED5_MATCH_V1` / `LC_RED5_01`, with two innings per team, declarations, optional 200-run follow-on, new ball after 480 legal balls and time-expiry draw arbitration.

The red-ball clock starts at 11:00. Lunch is 13:00-13:40, tea is 15:40-16:00 and scheduled close is 18:00. Meals and stumps wait for an over already in progress. The ten-minute innings interval replaces a coincident meal rather than stacking with it. Days one to four may extend to 18:30 while pursuing 90 legal overs. Day five applies the documented final-hour obligation from 17:00. Red-ball rain/lost-time consequences are available through deterministic rules/system events; no stochastic weather scheduler is enabled by this pass.

## Save and recovery

Every accepted setup or command is durably committed before the UI acknowledges it. Reloading resumes the last committed revision. **Save copy** creates a manual local slot. **Export** creates a `.lcxxvi` archive. **Import** stages and validates an archive before it becomes visible.

A second tab opens an active save read-only while the writer lease is held. The writer identity is stored in browsing-context `sessionStorage`, so a reload keeps ownership while a genuinely separate tab receives a different identity. Three checkpoint generations are retained, and corrupted newest checkpoints recover into a separate slot without overwriting the damaged source.

Portable imports validate archive bounds, paths, CRCs, byte counts, SHA-256 hashes and the explicit engine/event-chain/PRNG/model/rules/world pin set. Stored match cores are not trusted directly: resume revalidates setup and resimulates the accepted command history.

## Verification

Core Pass 11 gate:

```sh
npm run verify:11:core
```

This includes schema drift/strict AJV, production build, typecheck, lint and package boundaries, scoring regression, deterministic vectors, probability vectors, generator vectors, the independent Appendix D red-ball fixture audit, red-ball rules and the complete unit suite.

Production red-ball browser gate:

```sh
npm run test:m5b
```

Inherited persistence and format regressions remain available through `npm run test:m4`, `npm run test:m5a`, `npm run test:ui` and `npm run corpus:node`.

Pass 11 evidence covers the original Appendix D terminal cases F10-F12/T01 and clock cases C01-C05, declarations, follow-on, new ball, final-hour rain adjustment, complete seeded match, exact replay/resimulation, persistence/archive round-trip, Chromium/Firefox start/play/reload, the inherited M4 persistence suite and the full 100-match T20 replay corpus.

The formal M3 human acceptance record remains separate. Automated testing is not represented as a human playthrough.

## Architecture and boundaries

- `apps/web/src/match`: revisioned UI protocol, T20/ODI/RED5 controllers and durable worker boundary.
- `packages/persistence`: IndexedDB repository, writer leases, rolling checkpoints, canonical hashes and multi-format `.lcxxvi` validation.
- `packages/simulation`: accepted limited-overs engines plus `red-ball-match.ts` and `red-ball-clock.ts`.
- `packages/contracts`: strict setup, command, clock, event, scorecard and replay contracts for each enabled format.
- `packages/data`: frozen fictional world, synthetic model and custom rule manifests.
- `tests/fixtures/red5/edge-corpus.json`: Pass 11 red-ball acceptance inventory.
- `scripts/audit-red5-fixtures.ts`: execution of the original independent Appendix D terminal and clock expectations.

Pass 11 does not add league management, contracts, transfers, tactical opponent AI, empirical calibration or verified DLS. The next bounded stage is Pass 12 / M6, the persistent eight-team T20 management season loop.
