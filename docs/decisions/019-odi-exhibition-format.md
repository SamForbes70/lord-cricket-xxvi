# ADR 019: ODI exhibition as an additive deterministic format

## Status

Accepted for Pass 10 / M5A.

## Decision

Implement ODI beside the accepted T20 engine rather than generalising T20 in place. ODI receives distinct setup, match, event-chain, scorecard and replay identifiers while reusing the accepted scorer, deterministic random service, probability model, conditional delivery generator and M4 persistence transaction model.

`LC_ODI_01` is treated as a custom game profile. It allocates 300 legal balls per innings, limits each bowler to 60 legal balls, prohibits consecutive overs by the same bowler, enables the inherited limited-overs free-hit behaviour, and uses field limits of 2, 4 and 5 outside at legal-ball boundaries 0, 60 and 240. Model phase selection uses `ODI_EARLY`, `ODI_MIDDLE` and `ODI_LATE` at the same boundaries.

An ODI-only named-field registry adds `long-off`. This allows a late-innings five-outfielder field without broadening the accepted T20 named-field surface or changing T20 default field bytes.

The shared UI protocol identifier remains `LC_T20_UI_V2` for compatibility with existing persisted request history. ODI support is additive: START carries a format discriminator with T20 as the backwards-compatible default, and public views expose the active format.

Portable save import accepts an explicit allow-list of supported pin sets. The historical single-pin archive API retains its existing exact rejection behaviour so M4 compatibility tests remain valid.

## Consequences

T20 deterministic event/hash regressions remain a hard gate. ODI can evolve under its own engine/event-chain identifiers without silently changing old T20 saves. The cost is some intentional duplication between the T20 and ODI orchestration modules until a later refactor can prove byte-level compatibility for both formats.

Limited-overs rain remains disabled because no verified DLS provider is present. ODI is not represented as a certified reproduction of current international competition conditions. Red-ball is deferred to M5B because sessions, declarations, follow-on and lost time materially expand the state machine.
