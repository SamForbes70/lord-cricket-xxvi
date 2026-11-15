# Stage 5 Observed Playtest Protocol — Tactical Briefings & Feedback (`LC_TACTICAL_BRIEFING_V1`)

## Purpose & Scope

This protocol defines the structured human discovery playtest introduced with **Stage 5 (`S05-01`: Make tactical decisions understandable)**. It evaluates whether pre-match briefings, plain-language tactical control trade-offs, contextual legal presets, and post-spell factual plan-vs-outcome summaries make selection and in-match captaincy decisions understandable without claiming unmeasured retention gains or empirical cricket realism.

- **Target discovery cohort**: `8–12` participants (`4–6` experienced cricket-management players + `4–6` cricket fans unfamiliar with the Lord Cricket XXVI interface).
- **Nature of study**: Qualitative usability and tactical comprehension discovery sample (not statistical market validation).
- **Engine & presentation boundary**: Production gameplay remains `synthetic-alpha-01` / `SYNTHETIC_ALPHA`. Presets submit existing legal worker commands (`SET_BATTING_PLAN`, `SET_BOWLING_PLAN`, `SET_FIELD`) with **zero** hidden statistical bonuses; toggling `Tactical briefings` (`Shown` / `Hidden`) leaves match revisions and event hashes unchanged.

---

## Quantitative & Qualitative Observation Sheet (Record Per Participant)

Record the following measures verbatim during silent observation before asking debrief questions:

| Measure | How to Record | Baseline / Observation Notes |
| --- | --- | --- |
| **Time to first meaningful tactical decision** | Seconds from match `TOSS` / setup load to first intentional XI change, preset application, or custom plan adjustment | Do not impose an arbitrary pass/fail second threshold before measuring baseline cohort |
| **Unexplained controls encountered** | Count + control names where the participant hesitates, hovers repeatedly, or asks what a control does | Track whether the participant opens `Plain-language tactical control trade-offs (7 controls)` |
| **Repeated / redundant clicks** | Count of repeated clicks on disabled buttons, already-active presets, or blocked bowling candidates | Note whether `advance-reason` or candidate `reason-*` text resolved confusion |
| **Abandoned matches** | Count + exact match phase (`Setup`, `Powerplay`, `Middle overs`, `Chase`, `Red-ball session`) and stated reason | Never force completion if a participant wants to stop |
| **Save-recovery success** | Pass/Fail when reloading mid-over (`F5`) and exporting/re-importing `.lcxxvi` | Confirm spell/stint reviews and delegation state survive reload |
| **Post-task tactical explanation** | Ask participant to explain *why* they chose one bowling/field plan and what trade-off they accepted | Check whether they cite factual pitch/phase/fatigue cues vs invented hidden buffs |
| **Memorable moment recall** | Ask participant at session end to describe one specific ball, wicket, chase turn, or spell | Record verbatim |

---

## Scenario 1 — Pre-Match Selection & Venue Reading (10 min)

1. Open **Career** (`/#career`), start a new club career, and stay on **Home** (or **Fixtures**).
2. Ask the participant to prepare for Round 1 without coaching them on which controls to open.
3. **Observe**:
   - Do they open **Pitch inspection** and **Pre-match tactical briefing**?
   - Can they identify the surface profile (`Seam-leaning`, `Spin-leaning`, or `Balanced`), squad readiness/fatigue counts, and opponent recent results?
   - Navigate to **Exhibition** (`/#exhibition`), switch grounds and formats (`T20` -> `ODI` -> `RED_BALL`), and ask them to pick an XI suited to a spin-leaning ground.
4. **Debrief prompt**: *"What did the pre-match briefing tell you about this ground and your XI balance, and what did you change as a result?"*

---

## Scenario 2 — Pacing a Second-Innings T20 Chase (15 min)

1. Start a `T20` match (`/#exhibition`), set the opponent to **AI controlled** via `Tactical captain`, bowl or fast-forward (`Finish innings`) through Innings 1 so the participant bats second chasing a concrete target.
2. Ask the participant to manage the batting side through at least the **Powerplay (Overs 1–6)** and **Death overs (Overs 17–20)** using any combination of:
   - Individual batting controls (`Aggression 0..4`, `Batting intent`),
   - **Contextual tactical presets** (`Watchful anchor`, `Rotate the strike`, `Powerplay boundary push`, `Measured acceleration`, `Final-overs launch`), or
   - Partial **Delegate individual decisions**.
3. **Observe**:
   - Do `Situational fit` badges highlight relevant chase presets when required rate climbs above `9.50` rpo or wickets fall early?
   - After 3–4 overs, open **Batting plan stints vs outcomes** and observe whether the participant understands their recorded strike rate, dot balls, singles, and boundaries beside their chosen aggression/intent.
4. **Debrief prompt**: *"Explain one batting tactical change you made during the chase and what risk you accepted when making it."*'

---

## Scenario 3 — Bowling a Defensive / Wicket-Hunting Spell & Reviewing Plan vs Outcome (15 min)

1. Start or continue a match where the participant controls the **bowling side** manually (`Manual decisions for both teams` or human bowling vs AI batting).
2. Ask the participant to bowl a 2-to-3 over spell with one frontline bowler, choosing an explicit plan (either via **Contextual tactical presets** such as `Disciplined channel` + `Boundary protection` / `Powerplay wicket-hunting`, or manual length/line/effort/field sliders).
3. Midway through Over 2, ask the participant to **reload the browser page** (`F5`) and continue.
4. At the end of Over 2, ask them to inspect **Spell plan vs factual outcomes**.
5. **Observe**:
   - Can they read the accepted plan (`length · line · effort`, `ring / deep · slips`) alongside recorded figures (`overs · W/R`, `Econ`, `dots`, `boundaries`) and factual landing/contact counts (`X/Y on intended length`, `GROUND / AERIAL / EDGE / NO_CONTACT`, `STOP / CATCH / DROP`)?
   - Do they understand that an expensive over under a disciplined plan reflects delivery variance and batter contact rather than a broken control?
   - Toggle **`Tactical briefings` -> `Hidden`** in the top preference bar to confirm experienced players can declutter the screen cleanly.
6. **Debrief prompts**:
   - *"Did your bowler's recorded outcomes match what you hoped for with that plan? How did you decide whether to keep the plan or change bowler/field?"*
   - *"What was the single most memorable moment from the three scenarios, and what was the single most confusing screen element?"*

---

## Consolidation Into Stage 16

Store completed anonymised session notes under `docs/playtests/stage05/` (one Markdown/JSON record per session) and feed the top three observed usability or comprehension obstacles into **Stage 16 (Product-quality acceptance)**.
