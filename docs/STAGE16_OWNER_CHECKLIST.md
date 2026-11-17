# Stage 16: owner checklist

Owner decision 13a (17 November 2026): the agent prepares this checklist and a one-command measurement. The owner runs them on their own PC and sends the results back. Nothing here can be done by an agent: the roadmap requires real human and real-hardware evidence, and agents must never describe owner-declared gates as measured.

Allow about two hours in total. Each part can be done on a different day.

## 1. Measurements (about 20 minutes, one command)

On the Windows PC you will play on, open PowerShell in the repository folder (a clean checkout of the latest `main`) and run:

```powershell
npm run owner:stage16
```

This is the existing acceptance collector (`scripts/owner-acceptance.mjs --owner-pc`). It runs the build, the unit tests and the browser suites in Chromium and Firefox, and the performance observations, including Budget 8 (total memory, 768 MiB).

- It uploads nothing and uses fresh browser profiles.
- It prints the path of `acceptance.json` at the end.
- **Send back:** the whole evidence folder it names, `test-results/owner-acceptance-…`.
- If a step fails, it stops there and keeps the log. Send that back too.

See [LOCAL_ACCEPTANCE_COLLECTOR.md](LOCAL_ACCEPTANCE_COLLECTOR.md) for prerequisites and how to read the result.

## 2. Playtest (about 45 minutes, ideally with one or two other people)

Follow [PLAYTEST_SCRIPT_STAGE05.md](PLAYTEST_SCRIPT_STAGE05.md), then try the features added since:

| Feature | Where | What to try |
| --- | --- | --- |
| Scenario challenges | Career, then **Scenario challenges** | Play two challenges, including "Level at the death". |
| Super overs | **Exhibition matches** | Settle a tied T20 or one-day match with a super over. Ties are rare, so a scenario that ends level is the easiest way in. |
| Tournaments | Career, then **Tournaments** | Pick a team in the Northern T20 League, play one match yourself and simulate the rest. |
| Career stories | Career, then **Career** | Read the stories panel after a few rounds. |

For each person, note:
- anything confusing, slow or broken, with the screen it happened on;
- whether they would play again.

**Send back:** the notes, with the date and the names or initials of the testers.

## 3. Screen-reader walkthrough (about 30 minutes)

Use NVDA on Windows, or VoiceOver on a Mac, with the keyboard only.

1. Start a career, open Squad, and promote a youth player.
2. Play one exhibition over: call the toss, choose a batter and a bowler, then finish the over.
3. Open Scenario challenges and start one.
4. Open Tournaments, start a run and play the next match.

For each step, note whether every control was announced with a sensible name, whether focus went where you expected, and anything you could not do.

**Send back:** the notes, and the screen reader and browser versions.

## 4. Long-career soak (optional, about 30 minutes of mostly waiting)

Start a career and simulate seasons until at least season 20 (Home, then simulate repeatedly). Then:

1. Export the career: Settings, then **Export .lcxxvi** under "Career file & recovery".
2. Import it again: Choose career, then **Import portable career**, then **Choose .lcxxvi archive**.

**Send back:**
- the number of seasons reached;
- roughly how long the last season took;
- the size of the exported file;
- whether the import worked;
- any error messages.

## What happens next

The agent records the results in the repository (under `docs/verification-stage16/`), with the date and the owner's own words. Any failure reopens the matching item. Stage 17 (the GitHub Release) starts only after these pass (owner decision 14a).
