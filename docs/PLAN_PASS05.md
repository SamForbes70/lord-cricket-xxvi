# Pass 05 implementation plan

1. Preserve the 71 Pass 04 JSON Schemas, scoring corpus and deterministic vectors unchanged.
2. Add strict, versioned categorical-probability requests and stage-address boundaries. Implement ordered fixed-point accumulation, clipping, a frozen integer exponential LUT and exact unsigned 2^32 normalisation using BigInt.
3. Publish a clearly synthetic model pack, LUT and hashes, with the neutral legality and seven contact rows from the V0.1 Appendix F baseline. This is a generic stage sampler, not a full delivery generator.
4. Add compiled batch and browser-worker adapters. Freeze independent Python-generated rounding, mass, masking and endpoint vectors and prove consistency without using the production implementation to construct expected outputs.
5. Execute available verification gates, report actual successes and environmental blockers, self-review, package source and tests, and carry M0 partial into the next bounded pass.

Implemented behaviour and evidence belong in PASS_05_REPORT.md. Do not mark empirical validation, playable matches or M0 completion.
