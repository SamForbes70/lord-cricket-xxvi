# Lord Cricket XXVI | Pass 10 / M5A ODI exhibition

The browser application now supports manual fictional T20 and ODI exhibition matches on the same deterministic statistical engine architecture. ODI is a distinct 50-over profile with its own setup, event-chain, scorecard and replay contracts. One Web Worker remains the authority for match state, and the M4 IndexedDB persistence boundary now stores and restores either supported limited-overs format.

**Model status: SYNTHETIC_ALPHA.** The shipped T20 and ODI rules are custom game profiles, not claims of certified ICC competition compliance or empirical realism. The approved fictional world remains 160 players, eight squads and eight grounds. Limited-overs rain and DLS remain disabled. Red-ball, league management, training, tactical opponent AI and empirical calibration remain unavailable.

## Run

With Node 22.12 or later:

```sh
npm ci
npm run build
npm run dev
```

Open the local URL printed by Vite. `/engineering.html` retains the historical engineering shell. The packaged playable build uses `node start.mjs` and requires no npm install.

## Play and save

1. Choose T20 or ODI, select both XIs, captains and keepers, then confirm the teams.
2. Call the toss, choose the first innings, select batters and bowlers, set supported tactics and advance by delivery or over.
3. ODI uses 300 legal balls per innings, a 60-ball bowler maximum, no consecutive overs by one bowler, field limits of two outside for balls 0 to 59, four outside for balls 60 to 239 and five outside from ball 240, plus ODI early, middle and late model phases.
4. Every accepted setup or command is durably committed before the UI acknowledges it. Reloading resumes the last committed revision.
5. **Save copy** creates a manual local slot. **Export** creates a `.lcxxvi` archive. **Import** stages and validates an archive before it becomes visible.
6. A second tab opens an active save read-only while the writer lease is held. Three checkpoint generations are retained; a corrupt newest checkpoint is recovered into a new slot without overwriting the damaged source.

`.lcxxvi` imports validate archive bounds, paths, CRCs, byte counts, SHA-256 hashes and pinned engine, event-chain, PRNG, model, rules and world identities. Stored match cores are not trusted directly: resume revalidates setup and resimulates the stored command history before accepting the restored state.

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
npm run odi:rules
npm test
```

ODI browser gate:

```sh
npm run test:m5a
```

Inherited M4 and M3 regressions remain available through `npm run test:m4` and `npm run test:ui`.

The ODI rules suite covers the machine-readable format corpus, 300-ball termination, 60-ball bowler quota, no consecutive overs, field phase boundaries, ODI model phase boundaries, free-hit carry, complete seeded match replay and command resimulation, deterministic rehydration and portable save round-trip. The production Chromium browser test starts an ODI from the normal UI, advances play, verifies 50-over presentation, reloads and restores the same durable revision and ODI session identity.

The formal M3 human acceptance record remains separate. Automated testing is not represented as a human playthrough.

## Architecture and boundaries

- `apps/web/src/match`: revisioned UI protocol, format routing, T20 controller, ODI controller and durable worker boundary.
- `packages/persistence`: IndexedDB repository, writer leases, rolling checkpoints, canonical hashes and multi-format `.lcxxvi` archive validation.
- `packages/simulation`: accepted `LC_T20_MATCH_V1` plus `LC_ODI_MATCH_V1`, deterministic replay and save rehydration.
- `packages/contracts`: strict T20 and ODI setup, command, event, scorecard, replay and manifest schemas.
- `packages/data`: frozen world/model/rules plus T20 and ODI named-field defaults.
- `tests/fixtures/odi/edge-corpus.json`: machine-readable ODI format acceptance corpus.
- `tests/unit/odi-match.test.ts`: ODI format rules, full seeded match and persistence tests.
- `tests/m5/odi-ui.spec.ts`: production browser ODI start, advance and resume acceptance.

Pass 10 does not enable limited-overs rain/DLS, red-ball sessions, league management, training, tactical AI or empirical calibration. M5 remains partial until the separate M5B red-ball stage is complete.
