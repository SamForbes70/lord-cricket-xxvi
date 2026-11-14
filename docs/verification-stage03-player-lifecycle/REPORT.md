# Verification Report — Stage 3 (`S03-01`): Player Lifecycle & Youth Pathway

- **Date**: 14 November 2026 (Australia/Brisbane)
- **Base revision**: `161e781` (`main` — Stage 2 persistent multi-season world merged and owner-accepted)
- **Active branch**: `feat/stage3-player-lifecycle`
- **Status**: `tested` (awaiting owner review and Stage 3 acceptance before Stage 4 contracts/recruitment)

---

## 1. Delivered Scope (`S03-01`)

1. **Versioned Player Lifecycle Contracts (`packages/contracts/src/player-lifecycle.ts`, `packages/contracts/src/persistent-world.ts`)**:
   - Added explicit version boundaries (`LC_PLAYER_LIFECYCLE_STATE_V1`, `LC_PLAYER_LIFECYCLE_MODEL_FICTIONAL_V1`, `LC_PERSISTENT_WORLD_V2_LIFECYCLE`, `LC_LIFECYCLE_T20_SEASON_SAVE_V1`, `LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V2_LIFECYCLE`, `LC_PERSISTENT_WORLD_PORTABLE_V2_LIFECYCLE`, `LC_PERSISTENT_WORLD_V2_ROLLOVER_RECEIPT_V1`).
   - Added `28` strict AJV 2020-12 JSON Schemas (`235` total JSON Schemas; `231` exported Zod schemas).
   - Explicitly marked lifecycle parameters as `parameterProvenance: "FICTIONAL_GAMEPLAY_PLACEHOLDER"` with `SYNTHETIC_ALPHA` model identity preserved.
2. **Exploit-Proof Separation of Temporary Readiness vs Permanent Progression (`packages/simulation/src/player-lifecycle.ts`)**:
   - Daily training menu edits (`setTrainingDirective`) mutate only active-day directive choices and temporary daily readiness/fatigue recovery.
   - Permanent skill deltas occur **only once** during atomic off-season rollover (`advancePlayerLifecycleAtSeasonClose`), derived deterministically from elapsed calendar training days (`recordElapsedTrainingExposure`), played match appearances, player age vs peak window, hidden development rate/ceiling, and addressed deterministic streams.
   - Repeatedly toggling training menus on the same date produces **bit-identical** exposure ledgers and zero permanent skill drift.
3. **Ageing, Retirement, Preserved Alumni Records, and Youth Academy Pathway**:
   - Players age by `+1` each off-season rollover, with age-weighted retirement hazards above the fictional retirement window while guaranteeing squad minimum (`>= 18`), wicketkeeper minimum (`>= 1`), and bowling-capable minimum (`>= 5`) invariants across all 8 clubs.
   - Each club receives deterministic youth academy prospects (`17`–`20` years old) with configurable `YouthAcademyFocus`, immediate pre-Round-1 promotion (`promoteYouthProspectNow`), or queued off-season graduation (`setYouthPromotionQueue`).
   - Retired players remain permanently inspectable in the **Squad -> Retired Alumni** directory and on **PlayerPage** (`RETIRED`, former club, retirement season/year, preserved career totals, and season-by-season rows).
4. **Crash-Safe V2 Persistence, Replay & Backward Compatibility (`packages/persistence/src/persistent-world.ts`, `packages/persistence/src/archive.ts`)**:
   - Preserved Stage 2 `LC_PERSISTENT_WORLD_V1` and V0.1 single-season `LC_T20_SEASON_SAVE_V1` saves untouched on reload.
   - Added explicit non-destructive upgrade (`upgradeStage2WorldToLifecycleInNewSave`) that copies a Stage 2 V1 world into a new Stage 3 V2 slot while keeping the V1 save intact.
   - Embedded immutable per-season `RosterPack` snapshots on `LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V2_LIFECYCLE` so ball-by-ball replay reconstructs historical matches under the exact ratings active in that season even after players develop or retire.
   - Added `LC_PERSISTENT_WORLD_PORTABLE_V2_LIFECYCLE` `.lcxxvi` export/import round-tripping.

---

## 2. 20-Season Diagnostic Horizon (`LC_PLAYER_LIFECYCLE_MODEL_FICTIONAL_V1`)

Generated deterministically via `runPlayerLifecycleDiagnosticHorizon` (`worldId: "diag-world-20s"`, `baseSeed: "diag-seed-stage3-20-seasons"`, 20 consecutive seasons `2026`–`2045`, final `lifecycleSha256: 551b8516c9afa2e24f1846c5ee926fa7bf2fcb7fff94af8b0848da58d709961e`):

| Metric | Season 1 (`2026`) | Season 10 (`2035`) | Season 20 (`2045`) |
| --- | --- | --- | --- |
| Active players across 8 clubs | `160` | `158` | `159` |
| Cumulative retirements | `0` | `98` | `187` |
| Cumulative youth promotions | `0` | `96` | `186` |
| Club squad size range (`min`..`max`) | `20`..`20` | `19`..`20` | `19`..`20` |
| Min club wicketkeepers | `2` | `2` | `3` |
| Min club bowling-capable players | `9` | `7` | `9` |
| Clubs with role shortages | **`0`** | **`0`** | **`0`** |
| Mean active player age | `27.9` | `26.3` | `26.6` |
| Batting ability (`p10 / median / mean / p90 / max`) | `49 / 63 / 60.7 / 70 / 75` | `52 / 61 / 62.5 / 74 / 78` | `51 / 61 / 61.3 / 74 / 77` |
| Bowling ability (`p10 / median / mean / p90 / max`) | `51 / 62 / 60.6 / 68 / 76` | `55 / 62 / 62.7 / 73 / 77` | `56 / 64 / 62.8 / 70 / 74` |
| Fielding ability (`p10 / median / mean / p90 / max`) | `47 / 54 / 54.1 / 61 / 67` | `50 / 54 / 54.6 / 61 / 71` | `49 / 53 / 53.3 / 58 / 65` |
| Keeping ability (`p10 / median / mean / p90 / max`) | `56 / 63 / 67.6 / 78 / 83` | `64 / 74 / 72.3 / 79 / 79` | `67 / 72 / 72.0 / 77 / 79` |
| Role counts (`BAT / BOWL / AR / WK`) | `72 / 48 / 24 / 16` | `52 / 50 / 26 / 30` | `46 / 60 / 22 / 31` |

Across all 20 seasons (`s = 1..20`), `clubsWithRoleShortage === 0`, `minClubSquadSize >= 18`, `maxClubSquadSize <= 22`, `minClubKeepers >= 1`, and `minClubBowlingCapable >= 5`, with no runaway rating inflation or collapse.

---

## 3. Executed Verification Evidence

| Command | Environment | Actual Result |
| --- | --- | --- |
| `npm run verify:09:core` | Linux container (`Node v24.18.0`, `Python 3`) | **PASS** — `235` JSON Schemas verified, production + runtime Vite builds passed, `tsc -b` + `tsconfig.tools.json` clean, `eslint` + 7 package boundaries passed, `45` scorer fixtures + `29` rejections passed, Python determinism/probability/generator vectors passed, **`740/740` unit tests across `65/65` files passed** (`260.3s`) |
| `MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/player-lifecycle-stage3.spec.ts tests/ui/persistent-world-stage2.spec.ts` | Linux Playwright (`Chromium` + `Firefox`) | **PASS** — `4/4` passed (`8.8m`): Stage 2 V1 + Stage 3 V2 youth academy promotion, 14-round simulation, rollover report, retired alumni inspection, V2 ball-by-ball replay, and `.lcxxvi` archive import |
| `MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/career-copy.spec.ts tests/ui/accessibility-release-audit.spec.ts` | Linux Playwright (`Chromium` + `Firefox`) | **PASS** — `14/14` passed (`37.8s`) |

---

## 4. Compatibility & Remaining Gates

- **Save & replay compatibility**: V0.1 single-season (`LC_T20_SEASON_SAVE_V1`, V1/V3 `.lcxxvi`) and Stage 2 (`LC_PERSISTENT_WORLD_V1`, `LC_PERSISTENT_WORLD_PORTABLE_V1`) saves load, replay, and export under their original schemas without silent migration.
- ** Deferred scope**: Contracts, wages, club budgets, free agents, and recruitment remain deferred to **Stage 4** (gated on owner acceptance of Stage 3).
