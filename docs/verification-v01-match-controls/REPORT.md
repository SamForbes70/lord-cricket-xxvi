# Match controls: durable command acknowledgements

The match worker returns a receipt after it commits a command. The receipt identifies the committed revision and event range. A duplicate command returns the original receipt. A rejected stale command has no receipt and leaves the event chain unchanged.

The build, type check and lint pass on Linux. Six Chromium and Firefox checks cover T20, ODI and red-ball commands. Each checks a committed command, a duplicate and a stale command.

This slice prepares the command boundary for later batch controls. It does not add simulation scopes, cancellation or delegation.

The full local unit suite passed 679 tests in 52 files. The production smoke suite passed 23 checks. Fixture audit, scorer comparison, random vectors, probability vectors and generator vectors passed.

Initial hosted CI attempts did not start because an Actions budget blocked them. Later check results are recorded on PR #19.
