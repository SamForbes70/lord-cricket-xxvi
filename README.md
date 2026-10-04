# Lord Cricket XXVI | Pass 09 / M4 persistence

A manual browser-based fictional T20 exhibition on the accepted deterministic engine, now with local durable saves, recovery and portable `.lcxxvi` archives. One Web Worker owns authoritative match state. The page renders accepted-event projections and never becomes a second match reducer.

**Model status: SYNTHETIC_ALPHA.** Custom game rules, no certified ICC compliance or empirical realism. Original approved world: 160 players, eight squads and eight grounds. DLS, ODI/red-ball, league/training, tactical opponent AI and empirical calibration remain unavailable.

## Run

With Node 22.12 or later:

```sh
npm ci
npm run build
npm run dev
```

Open the local URL printed by Vite. `/engineering.html` retains the historical engineering shell. A packaged playable build uses `node start.mjs` and requires no npm install.

## Play and save

1. Select both XIs, captains and keepers, then confirm the teams.
2. Call the toss, choose the first innings, select batters and bowlers, set supported tactics and advance by delivery or over.
3. Every accepted setup/command is durably committed before the UI acknowledges it. Reloading resumes the last committed revision.
4. **Save copy** creates a manual local slot. **Export** creates a `.lcxxvi` archive. **Import** stages and validates an archive before it becomes visible.
5. A second tab opens an active save read-only while the writer lease is held. Three checkpoint generations are retained; a corrupt newest checkpoint is recovered into a new slot without overwriting the damaged source.

`.lcxxvi` imports validate archive bounds, paths, CRCs, byte counts, SHA-256 hashes and pinned engine/event-chain/PRNG/model/rules/world identities. The stored T20 core is not trusted directly: resume revalidates setup and resimulates the stored command history, then compares revision, event bytes/hashes, receipts, manifest and terminal core state.

## Verification

Core gates:

```sh
npm run schemas:check
npm run build
npm run typecheck
npm run lint
npm run fixtures:audit
npm run fixtures:engine
npm run vectors:check
npm run probability:check
npm run generator:check
npm test
```

M4 browser gate:

```sh
npx playwright test --config playwright.m4.config.ts
```

The M4 browser suite covers reload/resume, single-writer multi-tab behaviour, manual copy/export/import, corrupt-checkpoint recovery, rollback after durable-write failure, injected interrupted transactions and duplicate-command rejection. The inherited M3 UI suite remains under `npm run test:ui`.

The formal M3 human acceptance record remains separate: automated testing does not represent a person as having completed the match.

## Architecture and boundaries

- `apps/web/src/match`: revisioned UI protocol and durable worker boundary.
- `packages/persistence`: IndexedDB repository, writer leases, rolling checkpoints, canonical hashes and `.lcxxvi` archive validation.
- `packages/simulation`: unchanged `LC_T20_MATCH_V1` gameplay engine plus deterministic save rehydration through command resimulation.
- `packages/domain`, `packages/contracts`, `packages/data`: scoring, contracts, frozen model/rules/world data.
- `tests/m4`: persistence and recovery browser acceptance.
- `tests/unit/persistence-m4.test.ts`: deterministic rehydration and portable archive tamper tests.

Pass 09 does not add ODI, red-ball, DLS, league management, training, tactical AI or calibration.
