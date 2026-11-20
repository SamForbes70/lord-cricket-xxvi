# How to play Lord Cricket XXVI

A guide for testing the latest build on a laptop. Everything in the game is fictional: eight clubs, their players and grounds, and every result. The match model is a synthetic alpha; it makes no claim to match real cricket.

## Start the game

1. Download `lord-cricket-xxvi-game-<commit>.zip` and **extract the whole folder** (do not run it from inside the zip preview).
2. **Windows 10 or 11:** double-click `Play-Lord-Cricket.bat`. Nothing needs installing: it uses Node.js or Python if you have them, or builds a small launcher (`LordCricketXXVI.exe`) with Windows' own .NET compiler. The launcher is unsigned, so Windows SmartScreen may ask you to confirm ("More info", then "Run anyway").
3. **Mac or Linux:** open a terminal in the folder and run `bash start-game.sh` (needs Node.js 18 or later, or Python 3).
4. The game opens on its title screen at **http://127.0.0.1:4180/#title** in its own window. To stop it on Windows, double-click `Stop-Lord-Cricket.bat`, or right-click the tray icon and choose Quit Server.

**If the game window does not open,** the game is usually already running: open **http://127.0.0.1:4180/** in Edge or Chrome yourself. (Builds before 20 November 2026 could stop with "Start-Process : The system cannot find the file specified" on a laptop with one Edge install; that is fixed.)

Saves live in that browser, tied to that address. Clearing browser data deletes them, so use **Settings, Export .lcxxvi** to keep a backup.

## Where everything is

The game opens on the **title screen**:

- **Quick match** starts a T20 straight away with the suggested XIs.
- **Guided first match** is the same match with a coach above the decisions explaining each one (toss, bat or bowl, batters, bowlers, playing on). Press **End the guide** when you no longer need it.
- The cards below lead to **Career**, **Tournaments**, **Scenarios**, **Rain and reviews** and **Custom match** (pick the format, ground and both XIs).

**Career** opens **Start a Career**, the club selection screen (also the page at the plain address with no `#title`). Pick a club to start a career; the buttons at the top lead to exhibitions, scenarios, tournaments, rain matches and back to the title screen. Inside a career, the tabs are Home, Career, Squad, Contracts, Fixtures, Statistics, Settings, Exhibition, Scenarios, Tournaments, Rain matches and Choose career.

| You want to | Go to | Notes |
| --- | --- | --- |
| Manage a club over many seasons | Pick a club, then **Home** | 14 rounds a season, then the off-season: ageing, youth intake, contracts and retirements |
| Choose your XI for a match day | **Home**, before a managed fixture | The selection room offers the regular or an available reserve for one place, with last time out's figures |
| Play your club's match | **Home**, then play the fixture | Play ball by ball, or press **Play captain's highlights** to play in short passages with plans |
| See your squad, youth and contracts | **Squad**, **Contracts** | Promote youth players in Squad; renew contracts and sign free agents in Contracts |
| Read the season and your stories | **Career**, **Fixtures**, **Statistics** | Story cards, past seasons, replays, leaderboards and awards |
| Play a one-off match | **Exhibition matches** | T20, one-day or five-day. A tied T20 or one-day match goes to a super over |
| Try a match situation | **Scenario challenges** | 12 challenges. **Death-overs chase** and **Nineteen to defend** open in captain's highlights |
| Play with rain or player reviews | **Rain-affected matches** | T20 or one-day exhibitions with rain, player reviews (DRS), or both |
| Run a tournament | **Tournaments** | Built-in competitions, your own, tours against a touring XI, and auctions before your own tournament. Pick **Your team** to play your matches yourself |
| Use an imported squad list | **Imported roster career** | Load a roster file and play a career with it |
| Change text size, sound, commentary | **Settings** | Text scale, layout, commentary, sound and narration, tactical briefings |

## Playing a match

- **Toss and choices.** Call the toss, choose to bat or bowl, then pick batters and bowlers when asked. The screen tells you what decision is next.
- **Captain's highlights.** Choose a batting intent or a bowling plan, then a few balls play out. Play stops at a wicket, a selection, a pressure point or after two overs, with a recap of what happened. **Return to manual pace** goes back to ball by ball.
- **Opponent.** The other side is played by the tactical captain. Rival captains have tendencies you can read from scouting notes; a match-aware opponent is optional.
- **Bowlers.** A bowler who cannot bowl now shows why (previous over, over limit, or a choice that would leave overs no one could bowl).
- **Field and commentary.** The 2D field shows placements and highlights; text commentary follows the play. Sound and narration are optional in Settings.

## A 30-minute test session

1. **Scenario:** play **Death-overs chase** in captain's highlights, then restart and try a different plan.
2. **Career:** pick a club, press **Simulate match** for round 1, then on round 2 use the selection room and press **Play match**.
3. **Exhibition:** play a T20 for a few overs ball by ball, then switch to highlights.
4. **Tournaments:** arrange a tour, choose the touring XI as your team and play its first match.
5. **Save:** in Settings, export the career, then reload the page and check it is still there.

For each step, note anything confusing, slow or broken (with the screen it was on), and whether you would play it again. Those notes are the evidence Stage 16 never collected.

## Known limits

- Tested by automated runs on Linux and Windows (Chromium and Firefox) only. Nobody has playtested the captaincy features yet, and nothing has been run on Safari or macOS.
- Rain-shortened matches and player reviews are exhibition-only. Tour and auction squads have no super over: a tied knockout goes to the higher-placed side.
- An older build cannot read saves made by this one.

More detail: [verification-captains-pavilion/PLAY.md](verification-captains-pavilion/PLAY.md) for captaincy, [HANDOVER.md](HANDOVER.md) for where the project stands.
