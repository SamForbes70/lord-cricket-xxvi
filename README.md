# Lord Cricket XXVI | Pass 08 / M3 interactive T20

A manual, browser-based fictional T20 exhibition on the accepted Pass 07B deterministic engine. Choose two teams, select each XI, nominate captains and keepers, call the toss, choose innings, select every incoming batter and bowler, set supported tactics, and finish both innings. One worker owns the match. Both sides are manually controlled; no tactical opponent AI is supplied.

**Model status: SYNTHETIC_ALPHA.** Custom game rules, no certified ICC compliance or empirical realism. Original approved world: 160 players, eight squads and eight grounds. The separate Sam Forbes fantasy pack is not included or silently applied. DLS, ODI/red-ball, league/training and durable saving remain unavailable.

## Run

With Node 22.12 or later:

```sh
npm ci
npm run build
npm run dev
```

Open the local URL printed by Vite. Use the normal page, not `/engineering.html`, which retains the historical contract-check shell. The separate **Playable Build** archive includes precompiled assets and a dependency-free Node server: extract it and run `node start.mjs`, then open `http://127.0.0.1:4180`.

## Play one match

1. Review the two suggested XIs or select replacements. Keep exactly 11, an eligible keeper, a captain and at least five bowlers in each XI.
2. Confirm the teams, call heads or tails and choose bat/bowl for the toss winner.
3. Select opening batters and a bowler. Change aggression, bowling effort/line/length or named field if desired. Only stock variation is supported.
4. Use **Next delivery** or **Finish over**. Respond to the next-decision prompt after wickets and completed overs. Disabled players show why they cannot be selected.
5. At the result, review both innings and choose **Verify replay and scorecard**. Change commentary/layout/scale and verify again; event and scorecard hashes should match.

Keyboard: Tab and Shift+Tab move between controls; Enter activates buttons; Space toggles XI checkboxes; arrow keys change select values. The next decision receives focus when the match phase changes. Text scale supports 100%, 125% and 150%. Reduced-motion preferences are respected.

**This is a session-only build.** Reloading or closing loses the match. Save remains disabled until M4 passes its own crash/replay acceptance tests. Do not interpret a completed match or successful in-memory replay as durable storage.

## Verification

```sh
npx playwright install chromium firefox
npm run verify:07b
npm run test:ui
```

`verify:07b` reruns all 16 inherited gates and 10 M2 gates, including the full 100-match Node/Chromium/Firefox page-and-worker corpus. `test:ui` exercises production UI keyboard completion, display changes, scorecard/event replay identity, responsive/150%/reduced-motion/long-name layouts, setup validation and visible field rejection in both browsers.

See `docs/verification-pass08`, `docs/decisions/017-m3-worker-owned-human-session.md`, and the Pass 08 report. Automated browser navigation is recorded explicitly as automation, not an invented human playtest. The final human acceptance record is completed by a person playing a whole match without developer tools.

## Architecture and boundaries

- `apps/web/src/match`: strict revisioned UI protocol, private worker controller and public projection.
- `apps/web/src/main.tsx`: public view rendering and form drafts; no gameplay random calls or independent match state.
- `packages/simulation`: unchanged `LC_T20_MATCH_V1` engine and replay.
- `packages/domain`, `packages/contracts`, `packages/data`: unchanged scorer, 98 generated schemas, frozen rules/model/stage and world.
- `apps/batch`: inherited headless CLI; fixture autopilot remains separate from human commands.
- `tests/ui` and `tests/unit/match-ui.test.ts`: additive M3 evidence.

Repository provenance is a verified source archive import of accepted commit `04fac1b7c9c66ea4807b28dda6026e546cb2a5ae`, not a clone containing that commit's original git history.
