# ADR 011: Versioned integer categorical probability

Status: Accepted for Pass 05. Model status: SYNTHETIC_ALPHA.

The generic categorical stage sampler uses LC_INTEGER_PROBABILITY_V1 with a
fixed 10,000-scale coefficient/feature interface and SHA256_COUNTER_V1. Every
product is BigInt rounded nearest ties away from zero before ordered addition.
Clip once after accumulation to [-80000,80000]. The maximum among allowed
positive-weight logits establishes relative LUT deltas. Round each delta to a
multiple of 100 logit basis points (ties away from zero). The fixed offline
Decimal lookup indexes exp(-index / 100), 0 <= index <= 1600, as a rounded
10^12-scale positive integer. Pin the complete LUT bytes and version in the
pack. Never evaluate exponential/logarithm in a runtime or browser.

Masked/zero-base-weight categories never define the reference maximum and
receive zero mass, with their original array position retained. BigInt weights
are converted to 2^32 units by Euclidean division; distribute leftover units
by descending remainder with original category index as the tie-breaker. Exact
cumulative integer ranges permit draw=0 and draw=0xffffffff without an upper
endpoint gap. Distinct addresses do not imply distinct random integers.

The pack hash includes baseline legality and Appendix F contact rows, feature
semantics, LUT and manifest. A pack mutation without a new ID/version fails its
hash check. The caller must allocate global attempt ordinals and unique stage
indices. Full legality/contact/fielding/dismissal conditional execution and
empirical coefficient fitting are intentionally **not** implemented by this
pass. A later pass must define categorical sampling stages before treating
this primitive as an end-to-end delivery generator.
