# ADR 016: Immutable, hash-pinned T20 setup without enabling match play

Date: 27 September 2026. Status: ACCEPTED for Pass 07A, subject to the actual gate.

## Decision

Introduce strict **additive** `T20TeamSelectionSchema` and `T20MatchSetupRequestSchema` plus `LC_T20_SETUP_V1` for pre-toss setup. Inputs are the exact published world **UTF-8 bytes**, frozen world manifest, two selected 11-player XIs, keeper/captain per XI, ground, approved `LC_T20_01` rules, model, stage pack and their declared hashes. Check the source file SHA-256, independent canonical SHA-256, pinned manifest, exact rule content/hash, unchanged model/stage pack and all selected player references **before** returning a match snapshot. Reject unsupported capabilities (including not-yet-implemented prediction). Require at least five selected bowling-capable players per XI. Complete player snapshots and ground conditions are copied and transitively Object.freeze'd, so later changes to imported player/ground objects cannot rewrite a match.

A successful bootstrap is a *fixture-only*, immutable pre-toss snapshot. It is NOT a game command, a runnable MatchState, a toss, an innings reducer or a durable persisted save. The established `SHA256_COUNTER_V1`, `LC_INTEGER_PROBABILITY_V1`, `LC_CONDITIONAL_DELIVERY_V1`, `LC_SCORING_V1`, stage registry, synthetic pack and old goldens are unchanged. The stage pack's `noLiveMatchOrCalibration: true` is honoured: no playable UI or match orchestration is enabled here.

Production validation lives in `packages/simulation/src/world-setup.ts`; strict schemas live in `packages/contracts/src/world.ts`; default-world structural checks live in `packages/data/src/world.ts`. Node batch commands `validate-world` and `setup-t20` run the same production acceptance code. Independent Python audits, 40 authored negative fixtures, byte-integrity mutants and strict Zod/AJV comparison guard against accidental acceptance. Failure is explicit with no partial snapshot returned.

## Later work

Pass 07B consumes the frozen world manifest and fixture snapshot to implement seeded headless T20 match orchestration and replay. UI (M3), durable IndexedDB saving (M4), league management (M6), DLS and calibration are not part of this decision. Subsequent setup API changes affecting public behaviour require an explicit version update and migration/rejection policy.
