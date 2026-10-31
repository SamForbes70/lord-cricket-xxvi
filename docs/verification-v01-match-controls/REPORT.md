# Match controls: durable command acknowledgements

The match worker returns a receipt after it commits a command. The receipt identifies the committed revision and event range. A duplicate command returns the original receipt. A rejected stale command has no receipt and leaves the event chain unchanged.

The build, type check and lint pass on Linux. Chromium and Firefox checks cover a committed command, a duplicate and a stale command.

This slice prepares the command boundary for later batch controls. It does not add simulation scopes, cancellation or delegation.
