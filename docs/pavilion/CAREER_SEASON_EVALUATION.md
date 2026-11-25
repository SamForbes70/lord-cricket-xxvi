# Project Pavilion: career-season evaluation (human)

Owner direction of 25 November 2026: "Add a separate career-season evaluation covering recruitment, selection, training, league progression, player attachment and the desire to start another season. Do not substitute automated functional tests for observed human enjoyment."

This is the protocol and the recording sheet. It complements the match playtest (`PLAYTEST_PROTOCOL.md`), which covers one match; this one covers one season of a career. Nothing here has been run. It is to be run by the owner, or by people the owner chooses, on the consolidated build.

## 1. What is being tested

- **Build:** the consolidated acceptance build, started with `LordCricketXXVI.exe`. Record the commit from `VERSION.txt` on every sheet.
- **Question:** is one season rewarding enough that the player wants to start the next?

## 2. Who

- **Participants:** four to six per round, ideally people who took part in the match playtest, so first-contact friction does not dominate.
- **Mix:** at least two who play management or sports games.
- **Independence:** not involved in building the game.
- **Privacy and consent:** no names recorded (P1, P2 and so on). Consent as in the match protocol.

## 3. Sessions

A season is long, so it is played over **two or three sessions of about 45 minutes**, within a week. The observer is present for the first and last, and the participant may play between them on their own. The game's saves carry the progress; ask the participant to note roughly how long they played between sessions.

| Session | Instruction to the participant (read as written) |
| --- | --- |
| 1. Take charge | "Start a career with any club. Get your squad ready for the season and play the first matches. Do what you would normally do in a game like this." |
| Between sessions | "Carry on whenever you like. Play your own matches or let them be simulated, as you prefer." |
| 2 (optional) | "Carry on from where you are." |
| Last. Finish the season | "Play on to the end of the season." Then the debrief (section 5). Then: "You can stop here, or start the next season if you want to." Do not prompt further. |

The final instruction is the **replay** measure: whether they start the next season when told they may stop.

## 4. Observation sheet

Record what the participant does and says, with times, not what you think they meant.

| Area | What to record |
| --- | --- |
| **Recruitment** | Did they look at contracts, free agents or the auction? Did they sign anyone? What did they say about why? Any confusion about money, ratings or contract terms (quote it). |
| **Selection** | Did they change the suggested eleven? Why (quote)? Did they notice form, fatigue or role? |
| **Training** | Did they open training? Did they change anything? Did they say they could see an effect? Quote any doubt that it matters. |
| **League progression** | Did they check the table, fixtures or results unprompted? Reactions to wins, losses and their position. |
| **Player attachment** | Count each time they name a player unprompted. Note any player they protect, praise or blame, and any story or award they remark on. |
| **Pace and friction** | Time per round. Stalls of more than 20 seconds. Help given. Anything that felt like a chore (quote). |
| **Matches played or simulated** | How many of their matches they played, and how many they let be simulated. What made them choose? |
| **Problems** | Anything that broke, looked wrong or read wrongly; screenshot if possible. |
| **Next season** | Did they start it (yes or no)? How long did they keep playing? What did they do first? |

## 5. Debrief questions (ask in this order; record answers in their words)

1. "Which player in your squad do you remember most, and why?" (attachment)
2. "Tell me about a decision you made off the field that you think changed your season." (recruitment, selection, training agency)
3. "Was there anything you did that seemed to make no difference?" (agency, comprehension)
4. "Where did you finish, and how do you feel about it?" (league progression)
5. "What was the most tedious part of the season?" (friction)
6. "On a scale of 1 to 5, how much did you enjoy the season, where 1 is not at all and 5 is a lot? Why that number?" (enjoyment; the reason matters more than the number)
7. "If this were on your computer at home, would you start another season? What would you do differently?" (replay intent; compare with what they did)
8. "Did the results and the players' numbers feel believable? Anything that seemed off?" (statistical authenticity, cross-checked against the criteria in `DIRECTION_2026-11-25.md`, section 2)

## 6. Recording and reporting

- **Sheets:** save each as `docs/pavilion/career-evaluations/<round>/P<n>.md` with the build commit, and remove anything identifying.
- **Round summary:** in `SUMMARY.md`, give counts beside every finding (for example "3 of 5 started the next season"), the quotes behind each finding, and a ranked list of problems.
- **No small-group percentages without counts, and no averaged 1-to-5 scores** for fewer than 10 people. Show every score.
- **Traceability:** every change made because of this evaluation cites the sheet and the quote it came from.

## 7. Sheet template

```markdown
# Career-season evaluation <round> P<n>

- Dates of sessions:
- Build commit (VERSION.txt):
- Observer:
- Took part in the match playtest (yes / no):
- Plays management or sports games (yes / no):
- Club chosen:

## Timeline
| Session | Time | Screen | What happened | Quote |
| --- | --- | --- | --- | --- |

## Measures
- Recruitment (actions, quotes):
- Selection (changes, reasons):
- Training (actions, perceived effect):
- League progression (checks, reactions):
- Player attachment (players named unprompted, count and names):
- Matches played / simulated (and why):
- Stalls, help given, chores:
- Next season started? How long played after? Quote:

## Debrief answers
1.
2.
3.
4.
5.
6. Score: , reason:
7.
8.

## Problems seen
```
