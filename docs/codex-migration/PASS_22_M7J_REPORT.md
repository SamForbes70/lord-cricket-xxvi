# Lord Cricket XXVI — Pass 22 / M7J Engineering and Acceptance Report

**Status:** M7J BOUNDED RESEARCH RULES IMPLEMENTATION COMPLETE; GAMEPLAY MODEL PROMOTION NOT ACCEPTED; BROWSER ACCEPTANCE BLOCKED.

**Authoritative M7I baseline:** `bc5588831f2e9300c9063a047209544013c6e62b`.

**Final source commit:** `5b8b9da990d657197fb56bbfd33152f87b875f5c`.

## Delivered

1. Four additive strict Zod/JSON Schemas for `LC_T20_EXCEPTION_ADJUDICATION_RESEARCH_V2`, including explicit typed administrative commands, result accounting, and a literal `gameplayIntegrationPermitted=false` capability gate.
2. Pure research-domain adjudicator that runs existing accepted delivery `scoreDelivery` and `reduceScoringBoundary`, and then supports separately confirmed five-run batting-side or fielding-side penalty awards, retired-out or retired-not-out dead-ball administrative events, and collision/closed-innings rejection.
3. Fielding-side penalty awards are recorded for allocation to the beneficiary team, never credited to the current batting innings. Penalties and retirement do not add legal balls. The bowler never receives an administrative retirement wicket or penalty runs conceded.
4. Existing scorer confirms wide plus hit wicket after necessary fielding/ends metadata is independently established.
5. Source-hashed M7I 69-record exception ledger with per-event reason, recommended action, supporting MCC rule, required extra evidence and no automatic legal approval.
6. Reproducible `npm run m7j:adjudication`, `npm run m7j:test`, `npm run m7j:restore-fixtures`, complete runbook, and ADR-032 documenting legal assumptions and deferrals. The original Cricsheet ZIP is not redistributed.

## Source-exception ledger (not automatically accepted)

| Exception | Observed records | Handling |
|---|---:|---|
| Retired-out | 24 | Conditional dead-ball retirement after independently confirmed chronology |
| Abnormal No-ball extras | 21 | Unresolved pending attribution; one automatic No-ball run under MCC Law 21 |
| Penalties | 11 | Conditional five-run administrative award with umpire approval/reason |
| Free-hit prohibited dismissals | 5 | Reject; source chronology/playing conditions need review |
| Multiple wickets in one delivery | 4 | Require separate event ordering; no automatic double wicket |
| Wide plus hit wicket | 2 | Existing scorer supports if adjudicated ends/field facts supplied |
| Boundary and run-out conflict | 2 | Require boundary/overthrow/dismissal timing evidence |
| **Total** | **69** | **0 automatically adjudicated** |

The versioned research contract enables certain cases if independent legal/umpire evidence is available. It does **not** make 69/69 deliveries fit the normal production scorer or provide a full-coverage empirical joint outcome model.

## Executed test gates

| Gate | Actual outcome |
|---|---|
| Main TypeScript tests excluding slow suites | PASS, **509/509** across 27 files |
| Red-ball suites | PASS, **19/19** across 2 files |
| Season persistence suite | PASS, **10/10** |
| **All TypeScript unit tests** | **PASS, 538/538** total, sharded (30 files) |
| Complete M7 Python research tests, including M7J tests | PASS, **72/72** |
| Focused M7J TS / Python suites | PASS, **12/12** TypeScript and **5/5** Python (included in totals) |
| Generated strict JSON schemas and AJV | PASS, **167**, up from 163 (four additive) |
| Production build/typecheck/lint/package boundaries | PASS |
| Scoring fixture comparison | PASS, 45 positive scorer and ledger cases, 29 invalid rejected |
| RNG/state hash vectors | PASS, 24 RNG addresses, 8 state hashes |
| Probability/lookup/generator vectors | PASS |
| Full season headless acceptance | PASS, 14 rounds, 56/56 fixtures, 14 managed fixtures, 42 off-screen, 56 condition applications |
| Season resume, export/import and archive | PASS, deterministic continuation/roundtrip, 57th result rejected |
| Chromium browser navigation | **BLOCKED**, `ERR_BLOCKED_BY_ADMINISTRATOR` before JS execution |
| Empirical candidate promotion | **NOT APPROVED**, rare-event and player/tactical validation outstanding |
| New independent final holdout cohort | NOT AVAILABLE |
| Authorised human M3 acceptance / browser save verification | PENDING |
| Reference-hardware performance gate | NOT MEASURED |

## Source compatibility

Frozen production scoring, scoring validator, original event contracts, match engines (T20/ODI/red-ball), random service, probability packs, existing generator and persistence implementations were not modified. No existing event/save schema changed. Four new versioned research contracts and a separate pure domain adjudication utility were added through research-only subpath exports. The standard production barrels remain unchanged. The Vite HTML script and preload asset hashes match the prior M7I build. Earlier test assertions were updated to recognise 167 strict schemas, preserving exact schema-set checking.

Baseline cleanly restored and all changes committed. New source commit is reproducible through the accompanying Git bundle. The playable build is unchanged in outcome behaviour; it retains the established `SYNTHETIC_ALPHA` model and historical save compatibility.

## Product decision and next pass

**M7J is complete only as a bounded research-law integration pass, not M7 overall.** Next: M7K requires independent field/umpire/playing-condition adjudications, then a new versioned match-event/innings-ledger stream including administrative incidents, unique reproducible replay migration policies and finally the empirical joint model with a new untouched holdout. No auto-correction of anomalous Cricsheet cases. M6 browser verification remains blocked by this execution host; M3 human acceptance and reference-hardware performance still need separate evidence.

Official law evidence: MCC 2026 Laws https://www.lords.org/getmedia/a4ef9f77-2a25-4f5b-a286-4601f08e6334/Laws-of-Cricket-2017-Code-4th-Edition-%282026%29_5.pdf ; MCC Law 21 and Law 18, https://www.lords.org/mcc/the-laws-of-cricket/no-ball and https://www.lords.org/mcc/the-laws-of-cricket/scoring-runs . Cricsheet https://cricsheet.org/ data subject to ODC-By https://cricsheet.org/licensing/ .
