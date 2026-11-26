# T20 frozen-artefact inventory refresh, 25 November 2026

## What the inventory is for

`npm run t20:inventory` (`scripts/check-pass07b-inventory.mjs`) is the Pass 07B freeze check. It proves that the artefacts inherited from Pass 07A (source commit `98a232dc9ef18108d55cd9b3f2b57f1a16013853`, source ZIP SHA-256 `34e5ed07...6301`) are still byte-identical: the generated contract schemas, the published `fictional-eight-01` world and manifest, the delivery and probability packs, the determinism, generator, probability, scoring and world fixtures, and the lockfile. It also checks that schemas were only added, never removed, and that the world and the 100-seed corpus keep their canonical sizes. `scripts/verify-pass07b.mjs` runs it as its `frozen-07a-artifacts` gate. Hosted CI does not run it.

## Why it was refreshed

On `main` at `4e29882` the check exited 1 for two reasons, neither a change to a frozen engine or fixture:

1. `package-lock.json` no longer matched its Pass 07A hash, because dependencies have changed since Pass 07A.
2. It pinned 98 schema files; `main` now generates 409, every one added through a later pass.

Stage C (pull request #143, merged as `899f911`) then changed five Pass 07A schemas: the in-memory request schemas `GenerateDeliveryRequestSchema`, `NormaliseCategoriesRequestSchema`, `ProbabilityContextSchema`, `ProbabilityRequestSchema` and `SampleCategoryRequestSchema`, which now accept `calibrated-t20-01` as well as `synthetic-alpha-01`. They are request shapes, not persisted formats. The owner approved that merge.

The owner decided to refresh the inventory to today's files in its own small pull request and keep the old copy for the record. The refresh is taken from `main` at `899f911`, after Stage C, so Stage C needs no further refresh.

## What changed

- `tests/fixtures/t20/pass07a-inventory.json` is **unchanged** and retained as the historical Pass 07A record. `scripts/verify-pass07b.mjs` still hashes it as `frozenInventorySha256`.
- New `tests/fixtures/t20/current-inventory.json` (id `LC_T20_INVENTORY_REFRESH_2026_11_25`, `historicalCommit` `899f911163995a79a995a8ca95c212542f04b6d9`), in the same format as the original, covering the same non-schema paths plus every generated schema. It was generated with `node scripts/generate-t20-inventory.mjs LC_T20_INVENTORY_REFRESH_2026_11_25 899f911` on an unmodified tree at that commit.
- `scripts/check-pass07b-inventory.mjs` now reads the current inventory. It also refuses to pass unless the historical file is byte-identical (SHA-256 `9fe78176...2d57`) and every Pass 07A hash, other than the six named in its `SUPERSEDED_07A` list (the lockfile and the five Stage C schemas), appears unchanged in the current inventory. A later refresh therefore cannot quietly drop another Pass 07A file from the freeze; it has to name it. The schema count is read from the inventory instead of being pinned in the script.

Counts, Pass 07A inventory (103 entries) against the current inventory (421 entries):

| Category | Unchanged | Changed | Added | Removed |
| --- | --- | --- | --- | --- |
| Contract schemas | 86 | 5 | 318 | 0 |
| Data packs and world (`packages/data`) | 4 | 0 | 0 | 0 |
| Test fixtures | 7 | 0 | 0 | 0 |
| Lockfile | 0 | 1 | 0 | 0 |
| Total | 97 | 6 | 318 | 0 |

86 of the 91 Pass 07A schemas and all 11 Pass 07A data and fixture files are still byte-identical. The Pass 07A freeze no longer holds for the five Stage C schemas or the lockfile; this refresh records that rather than hiding it.

## Next refresh

Any later change that adds, removes or changes a schema, or changes the lockfile or a listed data or fixture file, makes the check exit 1 again. Regenerate the current inventory on the merged `main` with a new id and that commit, and leave the Pass 07A file untouched.
