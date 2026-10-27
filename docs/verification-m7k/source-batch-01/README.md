# M7K first source batch: 27 October 2026

PASS for source identity: 11 exceptional events across seven matches match their historical register hashes.
Independent adjudication remains pending for every event.
This batch establishes actual match identities and dates, rather than accepting disputed scoring interpretations.

## Retrieved sources and attribution

Data source: [Cricsheet](https://cricsheet.org/), under [ODC-By 1.0](https://opendatacommons.org/licenses/by/1.0/).
The published summaries derive from Cricsheet match JSON, with source-addressed hashes and limited match metadata.
They are derived summaries, rather than unmodified copies of the original match files.
No endorsement by Cricsheet is implied.
Original licence notices remain in the downloaded archive outside Git.
The JSON format reference and licensing page were retrieved successfully on 27 October 2026.

[The source archive](https://cricsheet.org/downloads/t20s_male_json.zip) contains 3,646 matches plus README and licence files.
Its SHA-256 is `691f1f42b86c93fbdbc53936ed69479f9306bf39c4c56b4c0729360051075c6d`.
CRC verification passes for all 3,648 entries.
The earlier non-official international archive contains none of the selected matches and was excluded.

The current download differs from the historical all-T20 archive; matching selected event hashes establish local event identity only.
This does not establish byte identity of the original complete research archive.
The current archive is not designated an untouched evaluation cohort.
Analysis reads the selected matches only; no model fitting or quality evaluation occurs.

Raw downloads remain under `/workspace/m7k-source-research`, outside the source checkout.
`SOURCES.json` records URLs, retrieval details, content hashes and access failures.
`VERIFIED_EVENTS.json` records each verified event, source-file hash, actual delivery label and match metadata.
Every independent-adjudication and chronology flag remains false.

## Case findings

| Match | Date | Source-verified finding | Evidence still needed |
| --- | --- | --- | --- |
| 1391336, Malta v Romania | 20 August 2023 | Innings 1, 6.6 records hit the ball twice, rather than retirement. | Applicable conditions, second-contact purpose, appeal and umpire decision. |
| 1142915, Australia v Zimbabwe | 3 July 2018 | Innings 1, 19.5 records one wide and hit wicket together. | Contemporary conditions, dismissal sequence and physical ends. |
| 660185, Kenya v Netherlands | 23 November 2013 | Innings 2 includes five penalty extras at 10.3 and a caught dismissal at 15.2. | Penalty reason/beneficiary; no-ball cause and historical free-hit provisions. |
| 222678, South Africa v New Zealand | 21 October 2005 | Four rows record two no-ball extras, with varying batting runs and one run out. | Contemporary competition rules and separate extras attribution. |
| 1050219, Pakistan v West Indies | 24 September 2016 | Innings 2, 19.1 records five no-ball extras. | Delivery footage or commentary, conditions and additional-run attribution. |
| 306991, Kenya v Pakistan | 4 September 2007 | Innings 1, 2.6 records caught after a source no-ball entry. | No-ball cause, applicable free-hit provisions and umpire chronology. |
| 1275051, Uganda v Kenya | 17 September 2021 | Innings 2, 18.1 records one batting run and retired not out. | Reason, dead-ball timing, replacement and permitted return. |

Source array positions are not display delivery labels.
For example, match 1142915 uses over index 19 and attempt index 5 for the event labelled 19.5.
The source includes repeated labels for illegal deliveries, so lookup uses the full registered identity.

## What the law source establishes

The official [MCC 2026 Laws PDF](https://www.lords.org/getmedia/a4ef9f77-2a25-4f5b-a286-4601f08e6334/Laws-of-Cricket-2017-Code-4th-Edition-%282026%29_5.pdf) was retrieved successfully.
Its SHA-256 is `38ce30020b31cc997c4b05f90dcb3dbc6782336690606b7eda511245f2be8a87`.
Law 34 distinguishes hit the ball twice from retirement and excludes bowler credit for that dismissal.
Law 22.9 allows hit wicket among dismissals from a wide.
Laws 21.14 and 21.15 describe the current one-run no-ball penalty and additional scoring attribution.
These provisions support separate review questions; they do not certify the historical events.

The MCC 2026 edition does not establish the playing conditions governing matches from 2005 to 2023.
Multiple no-ball extras require historical conditions review before labelling them corruption or applying current one-run assumptions.
Free-hit adjudication requires the applicable historical conditions and the no-ball cause.
A recorded no-ball alone does not establish a confirmed free hit under every historical rule set.

## Remaining independent evidence

The ICC playing-conditions page and attempted ESPNcricinfo access return HTTP 403.
Google supplies a JavaScript challenge; Bing supplies off-topic results, which are excluded as evidence.
No usable contemporary playing-conditions document, umpire report, footage or independent match commentary was obtained.
Cricsheet corroborates the registered source contents, rather than providing independent adjudication of those contents.
All seven matches remain unresolved as acceptance fixtures.
Prioritise contemporary conditions and independent commentary for the 2018 wide/hit-wicket and 2023 hit-the-ball-twice cases.
The older no-ball and free-hit cases particularly require historical rule versions.

## Reproduction and checks

From the repository root, run the following command with the separately retained archive:

```sh
python3 docs/verification-m7k/source-batch-01/verify-source-batch.py --archive /workspace/m7k-source-research/t20s_male_json.zip --out /tmp/m7k-source-batch.json
```

The verifier reconstructs M7I's canonical source-event address and checks each recorded event hash.
A positive batch check and negative checks for a tampered hash and incomplete batch pass; see `checks.log`.
No production code, schemas, probability coefficients, source registers or approval flags change.
Full gameplay suites were not rerun for this source-evidence-only update.
