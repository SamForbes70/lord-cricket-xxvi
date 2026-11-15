# Stage 6 (`S06-01`): Live Field & Highlight Pacing — Verification Report

- **Date**: `2026-11-15`
- **Base Revision**: `4fa82d8` (`main` — Stage 5 merged & owner-accepted)
- **Active Branch**: `feat/stage6-live-field`
- **Slice Status**: `accepted` (owner-accepted 15 November 2026; merged to `main`)
- **Contract Version**: `LC_FIELD_PRESENTATION_V1` (`292` strict AJV 2020-12 JSON Schemas)

---

## 1. Scope Delivered

1. **Committed-Event Presentation Adapter (`packages/projections/src/field-presentation.ts`)**:
   - Pure, deterministic `projectFieldPresentation` over committed match snapshots and delivery events across `T20`, `ODI`, and `RED_BALL`.
   - Named fielding geometry across 9 standard tactical cricket positions (`SLIP`, `GULLY`, `POINT`, `COVER`, `MID_OFF`, `MID_ON`, `MID_WICKET`, `FINE_LEG`, `THIRD_MAN`), plus `KEEPER` and `BOWLER`, mirrored accurately for `RHB` and `LHB` striker handedness.
   - Format-aware legal-placement status (`powerplayRestrictionActive`, `currentInfieldCount`, `minimumInfieldRequired`, `maximumOutfieldAllowed`, `presets` with `legal` flags and plain-language `illegalReason` disclosures).
   - Illustrative highlight cue extraction (`FOUR`, `SIX`, `WICKET`, `CHANCE`, `DOT`, `RUNS`) using an isolated FNV-1a presentation seed (`derivePresentationJitterPermille`) that never touches authoritative engine RNG streams, explicitly labelled `ILLUSTRATIVE_SECTOR_AND_LENGTH` (`0` invented measured ball speed, distance, or tracking coordinates).
   - Pacing gate helper `shouldAnimateDeliveryHighlight(mode, reducedMotion, cue)` supporting `EVERY_BALL`, `KEY_MOMENTS`, and `FAST`, plus OS/user `reducedMotion` suppression.
2. **Responsive SVG Live Field & Accessible Controls (`apps/web/src/match/LiveFieldPanel.tsx`)**:
   - Responsive 2D SVG ground (`viewBox="0 0 320 320"`) rendering boundary rope, 30-yard circle, pitch strip, striker/non-striker creases, handedness orientation labels (`OFF SIDE` / `LEG SIDE`), named fielder markers (`IN` / `OUT` rings), and illustrative ball trajectory overlays.
   - Keyboard-accessible preset buttons (`Attacking`, `Balanced`, `Defensive`) with disabled/illegal-reason feedback during powerplays alongside full keyboard focus and `aria-live="polite"` highlight narration.
   - Highlight pacing selector (`Every ball`, `Key moments`, `Fast / skip`) and `Reduced motion` checkbox persisted in local UI preferences across Match Header and Career Settings.
   - Static fallback path when sector/length telemetry is absent (`hasSectorData: false`, `trajectoryPath: "NONE"`) without fabricating ball paths.
3. **Decision-Stop & Cancellation Preservation (`apps/web/src/match/controller*.ts`)**:
   - Highlight pacing runs purely as a bounded visual cadence between committed worker steps while preserving immediate cancellation (`cancelAuto`) and authoritative decision stops (`BOWLER_SELECTION`, `INNINGS_BREAK`, `DECLARATION`, `FOLLOW_ON`, `NEW_BALL`, etc.).

---

## 2. Verification Evidence

| Command | Environment | Actual Result |
| --- | --- | --- |
| `npm run verify:09:core` | Linux container (`Node v24.18.0`, `Python 3`) | **PASS** — `292` JSON Schemas verified, Vite production + runtime bundles built, `tsc -b` + `tsconfig.tools.json` clean, `eslint` + all 7 package/ambient boundaries passed, `45` scorer fixtures + `29` rejections matched, Python determinism/probability/generator vectors passed, and **`755/755` unit tests across `68/68` files** (`314.7s`) |
| `MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/field-presentation-stage6.spec.ts tests/ui/tactical-briefing-stage5.spec.ts tests/ui/tactical-formats.spec.ts tests/ui/accessibility-release-audit.spec.ts` | Linux Playwright (`Chromium` + `Firefox`) | **PASS** — `12/12` (`59.9s`), covering RHB/LHB orientation, powerplay legality feedback, keyboard preset controls, highlight pacing (`EVERY_BALL`, `KEY_MOMENTS`, `FAST`), `reducedMotion`, and zero horizontal overflow at `150%` zoom |

---

## 3. Save, Replay & Determinism Invariants

- Verified in `tests/unit/field-presentation-stage6.test.ts` that running identical `T20`, `ODI`, and `RED_BALL` matches under `EVERY_BALL`, `KEY_MOMENTS`, `FAST`, and `reducedMotion: true/false` produces byte-identical `lastEventHash`, `scorecardSha256`, and `eventsSha256`.
- All V0.1 single-season saves, Stage 2–4 persistent-world saves (`V1`–`V3`), `.lcxxvi` archives, and exhibition match saves remain unchanged.

---

## 4. Remaining Human Acceptance & Known Limitations

- **Human playtest & owner Stage 6 review**: Observe highlight pacing feel (`EVERY_BALL` vs `KEY_MOMENTS` vs `FAST`) alongside the Stage 5 tactical playtest protocol.
- **Illustrative geometry**: Highlight paths represent committed `ScoringSector` + `DeliveryLength` + deterministic presentation jitter (`ILLUSTRATIVE_SECTOR_AND_LENGTH`), not Hawk-Eye physics tracking.
