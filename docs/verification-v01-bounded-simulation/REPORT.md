# Bounded simulation controls

The match screen offers next decision, innings and match advances.
Each advance sends existing over commands and waits for a durable acknowledgement.
The sequence stops at an engine decision, rejection, missing acknowledgement or command limit.
The innings scope also stops when the active innings changes.
Closing the page leaves the last committed command available for recovery.
Cancellation and granular delegation remain separate planned work.

`npm run verify:09:core` passed 185 schema checks and 680 tests across 52 files.
The command also passed build, type check, lint, fixture audit, scorer and vector gates.
The production smoke suite passed 23 checks in Chromium and Firefox.
Firefox used the cloud host sandbox override.
Six focused checks passed across T20, ODI and red ball in both browsers.
They checked decision stops and reload of the committed revision.
A T20 unit test compared delivery and over outcomes for one fixed setup.

The full match UI suite passed 41 of 42 checks before the layout fix.
Chromium placed the next-delivery button 6.6 pixels below the viewport at 150%.
After reducing vertical padding, eight focused format and layout checks passed in both browsers.
Hosted CI remains required on the pull request.
