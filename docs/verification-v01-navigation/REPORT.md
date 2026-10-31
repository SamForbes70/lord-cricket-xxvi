# Settings and player navigation acceptance

The career player page retains its format filter across profiles and reloads.
Its back action restores focus to the originating player button.
The new keyboard check opens and closes a profile with Enter.
It also checks reduced-motion persistence and the selected format.

On Linux, `npm run verify:09:core` passed 185 schema checks and 679 unit tests across 52 files.
The command also passed build, type check, lint, fixture audit, scorer and vector gates.
The focused Chromium player-page suite passed five tests.
The production smoke suite passed 23 tests in Chromium and Firefox.
Firefox required `MOZ_DISABLE_CONTENT_SANDBOX=1` on this cloud host.
An earlier smoke run without that setting timed out during Firefox startup and was stopped.
Hosted Windows and Linux checks on the pull request remain required.
