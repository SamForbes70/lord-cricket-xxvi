# Cross-format match analytics

ODI and red-ball results now use the existing event-derived analytics projection.
The projection reconciles runs, wickets and legal balls against each innings scorecard.
The display includes every recorded innings and a fall-of-wickets table.
The red-ball follow-on test checks the actual innings order.
The match engines, random streams and saved events are unchanged.

The Linux core verification passed 185 schema checks and 682 unit tests across 52 files.
Build, type check, lint, fixture audit, scorer and deterministic vector gates passed.
A later targeted ODI suite passed 11 tests, including a mismatched-scorecard rejection.
Four full ODI and red-ball browser matches passed in Chromium and Firefox.
Each checked the analytics panel and replay verification.
The production smoke suite passed 23 checks in Chromium and Firefox.
Firefox used the cloud host sandbox override.

The first ODI browser run found that the screen still restricted analytics to T20.
The screen restriction was removed before the four passing full-match checks.
Hosted CI is blocked by the GitHub Actions budget and remains required before merge.
