# Player identity V1 (`LC_PLAYER_IDENTITY_V1`)

Entertainment track, first slice, 26 November 2026. The owner's measure of success includes that a player "becomes attached to individual cricketers"; the owner approved starting with distinctive player identities in the eight-club T20 career. This slice is **implemented** on the branch `pavilion/player-identity`. It is not integrated, human tested or accepted, and it makes no claim about enjoyment.

It builds on what was already there: the portraits and overall rating (`apps/web/src/world/player-visuals.ts`), the E6 squad tags, form and milestones (`packages/projections/src/player-identity.ts`) and the Stage 11 story cards (`packages/projections/src/career-stories.ts`).

## What the player sees

- **Squad list.** Each player has a gold playing-style tag next to their name, such as "Finisher", "Anchor", "Miserly off-spinner" or "Specialist keeper". The E6 tags, form and milestones are unchanged.
- **Selection room** (Home, on match day). Both options in "Who takes the spot?" carry their style tag, so the choice is between two kinds of cricketer, not two names.
- **Player page.** A "Who they are" panel under the hero card:
  - the primary style, and a secondary style when earned (for example an off-spinner who is also an accumulator);
  - one line naming the T20 ratings behind each style, such as "Finisher (power 74, strike rotation 66)";
  - **Story so far**: one paragraph from the recorded career, such as "21 league matches across 2 seasons, now with Aster Quay. 468 runs, best of 77 not out, 3 fifties. Latest scores, oldest first: 9, 0, 41*, 12, 30. Player of the Match 2 times. 32 runs from 500 career runs.";
  - two personality traits under the heading "Personality · flavour, not a rating".
- **Match screen** (T20). Each batter and the bowler in the active-players panel has a small chip in their own row. Before a batter faces a ball it reads "Walks out: *style*", and before a bowler bowls in the innings "On to bowl: *style*"; after that it shows the style alone. The full introduction, such as "New at the crease: Vero Jorcroft, Accumulator (strike rotation 77).", is the chip's title and its screen-reader text. The chip sits inside the row because the first screen at 1366 by 768 had no room for extra lines (the dugout-view and match specs measure it).

## How identity is derived

All of it is a pure function in `packages/projections/src/player-identity-v1.ts`. Nothing is saved, so no persisted format changes and the same save always shows the same identity.

| Part | Source | Rule |
| --- | --- | --- |
| Batting style | T20 ratings | Six named styles, each with minimum ratings (`PLAYING_STYLE_RULES`, `BATTING_STYLE_TABLE`). Of the styles a player meets, the one with the widest margin wins: its weakest needed rating is furthest above its minimum. Ties keep table order. A batter who meets none is an "All-purpose batter". |
| Bowling style | Bowling type (fast, medium, off-spin, leg-spin, left-arm orthodox, left-arm wrist) and T20 ratings | Three named styles per family (pace, wrist spin, finger spin), each needing control, movement or variation of 65 or more, chosen by the same margin rule. A bowler who meets none keeps the plain name of their type, such as "Leg-spinner", with no rating claimed. |
| Keeper | Role and keeping rating | "Specialist keeper" at keeping 70 or more, otherwise "Keeper-batter"; the batting style, if earned, is secondary. |
| Which is primary | Role and ratings | Batters and keepers lead with batting or keeping; bowlers with bowling; all-rounders with whichever of the batting and bowling averages is higher (the same averages as the hero card). |
| Personality | Player id only | Two different traits from a list of twelve, chosen by an FNV-1a hash of `LC_PLAYER_IDENTITY_V1:<playerId>`. They do not change as ratings or age change. |
| Story so far | Recorded career figures | Matches, seasons, club, runs, high score, fifties and hundreds, wickets, best bowling, the latest five league matches, Player of the Match count, season awards won, and the next E6 milestone. Every number in the text is listed in the story's `facts`. |
| Match introduction | The ratings the match itself uses | The worker's T20 view adds an optional `playingStyles` map, computed from the eleven in the match setup, so a progressed player's style matches their player page. |

On the default world (`fictional-eight-01`), the 160 players get 28 different primary styles, and each 20-player squad has 11 to 15 different ones.

## Fact and flavour

- **Fact:** everything in the story so far, and the ratings named beside a style. They come from the save (historical statistics, career statistics, the awards ledger, contracts and the world's ratings). A player with no recorded match is "Yet to play a league match".
- **Derived label:** a style is a name for a rating pattern, not a recorded fact. A unit test checks that every style in the default world rests on ratings at or above its minimums, that every hitter has power of 68 or more, that only bowlers get bowling styles, spinners get spin styles, and only keepers get keeping styles.
- **Flavour:** the personality traits. None names a skill, a result or a match, and a unit test checks their wording for cricket-skill words. The page marks them "flavour, not a rating".
- No real cricketer's name, likeness or trait is used. Trait wording is generic.

## Determinism and the match engine

- The identity reads no clock, no `Math.random` and no simulation random stream; it imports only the E6 milestone helper. Unit tests check this by spying on `Math.random` and `Date.now` and by reading the module's imports.
- The match engine, its random streams, replays and results are unchanged. The only match-side change is a derived, optional field on the view the worker sends to the page. `npm run vectors:check`, `npm run probability:check`, `npm run fixtures:engine` and `npm run world:check` pass on this branch (see the pull request for the commands and revision).

## Limitations

- Styles describe ratings. [Inference] Under `synthetic-alpha-01` not every rating has a measurable effect on results: `TACTICAL_VALIDATION.md` found that bowler skill and bowling tactics barely move outcomes. A "Miserly off-spinner" is a player with high control, which the model may not reward. The labels will mean more once stage C calibration lands.
- The match introduction states only the style, and the version with ratings is in a tooltip, not on screen. The match screen does not hold career records, so it cannot say "312 career runs" without a new data path from the career. [Player identity V2](PLAYER_IDENTITY_V2.md) adds that path for managed career matches.
- The story uses league T20 records only. Exhibition, tournament, tour and auction matches are not counted, and the page's format selector does not change the style (always T20 ratings).
- Thresholds are design choices, not calibration. They were set so that styles spread across the default world; imported or edited worlds may give flatter spreads.
- Traits are flavour and do not grow or change through a career.
- Tournament, tour and auction screens do not show styles yet.

## How to judge it (playtest questions)

Use the career-season evaluation (`CAREER_SEASON_EVALUATION.md`), with these additions. Record what is observed; do not score enjoyment on the participant's behalf.

1. Without prompting, does the participant name a player by style or trait ("my finisher", "the larrikin")? Count it.
2. In the selection room, does the participant mention the style when choosing? Do they say why?
3. When a batter walks out or a bowler comes on, does the participant read the introduction, ignore it, or find it repetitive?
4. Asked "Which player in your squad do you remember most, and why?", does the answer refer to anything this slice shows?
5. Does any participant think a style or story claim is wrong, or doubt that a trait is only flavour?
6. Does a style ever seem to contradict what the player then does in a match? Note the player and the match.
