# Historical free-hit conditions: 28 October 2026

The retrieved 2012 ICC standard conditions restrict free hits to foot-fault no-balls.
A 2013 handbook transcription states the same restriction, with weaker publisher provenance.
These sources strengthen historical context for two cases; they approve zero fixtures.
All five registered free-hit anomalies predate the July 2015 expansion to all no-balls.

## Retrieved evidence

| Source | Verified content | Scope |
| --- | --- | --- |
| [ICC T20I conditions, 2012](https://saca.org.za/wp-content/uploads/2013/04/05-Standard-T20_2012_USB.pdf) | Effective 1 October 2012; clause 24.2, PDF page 18, printed page 5.18. | ICC-authored PDF hosted by the South African Cricketers' Association. |
| [2013–14 handbook transcription](https://silo.tips/download/526958a73c839-playing-handbook) | T20I section effective 1 October 2013; clause 24.2, printed page 5.18. | Anonymous document mirror; authentication against an ICC-hosted original remains incomplete. |
| [Cricket Web match report](https://www.cricketweb.net/new-zealand-win-twenty20/) | Richard Edmunds, 21 October 2005; South Africa 133, New Zealand 134/5. | Contemporary match corroboration; supplies no two-run no-ball rule or delivery chronology. |

The 2012 document calls clause 24.2 “Free Hit after a foot-fault no ball”.
The clause also carries an existing free hit forward after an illegal delivery.
The 2013 transcription contains the same restriction in its men's T20I section.
The mirror identifies its uploader as anonymous and cannot establish publisher authentication alone.
The [earlier BBC evidence](../historical-evidence/README.md) dates expansion to all no-balls from 5 July 2015.

`SOURCES.json` retains retrieval timestamps, content hashes, URLs and access failures.
The public SACA media catalogue supplied the 2012 PDF address.
Raw files remain under `/workspace/m7k-source-research/third-batch`, outside Git.
The repository retains derived findings and references, rather than republishing documents.
Case identities and recorded extras derive from [Cricsheet](https://cricsheet.org/) under [ODC-By 1.0](https://opendatacommons.org/licenses/by/1.0/).
These derived summaries retain the original event hashes and imply no endorsement.

## Effect on registered cases

| Match | Date | Available rule context | Remaining requirements |
| --- | --- | --- | --- |
| 306991 | 4 September 2007 | Contemporary conditions remain absent. | Obtain applicable 2007 conditions and the preceding no-ball cause. |
| 412698 | 10 May 2010 | Contemporary conditions remain absent. | Obtain applicable 2010 conditions and the preceding no-ball cause. |
| 489212 | 21 April 2011 | Contemporary conditions remain absent. | Obtain applicable 2011 conditions and the preceding no-ball cause. |
| 533293 | 1 October 2012 | Retrieved standard conditions have this effective date. | Confirm tournament adoption, amendments, no-ball cause and umpire chronology. |
| 660185 | 23 November 2013 | The mirrored standard conditions predate this match. | Authenticate conditions and confirm qualifier adoption, no-ball cause and umpire chronology. |

`CASE_RULE_CONTEXT.json` retains each original source hash and its preceding delivery hash.
Each preceding source row records one no-ball extra.
Those extras do not identify foot fault, height, fielding infringement or another cause.
A generic no-ball transition therefore cannot independently establish a historical free hit.
The 2012 and 2013 documents do not retrospectively establish the rules for earlier matches.
Standard T20I conditions alone do not confirm a tournament's adopted conditions or amendments.
The report changes no inherited classifications, approval flags, scoring rules or model coefficients.

## Exclusions and access limits

The NZC result at `Scorecards/83/83909.html` describes the ODI on 23 October 2005.
It does not describe the target T20 on 21 October and supplies no evidence for those source events.
The Foothill PDF describes an Inter Club Council, rather than the International Cricket Council.
Content checks reject both apparent search matches as cricket-rule evidence.

ICC-hosted 2013 handbook and 2021/2023 condition requests return HTTP 403.
The Yumpu mirror returns HTTP 202 with an empty body.
One Brave search returns HTTP 429; no result from that request supplies evidence.
The available sources do not confirm the 2005 two-run no-ball rule or the 2013 five-run penalty reason.
The source cases remain unresolved.

## Checks and reproduction

With the retained downloads and `pdftotext` installed, run from the repository root:

```sh
python3 docs/verification-m7k/historical-conditions/verify-historical-context.py --raw-dir /workspace/m7k-source-research/third-batch --out /tmp/m7k-historical-context.json --negative-out /tmp/m7k-historical-negative.json
cmp docs/verification-m7k/historical-conditions/CASE_RULE_CONTEXT.json /tmp/m7k-historical-context.json
```

The verifier checks five source hashes and their cited content or exclusion facts.
It checks PDF page 18 directly, rather than trusting a search snippet or an ODI clause.
It reproduces all five source identities and leaves free-hit eligibility unconfirmed.
Tampered source and context hashes reject; `NEGATIVE_CHECKS.json` records the actual errors.
`COMMANDS.json` records fresh commands, durations, exit codes and log hashes.
`SHA256SUMS` covers the committed evidence.

K1 remains BLOCKED on independent adjudication and missing match evidence.
K2 ledger implementation and gameplay promotion retain their separate gates.


## Fresh regression results

PASS: 542 TypeScript tests across 31 files and 84 research Python tests.
PASS: 167 schema checks, build, typecheck, lint, scoring fixtures, RNG vectors, probability vectors and generator vectors.
PASS: five source hashes, historical content anchors, two provenance rejection checks and byte-identical report reproduction.
`BOUNDARY_CHECK.json` records unchanged protected paths against merged PR #6 (`47c37df`).
Browser suites are NOT RUN for this evidence-only update.
PR #6 retains the earlier local browser results and four passing CI checks; these remain separately dated evidence.
