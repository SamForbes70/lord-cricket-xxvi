# Historical conditions and independent accounts

Two priority cases now have published corroboration beyond Cricsheet.
The 2018 case also has contemporary ICC standard conditions supporting wide plus hit wicket.
These records advance evidence collection; they approve zero scorer fixtures.
Per-source UTC retrieval timestamps and content hashes appear in `SOURCES.json`.

## Finch: Australia v Zimbabwe, 3 July 2018

Source identity: match `1142915`, innings 1, over index 19, attempt index 5; actual delivery label `19.5`.
The full event hash remains in `CASE_EVIDENCE.json` and the original register.

[Cricket Australia's match-day report](https://www.cricket.com.au/news/3297161), by Laura Jolly, identifies the bowler and incident.
It reports Finch out hit wicket while chasing a wide delivery from Blessing Muzarabani.
[The BBC's independent report](https://www.bbc.com/sport/cricket/44696476), also dated 3 July 2018, corroborates hit wicket.
The BBC records Australia's 229/2 and 100-run win.
These accounts support the registered dismissal; a wide plus hit wicket is not inherently an invalid combination.
The BBC account alone does not establish the wide signal or detailed chronology.

The [ICC Playing Handbook 2017–18](https://usacricket.org/wp-content/uploads/2018/02/ICC-Playing-Handbook-2017_2018_DIGITAL.pdf) is available from USA Cricket.
It is an ICC-authored handbook hosted by a national governing body, rather than a new tournament-specific document.
Its men's T20I section provides contemporary standard conditions:

| Locator | Provision relevant to this case |
| --- | --- |
| PDF page 145, printed pages 5.42–5.43, clause 22.6 | The wide penalty stands despite dismissal unless the call is revoked. |
| Same page, clause 22.7 | Wide runs debit the bowler, apart from five-run penalties. |
| Same page, clause 22.8 | A wide does not count towards the over. |
| Same page, clause 22.9 | Hit wicket is among dismissals permitted from a wide. |
| PDF page 154, printed pages 5.60–5.61, clause 35 | Hit-wicket conditions and exceptions distinguish receiving the delivery from later actions. |

This supports reviewing the event through the existing wide/hit-wicket scoring path.
It does not establish the strict scorer's physical-end identities or confirm every match-specific amendment.
Those fields remain evidence requirements before a complete source-derived fixture can pass independent review.
No fictional field identities or adjudication signatures were manufactured.

## Mughal: Malta v Romania, 20 August 2023

Source identity: match `1391336`, innings 1, over index 6, attempt index 5; actual delivery label `6.6`.

[Wisden's account](https://www.wisden.com/cricket-news/watch-first-hit-ball-twice-dismissal-internationals-three-months-before-mathews-timed-out), by Abhishek Mukherjee, dates from 7 November 2023.
It identifies the Continental Cup match and describes the second strike, Romania's appeal and the dismissal decision.
It places Malta at 44/1 after 6.5 overs and records the eventual nine-wicket defeat.
This independently corroborates the dismissal class and reported sequence, rather than a retirement.
It is retrospective journalism, not a signed umpire report.
The article links to video; that video was not separately viewed or timecoded during this pass.

MCC's [official archive page](https://www.lords.org/mcc/about-the-laws-of-cricket) provides the 2017 Code, third edition 2022.
The [English DOCX](https://www.lords.org/getmedia/81bd1d01-c7e7-42f6-ac70-80473a050c32/Laws-of-Cricket-2017-Code-3rd-Edition-2022_1.docx) predates the 2023 match.
Its Law 34 distinguishes a wilful second strike from permitted wicket protection and returning the ball.
The law also excludes bowler credit for this dismissal.
This confirms that retirement handling cannot stand in for hit-the-ball-twice adjudication.
The archive also supplies the 2017 English code and 2019 edition; their hashes are retained for further review.

The MCC code provides historical law context, but does not establish the tournament's adopted conditions or amendments.
The June 2023 ICC conditions link was discovered, but its document host returned a tunnel HTTP 403.
No condition was inferred from the inaccessible document or its search snippet.
Precise contact, physical ends and primary incident evidence remain incomplete.
The case remains partially corroborated, without adjudication approval.

## Historical free-hit inference needs version context

The [BBC report dated 26 June 2015](https://www.bbc.co.uk/sport/cricket/33295761) describes a change effective 5 July 2015.
It reports expansion of free hits to all no-balls, from the preceding overstepping-only rule.
That is independent support for checking historical conditions before interpreting the 2007 and 2013 register cases.
It does not prove the cause of either source no-ball or retrospectively decide those dismissals.

The inherited `preFreeHit` field comes from a research scanner using a generic no-ball transition.
It is not an independently observed umpire signal.
Consequently, a `FREE_HIT_MASK` classification alone cannot establish an unlawful historical dismissal.
The historical register remains unchanged; neither a corrected chronology nor a legal interpretation is silently substituted.

## Checks, scope and next evidence

All nine retained source files match their recorded content hashes.
Text-anchor checks verify the cited facts appear in retrieved publisher content, rather than search summaries.
A handbook check verifies the men's T20I heading and clauses on PDF page 145.
Both case hashes match the source register, with independent-adjudication and chronology flags false.
`checks.log` records these checks; `SHA256SUMS` covers the committed evidence.
No production code or model changes occur in this update.
No full gameplay suite was rerun for this evidence-only change.

The next evidential step is to review the primary incident footage or umpire records for these two cases.
A qualified independent reviewer must settle the complete context, credits, physical ends and next decision.
Tournament-specific amendments or their absence also need confirmation.
The accounts narrow those questions; they do not certify complete v2 scorer support.
Raw publisher files and full law documents remain outside Git under `/workspace/m7k-source-research/second-batch`.
The repository retains source references, hashes and derived summaries, rather than republishing the articles.
