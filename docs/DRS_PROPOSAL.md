# Player reviews (DRS): design proposal

Status: **approved by the owner on 18 November 2026** (B1a to B5a: new opt-in rule sets; these numbers as a starting point, tunable before release; AI captains review too; T20 and one-day only; exhibitions only). Earlier status: proposal, not approved. Owner decisions of 17 November 2026: a design proposal comes first (5a), and each side gets two unsuccessful reviews per innings (6a). Nothing here is built. Building it needs the owner's approval of this document and a new match-model version.

## Why it needs a new model version

Today the delivery generator decides each ball's true outcome, and the scoring kernel records it directly. There is no umpire, so nothing can be reviewed. DRS needs two new things:

1. An **on-field decision** that can differ from the true outcome (an umpire error).
2. A **ball-tracking reading** for leg-before decisions, with an "umpire's call" margin.

Both need new random draws. Adding draws to the frozen generator would change every existing match, so the frozen rule sets (`LC_T20_01`, `LC_ODI_01`, `LC_RED5_01`) and their vectors stay exactly as they are. DRS would ship as new opt-in rule sets (for example `LC_T20_03` and `LC_ODI_03`) with their own event-chain version.

## Proposed model (all numbers fictional, to be tuned)

### On-field decisions

After the generator resolves a ball, an umpire layer draws the on-field decision, using a separate random address (stage `UMPIRE_DECISION`) so no existing draw moves.

| True outcome | On-field "out" probability |
| --- | --- |
| Leg before, clearly hitting | 85% |
| Leg before, marginal (umpire's call band) | 50% |
| Not out, with a close leg-before shout | 6% |
| Caught behind, thin edge | 80% |
| Not out, with a close caught-behind shout | 4% |
| Bowled, run out, stumped, clean catches | Always given correctly (not reviewable in the game) |

The engine flags a "close shout" only on balls whose resolved trajectory passes near the stumps, or on edges that carried. Most balls never reach the umpire layer.

### Ball tracking

For leg-before, the generator's trajectory gives three readings: pitching, impact and wickets. Each is classed as **in**, **umpire's call** or **out**. The margins are fixed bands in the trajectory model, published in the rule set.

As in the real system, an umpire's-call reading keeps the on-field decision, and the review is not lost.

### Reviews

- Each side has **two unsuccessful reviews per innings**. Successful reviews and umpire's-call reviews are not lost.
- The fielding side may review a not-out; the batting side may review an out.
- Human sides get a prompt after a reviewable decision. The prompt runs out after the next ball starts.
- AI sides review using the engine's public view only: never the true outcome, and never a future draw. A simple policy: review when the evidence the batter or bowler would actually have is strong (for example a thick edge heard, or a ball clearly pitching outside leg).
- An overturned "out" is replaced by a not-out ball with the same runs. An overturned "not out" becomes a wicket. Both are recorded as new events.

## Data and save formats

- **New event types** for an on-field decision, a review and its outcome, under a new event-chain version. Old saves replay unchanged.
- **New scorecard fields**: reviews used and lost per innings.
- **Replay and export**: the new events travel in `.lcxxvi` exports under a new archive version.

## Owner decisions this proposal needs

1. Approve the approach: new opt-in rule sets, with the frozen rule sets untouched.
2. Approve or adjust the error rates and the umpire's-call bands above.
3. Should AI captains review, or only human players?
4. Formats: start with T20 and one-day only (recommended), or include five-day matches?
5. Scope: exhibitions only first (recommended, matching super overs and rain), or careers too (needs a new career format version)?

## Rough size

This is about the same size as rain-adjusted targets: a new generator stage, a new engine version, kernel events, UI prompts, AI policy and tests. It would be built as three or four pull requests.
