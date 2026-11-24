# Project Pavilion, P01: gameplay audit and baseline

24 November 2026. Audited revision: `main` at `60459d77c3816a6ba2f024c58bd5c15393a51093`.

This is the evidence baseline for Project Pavilion. It records what a player meets today, measured where it could be measured, and turns that into a ranked backlog. It is not evidence that the game is enjoyable: nothing here was played by a person. Every statement about feel is labelled [Inference] and has to be checked by the human playtest in P16 (and earlier, by the short playtest in backlog item B0).

## 1. How this was measured

| What | Command or method | Result |
| --- | --- | --- |
| Build of the audited revision | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b`; `npm run build` | PASS, exit 0 both |
| Scripted quick match, played as a cooperative player | [scripts/pavilion-measure-quick-match.mjs](../../scripts/pavilion-measure-quick-match.mjs) against `vite preview` on port 4180, Chromium at 1366 by 768. Policy: keep sound off, Quick match, call heads, take every "Recommended" choice, press "Finish over" whenever the ball is ready | [p01/measure-main-60459d7.json](p01/measure-main-60459d7.json) |
| T20 scoring level | `LCXXVI_CORPUS_DIR=<scratch> npm run corpus:node` (the 100-match Pass 07B corpus, fixture autopilot, `synthetic-alpha-01`), then a summary of `node-corpus-oracle.json` | PASS, 100 of 100 replayed and resimulated |
| Career entry | Scripted: title screen, Career, choose Aster Harbour, read the clubhouse | Text and screenshot reviewed |
| Screens | Screenshots in [p01/](p01/), reviewed by the auditor | See section 3 |

NOT RUN: Firefox (not installed in this container); ODI and five-day scoring levels; a multi-season career; any human player. The career audit covers the entry and first clubhouse only.

## 2. Measured baseline

### 2.1 One quick match, start to finish

| Measure | Value |
| --- | --- |
| Clicks from the title screen to the first ball | 7 |
| Time from the title screen to the toss | 1.9 s |
| Selection prompts answered (batter or bowler) | **57**: 19 batters, 38 bowlers |
| "Finish over" presses | 51 |
| Total clicks to finish the match | **112** |
| Match screen height at the toss | 2.2 screens, 16 visible buttons, 15 sections |
| Match screen height at the result | 15.4 screens |
| Result | Copper Vale 97 all out beat Aster Harbour 78/7 by 19 runs |

The cause of the 57 prompts: a quick match starts with "Manual decisions for both teams". The player chooses every batter and bowler for **both** sides, including the side they are meant to be playing against. Career, scenario and tournament matches already hand the other side to the tactical captain; quick match and the guided first match did not.

### 2.2 T20 scoring level (100 matches, fixture autopilot)

| | First innings | Second innings |
| --- | --- | --- |
| Mean runs | 83.2 | 73.2 |
| 10th / 50th / 90th percentile | 61 / 83 / 107 | 51 / 76 / 93 |
| Highest | 130 | 108 |
| Mean wickets | 8.2 | 7.1 |
| All out | 33 of 100 | 27 of 100 |
| Runs per over | 4.34 | 4.30 |

The chasing side won 54 of 100; the median margin between the two totals was 4 runs, and 67 of 100 matches finished within 10 runs.

For comparison, ESPNcricinfo reported the men's T20 World Cup 2024 overall run rate as 7.09 runs an over, the lowest at any men's T20 World Cup ([ESPNcricinfo, 2024](https://africa.espn.com/cricket/story/_/id/40466849/t20-world-cup-2024-20-numbers-including-jasprit-bumrah-virat-kohli-mohammad-amir-henrich-klaasen-afghanistan)). The game's T20 runs at about 61 percent of the lowest recent tournament rate. The game declares itself a fictional synthetic model, so this is not a defect in a claim it makes; it is a gap against the "recognisably cricket" and "statistical authenticity" pillars, and it was already raised in the 22 November handover as an open owner question.

[Inference] The tight margins are partly a product of the low scoring: when totals sit between 60 and 110, a few boundaries swing a match. Raising the scoring level may widen margins, so P04 has to measure drama (close finishes, lead changes) as well as totals.

## 3. Experience audit (one player's path)

Findings are ordered by how early a player meets them. Each names the pillar it hurts.

| # | Finding | Evidence | Pillar |
| --- | --- | --- | --- |
| F1 | Quick match makes the player captain both sides. 57 selection prompts, half of them for the opposition, which also removes the sense of an opponent | Section 2.1 | Tactical agency, tension |
| F2 | Even captaining one side, the player picks the bowler every over and the batter at every wicket. These are real decisions early, but by the 15th over most are routine | After the F1 fix: 12 bowler and 11 batter prompts in a 20-over match ([p01/measure-p03a.json](p01/measure-p03a.json)) | Agency (decision fatigue) |
| F3 | T20 totals near 80 and a third of innings all out | Section 2.2 | Authenticity, immersion |
| F4 | Settings sit in the middle of play. Between the decision panel and the match detail the player passes text scale, commentary, layout, briefings, the tactical captain control and the delegation panel | [p01/match-toss.png](p01/match-toss.png) | Presentation |
| F5 | Engineering precision in the player's view: "Seam 61.77/100", "Spin 65.32/100", "Wear 0 pts", and "Moisture, bounce variability and outfield speed have no effect in the current model" on the clubhouse pitch card | Screenshot and career text | Presentation, immersion |
| F6 | The result is not a moment. At match end the screen still shows five disabled advance buttons, "Awaiting selection" for batter and bowler, and a heading that tells the player to review the scorecard; the page is 15 screens long | [p01/match-complete.png](p01/match-complete.png) | Drama, emotional reward |
| F7 | Pace has two extremes. Ball by ball or over by over is slow; "Finish match" skips the match. A quick match has no middle path that plays the key moments (the captain's highlights exist but sit in a panel lower down) | Controls on [p01/match-mid-innings.png](p01/match-mid-innings.png) | Tension, respect for the player's time |
| F8 | The ball-by-ball presentation is strong: a broadcast scorestrip, the ball call ("FOUR"), an over strip, a projected total ("On course for 160 at this rate"), batters and bowler with portraits | [p01/match-mid-innings.png](p01/match-mid-innings.png) | Strength to keep |
| F9 | The career clubhouse gives a clear next action ("Play match" or "Simulate match"), an opponent card, players to watch, a plain-language pitch verdict and a board objective | Career text in section 1 | Strength to keep |
| F10 | The projected total can mislead: "On course for 160" at 16/1 after two overs, in a model whose median first innings is 83 | Section 2.2 and the mid-innings screenshot | Authenticity |

## 4. Prioritised backlog

Ranked by value to the player divided by risk. "Owner" means the item needs an owner decision before it is built.

| Rank | Item | Phase | Finding | Size | Owner |
| --- | --- | --- | --- | --- | --- |
| B0 | Short human playtest of the current build: two or three people, first 30 minutes, no help, notes on where they stall | P01 / P16 | All | Small | Yes: who plays |
| B1 | **Quick and guided matches give the other side to the computer captain** | P03 | F1 | Small | No. **Built: draft PR on branch `pavilion/p03a-quick-match-opponent`** |
| B2 | Routine selections made for the player: the computer captain picks routine bowlers and batters, and the player is asked only at key moments (new spell, death overs, a set batter out). Uses the existing delegation journal; the player can switch it off | P03 | F2 | Medium | No |
| B3 | A result moment: replace the advance bar at match end with the result, the player of the match, the turning point (the E1 match report exists) and "What next" actions | P02 | F6 | Small | No |
| B4 | Move match settings (text scale, commentary, layout, briefings, tactical captain, delegation) into one "Match settings" drawer, out of the play column | P02 | F4 | Small | No |
| B5 | Player-facing rounding and wording: whole numbers for pitch indices, and model limitations moved to the About panel | P02 | F5 | Small | No |
| B6 | "Play key moments" pace for quick matches: simulate routine overs, stop for wickets, milestones, the death overs and close chases (generalising the captain's highlights) | P03 | F7 | Medium | No |
| B7 | Projected total from the model's own scoring distribution, not the current run rate | P05 | F10 | Small | No |
| B8 | T20 scoring calibration proposal: the target level per format, the method, before-and-after distributions and the determinism impact | P04 | F3 | Large | **Yes**: changes simulation results |
| B9 | Win probability and opposition intelligence in the match view, from pure projections | P05 | | Medium | No |
| B10 to B16 | P06 to P15 as briefed (animation, commentary and sound, personalities, scouting, reputation, news, almanac, scenarios, connected competitions, honours), each to be scoped after B0 | P06 to P15 | | Large | Per item |

Order of work proposed: B1 (done), then B3, B4 and B5 together as one presentation PR, then B2, then B6. B8 waits for a written owner decision. B0 should happen as soon as the owner can arrange it, because it is the only item that measures fun.

## 5. First improvement: B1 measured

Same script, same policy, on the B1 branch (head `fa91bd1`):

| Measure | `main` 60459d7 | B1 |
| --- | --- | --- |
| Selection prompts | 57 | 23 |
| Total clicks | 112 | 67 |
| Clicks to the first ball | 7 | 6 |

The two runs are different matches. The toss falls differently between runs, and the computer captain picks differently from the "Recommended" choices the script takes, so the scores are not comparable. The prompt count is: it falls because the player no longer answers for the opposing side.

## 6. Constraints kept

No simulation, contract, persisted format or determinism change. Presentation does not draw from the simulation random stream: B1 only chooses which side the existing tactical captain plays, which is the same setting the player can already change in the match, and which career matches already use.
