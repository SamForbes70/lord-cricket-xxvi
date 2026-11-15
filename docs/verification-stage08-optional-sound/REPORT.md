# Stage 8 Verification Report — Optional Sound and Narration (`S08-01`)

- **Date**: 2026-11-16
- **Base Revision**: `3762ed3` (`main` — Stages 2, 3, 4, 5, 6 & 7 merged and owner-accepted)
- **Branch**: `feat/stage8-sound-narration`
- **Slice ID**: `S08-01`
- **Status**: `accepted` (owner-accepted 16 November 2026; merged to `main`; subjective multi-user listening tests remain unrecorded in-repo)

---

## 1. Scope Delivered

1. **Contracts (`packages/contracts/src/audio.ts`, `+10` strict JSON Schemas; `309` total)**:
   - `AudioChannelSchema` (`CROWD`, `EFFECTS`, `COMMENTARY`, `INTERFACE`).
   - `AudioCueKindSchema` (`BAT_BALL_DOT`, `BAT_BALL_SINGLE`, `BOUNDARY_FOUR`, `BOUNDARY_SIX`, `WICKET_FALL`, `MILESTONE_CHIME`, `OVER_BELL`, `INNINGS_CHANGE`, `MATCH_COMPLETE`, `UI_CLICK`).
   - `AudioAssetOriginSchema` (`ORIGINAL_PROCEDURAL_SYNTH`, `ORIGINAL_IN_REPO_PCM`) and `AudioAssetProvenanceSchema` (`license: "MIT_ORIGINAL_LORD_CRICKET_XXVI"`, `sha256`, synthesis profile, duration).
   - `AudioProvenanceManifestSchema` (`LC_AUDIO_PROVENANCE_V1`, `networkCallsAllowed: false`).
   - `AudioPreferencesSchema` (`LC_AUDIO_PRESENTATION_V1`: `muted`, `crowdVolume`, `effectsVolume`, `commentaryVolume`, `interfaceVolume`, `narrationEnabled`, `captionsEnabled`).
   - `AudioCueSchema`, `AudioCueQueueSchema`, and `AudioPlaybackDecisionStatusSchema` (`PLAYED`, `QUEUED_AWAITING_GESTURE`, `DEDUP_SKIPPED`, `EXPIRED_FAST_FORWARD`, `MUTED_OR_ZERO_VOLUME`, `BACKGROUND_TAB_SUPPRESSED`, `MISSING_ASSET_FALLBACK`, `DECODE_FAILED_FALLBACK`).
   - Browser CSP-safe Zod wrapper (`packages/contracts/src/zod-browser-csp.ts`).
2. **Pure Cue Projection & Original Provenance Manifest (`packages/projections/src/audio-cues.ts`)**:
   - `ORIGINAL_AUDIO_PROVENANCE_MANIFEST` (`LC_AUDIO_PROVENANCE_V1`): 10 original procedural synthesis profiles (`MIT_ORIGINAL_LORD_CRICKET_XXVI`, deterministic `pureSha256Hex` checksums, `0` third-party sound recordings or network streams).
   - `projectAudioCuesFromCommentary` & `selectDispatchableAudioCues`: projects committed commentary entries (`T20`, `ODI`, `RED_BALL`) into prioritized audio cues with TTLs, deduplication by `cueId` / sequence watermark, and fast-forward expiry (`DEFAULT_FAST_FORWARD_BATCH_THRESHOLD = 2`), choosing the highest-priority remaining cue while expiring stale bursts.
3. **Resilient Client Audio Manager & UI (`apps/web/src/match/audio-manager.ts`, `AudioControlsPanel.tsx`, `main.tsx`, `CareerApp.tsx`, `controller.ts`, `controller-odi.ts`, `controller-red5.ts`, `styles.css`)**:
   - `CricketAudioManager`: gates Web Audio & `speechSynthesis` strictly behind `unlockFromUserGesture()`, persists preferences (`lcxxvi-audio-preferences`), seeds committed history on reload (`seedCommittedHistory`) so prior balls do not replay, suppresses playback in hidden/background tabs (`getVisibilityState() === "hidden"`), honours mute and zeroed channel sliders, and degrades cleanly to live ARIA captions on missing assets, decode errors, or absent Web Audio.
   - `AudioControlsPanel`: Match Header `Sound: On/Muted`, `Audio mixer & provenance` drawer (Crowd / Effects / Commentary / Interface sliders, optional spoken narration toggle, live captions toggle, and full `LC_AUDIO_PROVENANCE_V1` attribution manifest table) + mirrored audio preferences in **Career Settings**.

---

## 2. Verification Executed

| Command | Environment | Actual Result |
| --- | --- | --- |
| `npm run verify:09:core` | Linux container (`Node v24.18.0`, `Python 3`) | **PASS** — `309` JSON Schemas, Vite production + runtime builds, `tsc -b` + `tsconfig.tools.json`, `eslint` + 7 package boundaries, `45` scorer fixtures + `29` rejections, Python vectors, and **`765/765` unit tests across `70/70` files** (`293.7s`) |
| `MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/audio-stage8.spec.ts tests/ui/commentary-stage7.spec.ts tests/ui/accessibility-release-audit.spec.ts` | Linux Playwright (`Chromium` + `Firefox`) | **PASS** — `6/6` (`30.1s`) |

---

## 3. Save, Replay & Simulation Non-Interference

- Verified in `tests/unit/audio-stage8.test.ts` that running identical `T20` matches across muted, unmuted + spoken narration, failed-decode fallback, and fast-forward configurations leaves `eventsSha256`, `scorecardSha256`, `lastEventHash`, and `revision` byte-identical with `fetchCount === 0`.
- Authoritative worker kernels, random-stream addresses, integer probability LUTs, V0.1 single-season saves, Stage 2–4 persistent-world saves (`V1`–`V3`), and `.lcxxvi` archives are untouched.
