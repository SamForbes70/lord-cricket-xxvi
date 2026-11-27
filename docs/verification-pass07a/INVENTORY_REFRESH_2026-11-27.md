# T20 frozen-artefact inventory refresh, 27 November 2026

This follows the first refresh (`INVENTORY_REFRESH_2026-11-25.md`), which explains what the inventory is for. The owner approved this refresh on 27 November 2026 ("merge #172 to #174 and go with your recommendations"), in its own pull request after C6 merged.

## Why

C6 (pull request #174, merged as `976ee76`) added the research-only model `calibrated-t20-02`. As C2 did for `calibrated-t20-01`, it widens five in-memory request schemas to accept the new model id. Request shapes are not persisted formats; no saved-data format changed. After the merge, `node scripts/check-pass07b-inventory.mjs` exited 1 with `FROZEN_INVENTORY_DRIFT packages/contracts/schemas/GenerateDeliveryRequestSchema.json`. Hosted CI does not run this check, so the pull request's CI was green.

## What changed

- `tests/fixtures/t20/current-inventory.json` regenerated with `node scripts/generate-t20-inventory.mjs LC_T20_INVENTORY_REFRESH_2026_11_27 976ee76` on an unmodified tree at that commit. New id `LC_T20_INVENTORY_REFRESH_2026_11_27`, `historicalCommit` `976ee76fe5190653b51afbca91a72ac8cd9c7ad7`.
- `tests/fixtures/t20/pass07a-inventory.json` is unchanged.
- `scripts/check-pass07b-inventory.mjs`: comments only. Its `SUPERSEDED_07A` list is unchanged, because the five schemas are the same five already named in the first refresh. No further Pass 07A file leaves the freeze.

Against the previous current inventory (421 entries each):

| Category | Unchanged | Changed | Added | Removed |
| --- | --- | --- | --- | --- |
| Contract schemas | 404 | 5 | 0 | 0 |
| Data packs, world, fixtures and lockfile | 12 | 0 | 0 | 0 |
| Total | 416 | 5 | 0 | 0 |

The five changed schemas: `GenerateDeliveryRequestSchema`, `NormaliseCategoriesRequestSchema`, `ProbabilityContextSchema`, `ProbabilityRequestSchema` and `SampleCategoryRequestSchema`.

## Verification

| Check | Command | Revision | Result |
| --- | --- | --- | --- |
| Inventory before refresh | `node scripts/check-pass07b-inventory.mjs` | `976ee76` | FAIL (exit 1, `FROZEN_INVENTORY_DRIFT`), as expected |
| Inventory after refresh | same | this branch | PASS (exit 0): 421 artefacts byte-identical, 97 Pass 07A artefacts retained, 409 schemas |
