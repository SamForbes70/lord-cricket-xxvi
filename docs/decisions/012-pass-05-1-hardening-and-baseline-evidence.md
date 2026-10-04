# ADR 012: Pass 05.1 hardening and baseline evidence

## Status

Accepted for Pass 05.1.

## Context

Pass 05 implemented the integer probability service but its clean dependency installation and dependent production verification gates were blocked by npm registry connectivity. Pass 05.1 must verify rather than add gameplay capability. The source archive also contained documentation drift from earlier passes, including descriptions that understated the implemented probability service.

## Decision

1. Keep all public deterministic identifiers unchanged: `LC_SCORING_V1`, `SHA256_COUNTER_V1`, `LC_CANONICAL_JSON_V1_SHA256`, `LC_INTEGER_PROBABILITY_V1`, `LC_EXP_LUT_V1` and model ID `synthetic-alpha-01`.
2. Do not modify the Pass 02 scoring corpus, Pass 04 deterministic vectors, Pass 05 probability vectors, the synthetic model pack or the exponential LUT as part of documentation hardening.
3. Treat a successful clean `npm ci` as a mandatory prerequisite for the canonical Zod/schema drift, workspace build, full type-check, ESLint, executable scorer regression, Vitest and Playwright production gates. Offline reference checks are supplementary evidence only.
4. Distinguish environmental **BLOCKED** status from implementation **FAIL**. DNS failure or absent authorised package cache does not prove a source defect, but it also cannot be treated as a passing release gate.
5. Record an exact initial and final manifest including source snapshot identifier, lockfile/fixture hashes, schema and fixture counts, version identifiers and verification statuses.
6. Keep M0 partial until a validated fictional world pack passes. M1 is scoped to supported supplied-delivery scoring only. M2 remains incomplete until a seeded complete T20 match, scorecard and replay corpus pass.
7. Do not describe the repository as playable or the synthetic coefficients as empirically calibrated.

## Consequences

Documentation can be corrected without changing deterministic behaviour or compatibility. If any mandatory production gate remains blocked, Pass 05.1 cannot freeze the baseline as ready for Pass 06 even if all independent offline checks pass. The completed source and evidence may still be delivered with an overall BLOCKED verdict.
