# ADR 015: Frozen fictional-eight-01 pack and offline provenance

Date: 27 September 2026. Status: ACCEPTED for Pass 07A, subject to passing the Pass 07A verification pipeline.

## Context

The normative V0.1 design requires 160 fictional players in eight independent squads of 20, eight grounds, at least two wicketkeepers and six bowling-capable players per squad. Pass 06 supplied only generic WorldPack validation; duplicate cross-team memberships remained valid at that generic boundary. The published Pass 07 planning seed corpus assumes `team-01` to `team-08` and `ground-01` to `ground-08`. Neither the generic import boundary nor the previous random/probability versions may be changed simply to close M0.

## Decision

Publish `packages/data/worlds/fictional-eight-01.json` as the one-time static runtime default, with separate immutable manifest and 12 independently checkable WORLD_GENERATION address vectors. `scripts/generate-fictional-world.py` is an **offline-only** deterministic generator using a six-position SHA256_COUNTER_V1 address `[seed, WORLD_GENERATION, entityId, eventOrdinal, stageName, drawIndex]`; each sampled parameter gets a distinct stage/ordinal namespace, with rejection sampling to eliminate modulo bias. Publication is explicit `--write`; the release acceptance command is `--check`, which compares world, manifest and vectors byte-for-byte in memory.

The fixed seed is `lcxxvi-fictional-eight-v1-20260927`. Team/ground ID conventions follow the accepted Pass 07 planning corpus. Player IDs `p001` to `p160` are disjoint across squads. Names and ratings are **invented**; no real player, licensed roster or calibration dataset is represented. T20/ODI/red-ball profiles are independent synthetic fields. All exposure counters start at zero. The model remains `synthetic-alpha-01`, explicitly `SYNTHETIC_ALPHA`.

**World file hash** means SHA-256 over the complete published UTF-8 JSON file bytes including whitespace and terminal newline. **Canonical world hash** means SHA-256 over the existing LC_CANONICAL_JSON_V1 byte encoder. **Generator source hash** is SHA-256 over the offline Python generator bytes. **Provenance source hash**, stored per player, hashes a canonical descriptor containing the generator version, seed and generator source hash; it must not hash the world itself because that would be a circular dependency. The manifest distinguishes these values. `FROZEN_WORLD_PINS` provides independent code-level expected digests so a world plus rewritten manifest cannot silently replace the accepted world.

Add a separate default-world validator for exact 160/8/8, all-player assignment, keeper/bowler roles, handedness, source/provenance and ground mapping. The existing generic WorldPackSchema and all 88 prior generated schemas remain unchanged. The additive manifest contract is the only new world schema.

## Consequences

This pack is versioned and immutable. Its seed, code, ratings or bytes require a distinct pack ID and explicit compatibility decision. No live match may regenerate or mutate the roster. The accepted default world does not itself implement match fixtures, scorecards or a league. Role-based bowling eligibility means bowlingStyle is non-null AND role is BOWLER or ALLROUNDER. The arbitrary synthetic skill ranges do **not** establish cricket realism, competitive balance or hidden player development.
