# Accessibility Release Audit (V01-026)

This audit records automated browser verification across Chromium and Firefox alongside the remaining human assistive-technology observations required before final V0.1 acceptance. No human metadata or screen-reader observations are fabricated.

## 1. Automated Browser Verification

Verified in both Chromium and Firefox via `tests/ui/accessibility-release-audit.spec.ts` and `tests/ui/match.spec.ts`:

| Check | Scope | Browser coverage | Status |
| --- | --- | --- | --- |
| Keyboard Tab navigation and focus order | `#exhibition` setup, live `#decision` match strip, `#career` management screens | Chromium, Firefox | PASS |
| Visible focus indicator | Active interactive controls expose a non-zero computed outline or focus ring without focus traps | Chromium, Firefox | PASS |
| WCAG AA contrast (`>= 4.5:1`) | Programmatic relative-luminance check across primary headings, body copy and enabled action buttons | Chromium, Firefox | PASS |
| Screen-reader semantics and labels | `<main>` landmark, `#decision` `aria-busy` state, status live regions, and zero unlabelled visible interactive controls | Chromium, Firefox | PASS |
| `150%` text scale and vertical budget | `next-delivery` and `Finish over` remain inside a `1366x768` viewport at `150%` text scale in both browsers | Chromium (`743.59 px`), Firefox (`758.20 px`) | PASS |
| `200%` browser zoom (`683x384` CSS viewport) | No horizontal overflow (`scrollWidth <= clientWidth + 4`) and `#decision` remains visible and operable | Chromium, Firefox | PASS |
| Long-name and narrow-layout checks | Extreme player/team names and `900x768` narrow career/match layouts without horizontal clipping | Chromium, Firefox | PASS |
| Reduced motion | `prefers-reduced-motion: reduce` honoured in match UI | Chromium, Firefox | PASS |

## 2. Remaining Human Observations (Not Fabricated)

Automated DOM and computed-style checks cannot substitute for a human listening to real assistive technology on physical operating systems. The following checks remain `PENDING_HUMAN_OBSERVATION`:

| Human check | Target environment | Current status | Notes |
| --- | --- | --- | --- |
| NVDA speech output walkthrough | Windows 11 + Edge or Firefox + NVDA | `PENDING_HUMAN_OBSERVATION` | Verify spoken order of live delivery updates, batter/bowler candidate buttons, and safe-update status announcements. |
| VoiceOver speech output walkthrough | macOS + Safari or Chromium + VoiceOver (optional secondary check) | `PENDING_HUMAN_OBSERVATION` | Verify rotor landmarks and scorecard table navigation. |
| Physical `200%` and `400%` browser zoom comfort | Owner Windows PC | `PENDING_HUMAN_OBSERVATION` | Confirm comfortable reading flow during a full managed career fixture. |
