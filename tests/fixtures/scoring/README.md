# Scoring fixture corpus v1.0.0

These are hand-authored reference cases for the supplied V0.1 technical design. The file has 87 cases: 45 valid delivery resolutions, 29 rejected resolutions, four terminal scenarios, five clock scenarios and four deferred persistence/NRR scenarios. No production scorer generated the expected results.

```sh
npm run build
npm run fixtures:audit
npm test
```

`npm run fixtures:engine` now runs LC_SCORING_V1 against all 45 golden observations, both through the boundary reducer and full innings ledger, and tests the scorer against all 29 rejected inputs. The historical scorerImplemented:false field records that this corpus was authored before that implementation. The corpus bytes are unchanged.

## Contents

- F01..F09: core Appendix D delivery/innings cases.
- F10..F12 and T01: follow-on victory, final target, draw versus completed-innings tie.
- RO1..RO4 and RO1-SIXTH..RO4-SIXTH: both batters at both wicket ends, after one completed run while attempting a second. Starting and final ends, incoming end, next striker and zero bowler wicket credit are explicit.
- S01..S28: dots, run parity, extras, boundaries, dismissal credits, free-hit/dead-ball masks, final allocation and immediate target cases, including ODI and red-ball differences.
- I01..I29: expected typed rejection codes for malformed or unsupported input.
- C01..C05: independently specified before/after time, phase and next action.
- F13/F14: deferred persistence expectations; F15/F16: deferred NRR expectations. No corresponding implementation is exercised.

`expected.event` is a complete golden DeliveryRecorded object. `expected.delta` and totals provide independent attribution/reconciliation evidence. Empty ends remain null until selection; nextStrikerId may already be known if the surviving batter faces next. Terminal cases request no player.

The fixture audit checks schema, arithmetic and internal consistency, and executes the resolution validator on positive/negative input. The audit itself does not emit production scores; the separate engine gate invokes the production scorer. `index.json` records IDs and a byte digest. Review fixture changes before deliberately updating that digest. Do not replace expected values with engine output.

See ADRs 006/007 for the supported-profile limits, timing decisions and event order.
