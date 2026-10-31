# Managed match navigation

A player can inspect career screens during an active managed match.
The match worker stays mounted while the career screens are visible.
Career changes are disabled during inspection.
The standard career uses a read-only load and does not rewrite its checkpoint.
Returning to the match keeps its revision and decision phase.
Reloading the page during inspection restores the match within the same browser session.
A completed match still transfers its result once when the player returns it.

The Linux core verification passed 188 schema checks and 687 unit tests across 53 files.
Build, type check, lint, fixture audit, scorer and deterministic vector gates passed.
Eight focused Chromium and Firefox tests passed across standard and imported-roster careers.
They covered inspection, reload, managed match completion and roster career transfer.
The production smoke suite passed 23 checks in Chromium and Firefox.
Firefox used the cloud host sandbox override.

The career launch binding still depends on session storage.
Recovery after a new browser session is not established by this slice.
V01-011 remains in progress until that binding has durable recovery coverage.
Hosted CI remains blocked by the GitHub Actions budget and is required before merge.
