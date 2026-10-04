# ADR 009: Preserve fixtures and distinguish scoring evidence

Accepted for Pass 03. The full Pass 02 corpus.json and its digest/index are unchanged. Its scorerImplemented:false field is historical authorship metadata: those expectations were written before a scorer existed. Current runtime capabilities and verification reports report the implemented scorer separately. No golden output is regenerated from production code.

The fixture gate now executes scoreDelivery + reduceScoringBoundary and compares every field of all 45 expected observations. It also applies each case to an innings ledger and compares the full observation. Missing historical batting/bowling lines are constructed by a test-only helper with transparent, synthetic integer allocations; that helper does not generate world rosters or expected outputs. Independent series tests exercise over progression, maidens, extras, player replacement and rejected mutations from initial zero-score snapshots.

All 29 invalid input fixtures execute against the real scorer as well as the validator. Additional Pass 03 tests reject running after the winning run and a later dismissal after the target has already been reached. The scorer rejects these invalid resolutions; it does not silently alter them into a favourable result.

Four new schemas cover batting lines, bowling lines, the innings ledger and the CLI scoring request, bringing the total to 68. The original 64 generated schema files retain their bytes. Existing match schema 1.0.0 is unchanged. Ledger snapshots pin LC_SCORING_V1. This is not a claim that saves using a complete engine are supported.

Four red-ball aggregate completion cases, five clock cases and four persistence/NRR cases remain reference definitions. Their schema/anchor checks must never be counted as implemented subsystem tests. fixtures:engine reports those comparisons as NOT_IMPLEMENTED while reporting actual delivery comparisons as PASS.
