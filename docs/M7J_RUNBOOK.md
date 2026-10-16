# M7J reproducibility and promotion boundary

1. Use the Pass 21 / M7I frozen Git baseline (`bc5588831f2e9300c9063a047209544013c6e62b`). The versioned adjudication code is additive to contracts and domain via research-only package subpaths (not their production barrels).
2. Node >=22.12: `npm ci` with the frozen lockfile or pinned offline cache; `npm run schemas:check`; `npm run build`; `npm run typecheck`; `npm run lint`.
3. `npm run m7j:adjudication` verifies the M7I source-addressed register stored in `docs/verification-m7j/LC_M7I_INPUT_REGISTER.json` and regenerates `LC_M7J_ADJUDICATION_REGISTER.json`.
4. For complete inherited Python test reproduction run `npm run m7j:restore-fixtures`; this restores small historical derived reference outputs into git-ignored `reference/m7h/` and `reference/m7i/`.
5. `npm run m7j:test` runs independently authored M7J TypeScript and Python fixtures.
6. Run the inherited Vitest suite in resource-safe shards, and `npm run management:acceptance` for the 56-match season.
7. The source includes a small set of prior research-output reference fixtures for inherited Python regression tests. No complete licensed Cricsheet archive is included.
8. For original-data verification, use the separately supplied Cricsheet `t20s_json.zip` and earlier M7I archive registration scripts. This is a traceability aid, **not** an automatic decision about whether a disputed cricket event is valid.
9. Only an external evidence provider can set `independentlyAdjudicated` and `chronologyConfirmed` after review. Do not set these values merely to make input pass. Confirm source playing conditions and adjudication order.
10. Do not select `LC_T20_EXCEPTION_ADJUDICATION_RESEARCH_V2` as a production match model. Return payload has `gameplayIntegrationPermitted=false` by contract. T20 games use frozen `synthetic-alpha-01`.
11. M6 browser tests still require an authorised Chromium/Firefox host accepting local page navigation; a CLI server probe is not a browser pass.

Cricket Laws evidence and conservative treatment of rare cases: `docs/decisions/ADR-032-M7J-VERSIONED-EXCEPTION-ADJUDICATION.md`.
