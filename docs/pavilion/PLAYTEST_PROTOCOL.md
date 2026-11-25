# Project Pavilion: human enjoyment gate (playtest protocol)

Owner direction of 24 November 2026, item 4: "Conduct independent human playtests of the consolidated build. Measure friction, comprehension, enjoyment, memorable moments, tactical agency and voluntary replay. Record observed behaviour rather than treating automated UI tests as evidence of enjoyment."

This page is the protocol and the recording sheet. It is written to be run by the owner (or someone the owner asks) with people who have not seen the game. Nothing here has been run yet. Automated tests and scripted measurements in other Pavilion documents are not evidence of enjoyment and must not be quoted as such.

## 1. What is being tested

- **Build:** the consolidated acceptance build (the `windows-game` zip from the CI run on the consolidated pull request), unzipped and started with `LordCricketXXVI.exe`. Record the commit in `VERSION.txt` on every sheet.
- **Optional comparison:** the same tasks on the 19 November alpha (`alpha-2026-11-19`, commit `ff8284a`) with a different group, to see whether Pavilion changed anything. A comparison needs the same tasks, the same observer and similar participants; with small groups, treat any difference as a lead to follow up, not a result.

## 2. Who

- **Five to eight participants per round** [Inference: small rounds find most of the large usability problems; this is a common usability-testing rule of thumb, not a measured property of this game]. Aim for a mix: about half who follow cricket closely, about half who know the basics, and at least two who play management or sports games.
- **Independent:** not involved in building the game, and not told what changed.
- **Consent:** tell them what is recorded (notes, timings, optional screen recording), that they can stop at any time, and that the game is fictional. Record no names in the repository; use P1, P2 and so on.

## 3. Session (about 45 minutes)

The observer does not help unless the participant is stuck for two minutes or asks to stop. Ask them to think aloud. Write down what they do and say, not what you think they mean.

| Part | Time | Instruction to the participant (read as written) |
| --- | --- | --- |
| A. First contact | 10 min | "This is a cricket management game. Start playing however you like." |
| B. A match of your own | 15 min | "Play a T20 match through to the end. Make the decisions you care about." (If still in part A's match, continue it.) |
| C. A choice under pressure | 5 min | Start the **Scenarios** challenge "Nineteen to defend" (or "Death-overs chase"). "Try to win this from here." |
| D. Free time | up to 10 min | "That is everything we needed. You are welcome to stop now, or keep playing anything you like until the time is up." Do not prompt further. |
| E. Debrief | 5 min | The questions in section 5. |

Part D is the **voluntary replay** measure: whether the participant keeps playing when told they may stop, and for how long.

## 4. Observation sheet (one per participant)

Record behaviour with times (minutes:seconds from the start of part A).

| Measure | What to record |
| --- | --- |
| **Time to first ball** | From first sight of the title screen to the first delivery bowled. |
| **Stalls** | Each time the participant pauses more than 20 seconds not knowing what to do: time, screen, what they were looking at, what unblocked them. |
| **Wrong turns** | Clicks that do nothing they expected, back-tracking, opening a panel and closing it at once. |
| **Help needed** | Each time the observer had to help, and what was said. |
| **Comprehension errors** | Anything the participant says that shows a wrong belief about the game (for example, thinking the routine pick was theirs, misreading the win chance as certain). Quote it. |
| **Decisions taken** | Which of: toss call, bat or bowl, batter or bowler choice at a key moment, changing aggression or bowling plan, field, delegation, "Next key moment", turning routine picks off. Count each. |
| **Decisions explained** | When the participant says why they did something, quote it. |
| **Reactions** | Audible or visible reactions (cheering, groaning, laughing, "oh no") and the ball or moment that caused them. |
| **Sound** | Whether they turned sound on, and any comment about it. |
| **Part D** | Did they keep playing (yes or no)? For how long? What did they choose to do? What did they say? |
| **Problems** | Anything that broke, looked wrong or read wrongly. Screenshot if possible. |

## 5. Debrief questions (ask in this order, record answers in their words)

1. "Tell me about one moment in the match you remember." (memorable moments)
2. "Was there a decision you made that changed what happened? What was it?" (tactical agency)
3. "Was there anything you did not understand, or that felt like the game decided for you?" (comprehension, agency)
4. "What was the most tedious part?" (friction)
5. "On a scale of 1 to 5, how much did you enjoy that, where 1 is not at all and 5 is a lot?" Then: "Why that number?" (enjoyment; the reason matters more than the number)
6. "If this were on your computer at home, would you play another match? Why or why not?" (replay intent; compare with what they did in part D)
7. "Did the cricket feel believable? Anything that seemed off?" (authenticity; the model's scoring level is a known open question, backlog B8 and P04)

## 6. Recording and reporting

- Save each completed sheet as `docs/pavilion/playtests/<round>/P<n>.md`, using the template in section 7, with the build commit. Remove anything that identifies the person.
- Write a short round summary in `docs/pavilion/playtests/<round>/SUMMARY.md`:
  - counts (for example "5 of 7 needed help to find X", "4 of 7 kept playing in part D, median 6 minutes");
  - the quotes behind each finding;
  - a ranked list of problems by how many people hit them and how badly.
- Do not turn small-group numbers into percentages without the counts beside them, and do not average the 1 to 5 enjoyment scores across fewer than 10 people without showing every score.
- Every change made because of a playtest should cite the sheet and quote it came from.

## 7. Sheet template

```markdown
# Playtest <round> P<n>

- Date:
- Build commit (VERSION.txt):
- Observer:
- Cricket familiarity (close follower / knows basics / new):
- Plays management or sports games (yes / no):

## Timeline
| Time | Screen | What happened | Quote |
| --- | --- | --- | --- |

## Measures
- Time to first ball:
- Stalls (count, and each with time and cause):
- Help given (count, and what):
- Comprehension errors (quotes):
- Decisions taken (counts by kind):
- Reactions (moment and reaction):
- Sound on? Comments:
- Part D: kept playing? how long? doing what? quote:

## Debrief answers
1.
2.
3.
4.
5. Score: , reason:
6.
7.

## Problems seen
```
