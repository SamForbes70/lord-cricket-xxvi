# ADR-032: M7J versioned exceptional-event adjudication, not gameplay promotion

Status: ACCEPTED FOR RESEARCH ONLY. 16 October 2026.

## Authority and baseline

Frozen source commit: `bc5588831f2e9300c9063a047209544013c6e62b` (Pass 21 / M7I). All inherited scoring, match, RNG, probability, existing schemas and archive/save logic remain byte-identical.

M7I classified 69 Cricsheet exception rows, 36 first innings and 33 second innings. Its source archive and source-level hashes are retained separately from licence-restricted full match data. These exception rows are **observations**, not umpire adjudications or valid `DeliveryResolution` events.

The authoritative MCC 2026 Laws distinguish:

- Law 21.15 and 21.16: a no-ball brings **one** automatic run; recorded aggregate `noballs: 2` or `5` requires independent attribution, not interpretation as multiple mandatory penalties.
- Law 25.4: a batter retires **when the ball is dead**. A final retired-out is not a bowler's wicket. Illness/injury retirements are not automatically out. Return/resumption permissions require separate handling.
- Law 41.17 and Law 18.6: five-run penalties are awarded at the dead ball; they belong to the specified side without automatic batter/bowler attribution or changing ends.
- Law 20.1.1.3: a wicket makes the ball dead at the instant of the dismissal. Multiple wicket descriptions in one JSON delivery require independent chronological verification.
- Laws 18.8, 19.8 and 20: boundaries, overthrows and dismissals depend on sequence; run out + boundary cannot be automatically double-credited.

Official references: https://www.lords.org/getmedia/a4ef9f77-2a25-4f5b-a286-4601f08e6334/Laws-of-Cricket-2017-Code-4th-Edition-%282026%29_5.pdf ; https://www.lords.org/mcc/the-laws-of-cricket/no-ball?aliaspath=%2FMCC%2FThe-Laws-of-Cricket%2FNo-ball ; https://www.lords.org/mcc/the-laws-of-cricket/scoring-runs?aliaspath=%2FMCC%2FThe-Laws-of-Cricket%2FScoring-runs . Specific playing conditions may supersede the generic law and must be identified for any event.

## Decision

1. Add **four additive JSON schemas** (`M7JExceptionalCommand`, `M7JAdjudicationRequest`, `M7JAdminEvent`, `M7JAdjudicationResult`) with explicit contract version `LC_T20_EXCEPTION_ADJUDICATION_RESEARCH_V2`.
   Expose them only through the optional `@lcxxvi/contracts/m7j` and `@lcxxvi/domain/m7j` subpath entrypoints, not the production barrels. The schema generator discovers the research module explicitly. This leaves the compiled playable application asset hashes unchanged.
2. Route ordinary deliveries through the frozen `scoreDelivery()` + `reduceScoringBoundary()`; never implement another normal-delivery scorer.
3. Model five-run penalties and administrative retirements as typed, explicitly confirmed dead-ball commands. Penalties cannot debit the bowler or consume a ball. A fielding-side award is a *separate pending allocation*, never appended to the current batting side. A retired-out may increment the wicket count but never gives bowler credit. Retired-not-out does not increment wickets.
4. Require independent adjudication and chronology confirmation before applying these commands; an exception-register entry alone does **not** fulfil that requirement. The API performs strict structural checks but cannot itself authenticate an umpire's signal.
5. Support wide + hit wicket through the existing scorer after missing context/end attribution has been adjudicated; no normative rules change is needed.
6. Keep unexplained multi-no-ball extras, prohibited free-hit dismissals, simultaneous double dismissals, and boundary + run out sequences marked unresolved. **No default repair or automatic acceptance.**
7. The new research result includes `gameplayIntegrationPermitted=false`; no match worker, probability generator, deterministic vector, existing schema, save, or career is modified.

## Tests and remaining gates

Independent hand-authored fixtures cover batting and fielding five-run penalties, administration after a legal ball, two kinds of retirement, a legitimate wide hit wicket, post-dead retirement after a separately certified ordinary wicket, free-hit masks, duplicate commands, overflow, closure and invalid attribution. Complete 69-row input audit emits source hashes, counts, dispositions and `autoApproved=false` for every row. The evidence remains honest about exceptions which are only conditionally representable.

**This does not establish 69/69 legal scorer support.** An accepted gameplay rules v2 will require adjudicated representative Cricsheet source fixtures, safe migration/replay policy, independent laws review, fully integrated innings ledger and event stream, unknown cause/effect resolution, player/tactic validation, a new independent forward-time cohort, and browser/human acceptance. Until then synthetic-alpha-01 retains ownership of playable games and historical saves.

Cricsheet attribution: https://cricsheet.org/ ; ODC-By 1.0 https://cricsheet.org/licensing/ . No original match archive redistributed.
