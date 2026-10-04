# Lord Cricket XXVI: Pass 10 / M5A ODI Exhibition report

**Result: PASS for the bounded M5A ODI Exhibition gate.**

**M5 overall remains PARTIAL.** The separate M5B red-ball match, session and clock work is not implemented by this pass.

**Formal M3 human acceptance remains PENDING.** Current automated browser evidence is not represented as a human playthrough.

Pass 10 was built directly from accepted Pass 09 source commit `6b0a190b34c5c674820c935d0e062c047dcdd498`. The accepted T20 scorer, random service, probability model, conditional delivery generator, world and T20 engine/event-chain identifiers remain in place. T20 deterministic regression tests continue to pass.

## Delivered

Pass 10 adds ODI as an additive deterministic exhibition format rather than changing the accepted T20 engine in place.

- New strict ODI contracts and generated schemas for setup, command receipts, events, execution manifest, event-chain manifest, scorecard and replay cases.
- New engine identifiers `LC_ODI_MATCH_V1`, `LC_ODI_EVENT_CHAIN_V1` and `LC_ODI_CONDITIONS_V1`.
- Frozen `LC_ODI_01` setup validation with 300 legal balls per innings, 60 legal balls maximum per bowler, 11-player XIs and the existing requirement for at least five bowling-capable players.
- ODI innings orchestration using the accepted scorer and reducer, deterministic random service, integer probability model and conditional delivery generator.
- ODI model phase selection: `ODI_EARLY` for legal balls 0 to 59, `ODI_MIDDLE` for 60 to 239 and `ODI_LATE` from 240.
- ODI field restrictions: maximum two outside the circle for balls 0 to 59, four for 60 to 239 and five from 240. An ODI-only named-field registry adds `long-off`, so five outside can actually be selected late without broadening the inherited T20 field registry.
- 60-ball bowler quota and inherited prohibition on the same bowler bowling consecutive overs.
- Limited-overs free-hit semantics retained, including persistence across a subsequent wide or no-ball.
- First and second innings terminate on all out, allocation exhausted or chase completion according to the existing scoring state machine. No phantom 301st legal ball is permitted.
- New production UI format selector with T20 and ODI options. ODI score presentation uses 50-over allocation and 300-ball remaining calculations.
- Worker routing to separate T20 and ODI controllers while retaining one worker as the authority for each active match.
- M4 persistence extended to ODI. Autosave, reload/resume, manual save copies, rolling checkpoint recovery, writer leases and `.lcxxvi` archive export/import remain available.
- Portable archive import now accepts an explicit allow-list of supported T20 or ODI pin sets. The historical single-pin API preserves its inherited exact rejection behaviour.
- Machine-readable `LC_ODI_EDGE_CORPUS_V1` with 14 format cases covering allocation, quota, all field/model phase boundaries, free hit, bowler rotation, rain gate, terminal delivery, replay and persistence.
- ADR 019 records the additive format decision and compatibility boundary.

## Rules boundary

`LC_ODI_01` is a custom Lord Cricket XXVI game profile, not a claim of exact current ICC ODI competition conditions. The profile has one 50-over innings per team, six legal balls per over, a 60-ball bowler maximum, field limits of 2/4/5 across the three ODI phases, free hit after a no-ball, no declarations, no follow-on and no super over.

The base release still disables limited-overs rain. No DLS approximation is enabled or labelled as DLS. The ODI profile therefore does not start or resume a rain-affected limited-overs match with an invented target.

## Persistence compatibility

ODI uses the M4 durable command-batch boundary. A setup or command is acknowledged only after the IndexedDB transaction commits. Reload selects the correct format controller from the stored setup, revalidates the setup and rehydrates the match through deterministic command replay.

ODI portable archives are pinned to the ODI engine, event chain, random service, model, `LC_ODI_01` rules hash and frozen world hash. T20 archives continue to use the accepted T20 pins. Import accepts only one of these explicit supported pin sets.

A full deterministic ODI is also round-tripped through `.lcxxvi` in the unit suite, then rehydrated and compared against its original event-chain and scorecard result.

## Deterministic ODI regression observation

The frozen ODI fixture `tests/fixtures/world/odi-valid-setup.json` currently produces the following synthetic regression observation:

- First innings: team-01 152 all out from 208 legal balls.
- Second innings: team-02 142 all out from 230 legal balls chasing 153.
- Result: team-01 wins by 10 runs.
- Revision: 188.
- Event count: 630.
- Final event hash: `7cbe21f02090eff296ff875fdf6f1563d5e173e4389b75633f00ff5e28a39ad2`.
- Final state hash: `d21a3d0d5eca5471f7c51c271095eccbe72e2465ea41253c67e90a3bd4db3f16`.

This is a deterministic regression observation under the synthetic model. It is not evidence that these totals or distributions are empirically calibrated to real ODI cricket.

## Final verification

Environment: Debian GNU/Linux 13, Node v22.16.0, npm 10.9.2, Python 3.13.5 and system Chromium 144.0.7559.96.

The exact lockfile was installed cleanly with the pinned Pass 09 npm cache using `npm ci --offline`, adding 208 packages. No dependency upgrade was required.

| Gate | Final result |
| --- | --- |
| Clean lockfile install from pinned cache | PASS, 208 packages |
| Generated JSON Schemas | PASS, 106 |
| Production build | PASS |
| Typecheck | PASS |
| ESLint and package/ambient boundaries | PASS, 7 boundaries |
| Scoring regression | PASS, 45/45 delivery, 45/45 ledger, 29/29 invalid rejected |
| Deterministic random/state vectors | PASS, 24 + 8 |
| Independent probability vectors | PASS, 1601-entry Decimal LUT, 15 mass/draw vectors, 4 boundaries |
| Generator vectors | PASS, 9 fixtures |
| Full unit suite | PASS, **425/425 across 14 files** |
| ODI rules and persistence suite | PASS, **10/10** |
| ODI Chromium production browser | PASS, **1/1** |
| Inherited M4 Chromium persistence | PASS, **6/6** |
| Current T20 Chromium full keyboard match | PASS, **1/1** |
| Current T20 Chromium layout/tactics cases | PASS, **2/2** |
| Fresh Pass 10 Firefox | **BLOCKED: Firefox executable is not installed** |
| Formal human M3 playthrough | **PENDING** |

The production ODI browser gate starts an ODI from the normal application, advances through real manual decision stops, confirms the 50-over presentation, verifies durable autosave, reloads the page and restores the exact score/revision and stored `ODI` session identity.

The M4 regression suite still proves reload/resume, writer-lease contention, copy/export/import, corrupted-checkpoint recovery, rollback after durable failure, interrupted transaction atomicity and duplicate-command rejection.

The current T20 unit suite retains the exact pinned seeded match scorecard/event-chain regression, which is the primary evidence that adding ODI did not silently alter accepted T20 gameplay bytes.

## Defects found and repaired during Pass 10

1. **Archive rejection compatibility.** Adding multi-format archive pins initially changed the inherited single-pin error message. The API now preserves the original single-pin rejection semantics while using a separate multi-pin rejection only for the new allow-list path.
2. **Schema inventory drift.** Eight new ODI schemas correctly increased the generated schema total from 98 to 106. Historical inventory assertions were updated only after independent schema generation and strict AJV compilation passed.
3. **Late ODI field surface.** The inherited named-field registry had only four deep positions, so the 41 to 50 over phase could not actually exercise its permitted fifth outside fielder. An ODI-only `long-off` slot and late template were added without changing T20 field choices.
4. **Browser duration.** A full manual 50-over browser match is slow because every accepted decision is durably committed to IndexedDB. Complete ODI termination/replay/resimulation is therefore a deterministic engine gate, while the browser gate proves production start, real play, durable save and resume. This is an explicit test-layer boundary, not a claim that a full browser ODI was completed during this pass.
5. **Combined verification wrapper timeout.** One all-in-one wrapper exceeded the outer tool execution window after its component gates had run. Final acceptance uses separate post-clean command logs, all of which completed with explicit PASS results.

## Known limitations and residual risks

The model remains `SYNTHETIC_ALPHA` and has not been empirically calibrated as an ODI model. Tactics use the existing bounded model controls. There is no tactical opponent captain AI, so both teams remain manually controlled in the browser exhibition.

Limited-overs rain and DLS are disabled. There is no ODI career calendar, league ODI competition, contracts, injuries, transfers or multiyear progression. Those are outside the V0.1 ODI exhibition scope.

The browser production bundle retains a non-fatal Vite chunk-size warning. Formal performance budgets have not been measured on the reference laptop described by the technical design.

Fresh Firefox execution remains blocked because no Firefox executable is installed in this verification environment. No fresh Firefox PASS is claimed.

Formal M3 human acceptance remains pending as a separate governance gate.

## Milestone status and next stage

**Pass 10 / M5A ODI Exhibition: PASS.**

**M5 overall: PARTIAL.** ODI is implemented and verified, but the five-day red-ball profile remains outstanding.

The next bounded stage is **Pass 11 / M5B: Red-ball Exhibition and Match Clock**, covering sessions, days, declarations, follow-on, lost time, red-ball weather handling, new-ball availability and the custom final-hour rule with an independent clock/rules corpus.
